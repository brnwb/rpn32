#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { argv, stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline";
import { AngleMode, RpnCalculator, RpnError, formatStack, processLine } from "@brnwb/rpn32-core";

type ReplInterface = ReturnType<typeof createInterface> & { history: string[] };

const HISTORY_SIZE = 1000;

const HELP = `rpn32 — an HP 32SII-inspired RPN calculator

Usage:
  rpn32                 start interactive REPL
  rpn32 '3 2 +'        evaluate one quoted RPN expression
  echo '3 2 +' | rpn32 evaluate piped input
  rpn32 --help         show this help
  rpn32 --version      show version

REPL commands:
  numbers         push values onto the stack, e.g. 3 2 +
  + - * / ^       arithmetic
  sqrt sq ! fact mod abs int frac floor ceil rnd round
  sin cos tan ln log exp chs 1/x
  deg rad         set trigonometry angle mode
  enter           duplicate X with HP-style ENTER behavior
  lastx           recall the previous X value
  swap            swap X and Y
  drop clx        drop/clear X
  clear           clear the stack
  fix n           show n digits after the decimal point
  sci n           show scientific notation with n decimal places
  eng n           show engineering notation with n decimal places
  all             show compact 12-digit display
  stack           show all stack registers after each entry
  stack off       return to compact display
  help            show this help
  quit            leave

You can enter a whole expression on one line: 3 2 +
Or use it like a calculator: enter 3, then 2, then + on separate prompts.`;

export async function main(args: string[] = argv.slice(2)): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  if (args.includes("--version") || args.includes("-v")) {
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
  const calc = new RpnCalculator();
  try {
    processLine(calc, expression);
    console.log(formatStack(calc.stack, calc.display));
  } catch (error) {
    console.error(formatError(error));
    process.exitCode = 1;
  }
}

async function runRepl(): Promise<void> {
  const calc = new RpnCalculator();
  let fullStackDisplay = false;
  const repl = createInterface({
    input,
    output,
    prompt: promptFor(calc),
    historySize: HISTORY_SIZE,
    removeHistoryDuplicates: true,
  }) as ReplInterface;

  console.log("rpn32 — type 'help' for commands, 'quit' to exit");
  console.log(formatStack(calc.stack, calc.display, { full: fullStackDisplay }));
  prompt(repl, calc);

  for await (const line of repl) {
    const command = line.trim().toLowerCase();

    if (!command) {
      console.log(formatStack(calc.stack, calc.display, { full: fullStackDisplay }));
      prompt(repl, calc);
      continue;
    }
    if (command === "quit") break;
    if (command === "help") {
      console.log(HELP);
      prompt(repl, calc);
      continue;
    }
    if (command === "stack") {
      fullStackDisplay = true;
      console.log(formatStack(calc.stack, calc.display, { full: true }));
      prompt(repl, calc);
      continue;
    }
    if (command === "stack off") {
      fullStackDisplay = false;
      console.log(formatStack(calc.stack, calc.display, { full: false }));
      prompt(repl, calc);
      continue;
    }

    try {
      processLine(calc, line);
    } catch (error) {
      console.log(formatError(error));
    }

    console.log(formatStack(calc.stack, calc.display, { full: fullStackDisplay }));
    prompt(repl, calc);
  }

  repl.close();
}

function formatError(error: unknown): string {
  if (error instanceof RpnError) return `error: ${error.message}`;
  if (error instanceof Error) return `math error: ${error.message}`;
  return `math error: ${String(error)}`;
}

function prompt(repl: ReplInterface, calc: RpnCalculator): void {
  repl.setPrompt(promptFor(calc));
  repl.prompt();
}

function promptFor(calc: RpnCalculator): string {
  return calc.angleMode === AngleMode.Rad ? "rpn(rad)> " : "rpn> ";
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
