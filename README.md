# terminal-assistant

A TypeScript CLI that uses OpenRouter to answer practical terminal questions.

## Setup

1. Create `.env` from `.env.example` and insert your `OPENROUTER_API_KEY`.
2. Install dependencies:

```sh
pnpm install
```

3. Build and link the command:

```sh
pnpm run link:global
```

4. Add the alias to your shell, for example in `~/.zshrc`:

```sh
alias '?'='terminal-assistant'
```

## Help

Get help for all available commands and options:

```sh
# Any of these work:
?
? help
? --help
? -h
```

## Usage

Ask a standalone question
```
? how do I find the largest files in this directory
```
Follow up on the previous question
```
? -f and how do I delete them in bulk?
```
Copy the generated command to clipboard Automatically
```
? -c check the size of the current folder
```

Pipe error logs into the assistant for explanation
```
npm run build 2>&1 | ? why is this failing?
```

Generate raw command to be piped/evaluated
```
eval $(? --raw extract this tar.gz file)
```

Use a specific OpenRouter model
```
? --model openai/gpt-5.2 how do I undo the last commit
```

Ignore other flags
```
? -- how do I use find with the --name flag
```


The default model is `openrouter/auto`. You can change it using the `OPENROUTER_MODEL` environment variable or with the `--model` flag.
