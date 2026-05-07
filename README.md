# terminal-assistant

CLI TypeScript che usa OpenRouter per rispondere a domande pratiche sul terminale.

## Setup

1. Crea `.env` partendo da `.env.example` e inserisci `OPENROUTER_API_KEY`.
2. Installa le dipendenze:

```sh
pnpm install
```

3. Compila e collega il comando:

```sh
pnpm run link:global
```

4. Aggiungi l'alias al tuo shell, per esempio in `~/.zshrc`:

```sh
alias '?'='terminal-assistant'
```

## Uso

```sh
? come trovo i file piu grandi in questa cartella
? --model openai/gpt-5.2 come annullo l'ultimo commit
? -- come uso find con il flag --name
```

Il modello predefinito e' `openrouter/auto`. Puoi cambiarlo con `OPENROUTER_MODEL` o con `--model`.
