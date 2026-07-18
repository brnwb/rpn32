#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { argv, stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline";
import { CalculatorSession, HELP, formatError } from "./session.js";

type ReplInterface = ReturnType<typeof createInterface> & { history: string[] };

const HISTORY_SIZE = 1000;

async function main(args: string[] = argv.slice(2)): Promise<void> {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(HELP);
    return;
  }

  if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
    console.log(readVersion());
    return;
  }

  if (args.length === 1) {
    runExpression(args[0] ?? "");
    return;
  }

  if (args.length > 1) {
    console.error("error: expression must be provided as a single quoted argument");
    console.error("usage: rpn32 '3 2 +'");
    process.exitCode = 1;
    return;
  }

  if (!input.isTTY) {
    runExpression(await readStdin());
    return;
  }

  await runRepl();
}

function runExpression(expression: string): void {
  const result = new CalculatorSession().evaluate(expression);
  for (const line of result.lines) (result.error ? console.error : console.log)(line);
  if (result.error) {
    process.exitCode = 1;
  }
}

async function runRepl(): Promise<void> {
  const session = new CalculatorSession();
  const repl = createInterface({
    input,
    output,
    prompt: session.prompt,
    historySize: HISTORY_SIZE,
    removeHistoryDuplicates: true,
  }) as ReplInterface;

  console.log("rpn32 — type 'help' for commands, 'quit' to exit");
  console.log(session.stack());
  prompt(repl, session);

  for await (const line of repl) {
    const result = session.handleLine(line);
    if (result.quit) break;
    printMessages(result.lines);
    prompt(repl, session);
  }

  repl.close();
}

function printMessages(messages: string[]): void {
  for (const message of messages) console.log(message);
}

function prompt(repl: ReplInterface, session: CalculatorSession): void {
  repl.setPrompt(session.prompt);
  repl.prompt();
}

async function readStdin(): Promise<string> {
  input.setEncoding("utf8");
  let contents = "";
  for await (const chunk of input) {
    contents += chunk;
  }
  return contents;
}

function readVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return packageJson.version;
}

main().catch((error: unknown) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
