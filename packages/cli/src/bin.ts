#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { argv, stderr, stdin, stdout } from "node:process";
import { runCli } from "./app.js";
import { formatError } from "./rendering.js";

function readVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return packageJson.version;
}

const args = argv.slice(2);

runCli(args, {
  input: stdin,
  output: stdout,
  error: stderr,
  version: args.includes("--version") || args.includes("-v") ? readVersion() : "",
  setExitCode(code) {
    process.exitCode = code;
  },
}).catch((error: unknown) => {
  stderr.write(`${formatError(error)}\n`);
  process.exitCode = 1;
});
