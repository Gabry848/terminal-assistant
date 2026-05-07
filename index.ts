#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { main } from "./src/cli.js";

loadEnv();

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Errore: ${message}`);
  process.exitCode = 1;
});

function loadEnv(): void {
  config({ quiet: true });

  const entryFile = realpathSync(fileURLToPath(import.meta.url));
  const entryDir = dirname(entryFile);
  const projectRoot = basename(entryDir) === "dist" ? dirname(entryDir) : entryDir;
  const projectEnv = join(projectRoot, ".env");

  if (existsSync(projectEnv)) {
    config({ path: projectEnv, quiet: true });
  }
}
