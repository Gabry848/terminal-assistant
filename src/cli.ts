import { arch, platform, release, type } from "node:os";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import clipboardy from "clipboardy";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openrouter/auto";
const VERSION = "1.0.0";
const HISTORY_FILE = join(process.env.HOME || process.env.USERPROFILE || "", ".terminal-assistant-history.json");

const ansi = {
  yellow: (value: string) => `\x1b[33m${value}\x1b[39m`,
  bold: (value: string) => `\x1b[1m${value}\x1b[22m`,
  italic: (value: string) => `\x1b[3m${value}\x1b[23m`,
  code: (value: string) => `\x1b[36m${value}\x1b[39m`,
};

type CliOptions = {
  model: string;
  stream: boolean;
  query: string;
  copy: boolean;
  raw: boolean;
  followUp: boolean;
};

type OpenRouterChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
    message?: {
      content?: string;
    };
  }>;
};

type Message = { role: string; content: string };

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }
  let result = "";
  for await (const chunk of process.stdin) {
    result += chunk;
  }
  return result;
}

export async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);

  const stdinContent = await readStdin();
  if (stdinContent) {
    options.query = options.query ? `${stdinContent}\n\n${options.query}` : stdinContent;
  }

  if (options.query.trim().toLowerCase() === "help") {
    printHelp();
    return;
  }

  if (!options.query && !options.followUp) {
    printHelp();
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "manca OPENROUTER_API_KEY. Crea un file .env o esporta la variabile nell'ambiente.",
    );
  }

  const controller = new AbortController();
  process.once("SIGINT", () => {
    controller.abort();
    process.stdout.write("\n");
  });

  await askOpenRouter({
    apiKey,
    model: options.model,
    query: options.query,
    stream: options.stream,
    copy: options.copy,
    raw: options.raw,
    followUp: options.followUp,
    signal: controller.signal,
  });
}

function parseArgs(argv: string[]): CliOptions {
  const queryParts: string[] = [];
  let model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  let stream = process.env.OPENROUTER_STREAM !== "false";
  let copy = false;
  let raw = false;
  let followUp = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      queryParts.push(...argv.slice(index + 1));
      break;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--version" || arg === "-v") {
      console.log(VERSION);
      process.exit(0);
    }

    if (arg === "--no-stream") {
      stream = false;
      continue;
    }

    if (arg === "--copy" || arg === "-c") {
      copy = true;
      continue;
    }
    
    if (arg === "--raw") {
      raw = true;
      stream = false;
      continue;
    }

    if (arg === "--follow-up" || arg === "-f") {
      followUp = true;
      continue;
    }

    if (arg === "--model" || arg === "-m") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("usa --model seguito da un model id OpenRouter.");
      }
      model = next;
      index += 1;
      continue;
    }

    queryParts.push(arg);
  }

  return {
    model,
    stream,
    copy,
    raw,
    followUp,
    query: queryParts.join(" ").trim(),
  };
}

function loadHistory(): Message[] {
  if (existsSync(HISTORY_FILE)) {
    try {
      return JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
    } catch {
      return [];
    }
  }
  return [];
}

function saveHistory(messages: Message[]): void {
  try {
    writeFileSync(HISTORY_FILE, JSON.stringify(messages, null, 2), "utf-8");
  } catch {
    //
  }
}

async function askOpenRouter(input: {
  apiKey: string;
  model: string;
  query: string;
  stream: boolean;
  copy: boolean;
  raw: boolean;
  followUp: boolean;
  signal: AbortSignal;
}): Promise<void> {
  
  let messages: Message[] = [];
  
  if (input.followUp) {
    messages = loadHistory();
  } else {
    messages.push({
      role: "system",
      content: buildSystemPrompt(),
    });
  }

  if (input.query) {
    messages.push({
      role: "user",
      content: input.query,
    });
  }

  const response = await fetch(API_URL, {
    method: "POST",
    signal: input.signal,
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://localhost",
      "X-Title": process.env.OPENROUTER_APP_NAME || "terminal-assistant",
    },
    body: JSON.stringify({
      model: input.model,
      stream: input.stream,
      temperature: 0.2,
      max_tokens: 550,
      messages: messages,
    }),
  });

  if (!response.ok) {
    throw new Error(await formatApiError(response));
  }

  let fullContent = "";

  if (!input.stream) {
    const data = (await response.json()) as OpenRouterChunk;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenRouter non ha restituito contenuto.");
    }
    fullContent = content;
  } else {
    fullContent = await streamAndCollect(response, input.raw);
  }

  messages.push({
    role: "assistant",
    content: fullContent,
  });
  saveHistory(messages);

  handlePostProcess(fullContent, input.copy, input.raw, input.stream);
}

