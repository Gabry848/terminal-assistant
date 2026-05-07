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

## Usage

```sh
? how do I find the largest files in this directory
? --model openai/gpt-5.2 how do I undo the last commit
? -- how do I use find with the --name flag
```

The default model is `openrouter/auto`. You can change it using the `OPENROUTER_MODEL` environment variable or with the `--model` flag.