function handlePostProcess(content: string, copy: boolean, raw: boolean, stream: boolean) {
  const codeBlocks = extractCodeBlocks(content);
  const codeToUse = codeBlocks.length > 0 ? codeBlocks[0] : content;

  if (copy) {
    clipboardy.writeSync(codeToUse);
    if (!raw && !stream) {
      console.log(ansi.italic(`\n(Comando copiato negli appunti)`));
    }
  }

  if (raw) {
     process.stdout.write(codeToUse + "\n");
  } else if (!stream) {
     process.stdout.write(`${renderTerminalMarkdown(content).trimEnd()}\n`);
  } else if (stream && copy) {
     console.log(ansi.italic(`\n(Comando copiato negli appunti)`));
  }
}

function extractCodeBlocks(content: string): string[] {
  const blocks: string[] = [];
  const regex = /^```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)^```/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
      blocks.push(match[1].trim());
  }
  return blocks;
}

function buildSystemPrompt(): string {
  const osName = getOperatingSystemName();

  return `Sei un assistente CLI esperto di terminale. Il sistema operativo dell'utente e': ${osName}. Adatta i comandi a questo sistema operativo quando possibile. Rispondi in italiano e sii molto stringato. Se l'utente chiede come fare un comando, rispondi con un solo blocco di codice shell contenente il comando, poi sotto 2 o 3 righe di spiegazione pratica. Aggiungi eventuali cose da sapere o variazioni solo se davvero utili. Se l'utente chiede una spiegazione, resta entro 5 righe salvo necessita' reale. Usa poco Markdown: solo blocchi di codice per comandi, **grassetto**, *corsivo* e \`inline code\` quando aiutano. Non usare titoli, tabelle, introduzioni lunghe, conclusioni generiche o liste lunghe. Segnala chiaramente comandi distruttivi o dipendenti dal sistema operativo.`;
}

function getOperatingSystemName(): string {
  const platformName = platform();
  const readableName =
    platformName === "darwin"
      ? "macOS"
      : platformName === "win32"
        ? "Windows"
        : platformName === "linux"
          ? "Linux"
          : type();

  return `${readableName} (${platformName}, ${arch()}, release ${release()})`;
}

async function streamAndCollect(response: Response, raw: boolean): Promise<string> {
  if (!response.body) {
    throw new Error("stream non disponibile nella risposta HTTP.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let markdownBuffer = "";
  let inCodeBlock = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const chunk = parseSseLine(line);
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        if (!raw) {
          markdownBuffer += delta;

          let newlineIndex = markdownBuffer.indexOf("\n");
          while (newlineIndex !== -1) {
            const rawLine = markdownBuffer.slice(0, newlineIndex).replace(/\r$/, "");
            markdownBuffer = markdownBuffer.slice(newlineIndex + 1);

            const renderedLine = renderMarkdownStreamLine(rawLine, inCodeBlock);
            inCodeBlock = renderedLine.inCodeBlock;
            if (renderedLine.line !== null) {
              process.stdout.write(`${renderedLine.line}\n`);
            }

            newlineIndex = markdownBuffer.indexOf("\n");
          }
        }
      }
    }
  }

  if (!raw && markdownBuffer.length > 0) {
    const renderedLine = renderMarkdownStreamLine(markdownBuffer.replace(/\r$/, ""), inCodeBlock);
    if (renderedLine.line !== null) {
      process.stdout.write(`${renderedLine.line}\n`);
    }
  }

  return fullContent;
}

function renderMarkdownStreamLine(rawLine: string, inCodeBlock: boolean): { line: string | null; inCodeBlock: boolean } {
  const fence = rawLine.trim().match(/^\s*```/);
  if (fence) {
    return { line: null, inCodeBlock: !inCodeBlock };
  }

  if (inCodeBlock) {
    return { line: `    ${ansi.yellow(rawLine)}`, inCodeBlock };
  }

  const heading = rawLine.match(/^\s{0,3}#{1,6}\s+(.+)$/);
  if (heading) {
    return { line: ansi.bold(renderInlineMarkdown(heading[1])), inCodeBlock };
  }

  const unordered = rawLine.match(/^(\s*)[-*+]\s+(.+)$/);
  if (unordered) {
    return { line: `${unordered[1]}* ${renderInlineMarkdown(unordered[2])}`, inCodeBlock };
  }

  const ordered = rawLine.match(/^(\s*)\d+[.)]\s+(.+)$/);
  if (ordered) {
    return { line: `${ordered[1]}1. ${renderInlineMarkdown(ordered[2])}`, inCodeBlock };
  }

  return { line: renderInlineMarkdown(rawLine), inCodeBlock };
}

export function renderTerminalMarkdown(content: string): string {
  const output: string[] = [];
  let inCodeBlock = false;

  for (const rawLine of content.trim().split(/\r?\n/)) {
    const fence = rawLine.trim().match(/^\s*```/);
    if (fence) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      output.push(`    ${ansi.yellow(rawLine)}`);
      continue;
    }

    const heading = rawLine.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (heading) {
      output.push(ansi.bold(renderInlineMarkdown(heading[1])));
      continue;
    }

    const unordered = rawLine.match(/^(\s*)[-*+]\s+(.+)$/);
    if (unordered) {
      output.push(`${unordered[1]}* ${renderInlineMarkdown(unordered[2])}`);
      continue;
    }

    const ordered = rawLine.match(/^(\s*)\d+[.)]\s+(.+)$/);
    if (ordered) {
      output.push(`${ordered[1]}1. ${renderInlineMarkdown(ordered[2])}`);
      continue;
    }

    output.push(renderInlineMarkdown(rawLine));
  }

  return output.join("\n");
}

function renderInlineMarkdown(value: string): string {
  const codeSpans: string[] = [];
  const withPlaceholders = value.replace(/`([^`]+)`/g, (_match, code: string) => {
    const index = codeSpans.push(ansi.code(code)) - 1;
    return `\u0000CODE_${index}\u0000`;
  });

  const styled = withPlaceholders
    .replace(/\*\*(.+?)\*\*/g, (_match, text: string) => ansi.bold(text))
    .replace(/__(.+?)__/g, (_match, text: string) => ansi.bold(text))
    .replace(/(^|[^\w*])\*(?!\s)([^*]+?)(?<!\s)\*/g, (_match, prefix: string, text: string) => {
      return `${prefix}${ansi.italic(text)}`;
    })
    .replace(/(^|[^\w_])_(?!\s)([^_]+?)(?<!\s)_/g, (_match, prefix: string, text: string) => {
      return `${prefix}${ansi.italic(text)}`;
    });

  return styled.replace(/\u0000CODE_(\d+)\u0000/g, (_match, index: string) => {
    return codeSpans[Number(index)] || "";
  });
}

function parseSseLine(line: string): OpenRouterChunk | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return null;
  }

  const data = trimmed.slice("data:".length).trim();
  if (!data || data === "[DONE]") {
    return null;
  }

  try {
    return JSON.parse(data) as OpenRouterChunk;
  } catch {
    return null;
  }
}

async function formatApiError(response: Response): Promise<string> {
  const body = await response.text();
  if (!body) {
    return `OpenRouter ha risposto con HTTP ${response.status}.`;
  }

  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message || `OpenRouter ha risposto con HTTP ${response.status}.`;
  } catch {
    return `OpenRouter ha risposto con HTTP ${response.status}: ${body}`;
  }
}

function printHelp(): void {
  const title = ansi.bold(ansi.yellow("Terminal Assistant - Il tuo aiutante AI nel terminale"));
  const desc = "Un CLI tool che usa l'AI er generare e comprendere comandi, risolvere errori e assisterti nel terminale, supportando lo streaming e la documentazione del contesto di sistema.";

  console.log(`
${title}
${desc}

${ansi.bold("Come Funziona:")}
  L'assistente ti fornisce risposte immediate, analizza log o errori tramite la pipe (stdin) e può
  tenere memoria delle conversazioni precedenti per darti contesto nei comandi successivi.

${ansi.bold("Uso:")}
  ? come trovo i file piu grandi in questa cartella
  ? --model openai/gpt-4o come faccio un revert dell'ultimo commit
  npm run build 2>&1 | ? analizza questo log d'errore
  ? follow-up "e invece per i file piu piccoli?"

${ansi.bold("Config:")}
  OPENROUTER_API_KEY   obbligatoria
  OPENROUTER_MODEL     opzionale, default: ${DEFAULT_MODEL}

${ansi.bold("Opzioni:")}
  -m, --model <id>     scegli un modello OpenRouter overriding the default
  -c, --copy           copia il codice suggerito negli appunti
  -f, --follow-up      continua la conversazione precedente
  --raw                stampa solo l'ultimo comando crudo (es. per pipe/eval)
  --no-stream          stampa la risposta solo quando e' completa
  --                   tutto quello che segue viene trattato come query
  -h, --help           mostra questo aiuto
  -v, --version        mostra la versione`);
}