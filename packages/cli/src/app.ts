import { createInterface } from "node:readline";
import { RpnCalculator, processLine } from "@brnwb/rpn32-core";
import { HELP } from "./help.js";
import { formatCalculatorStack, formatError, formatEvent, promptFor } from "./rendering.js";
import { parseReplInput } from "./session.js";

type ReplInterface = ReturnType<typeof createInterface>;

const HISTORY_SIZE = 1000;

export interface CliInput extends AsyncIterable<string> {
  readonly isTTY?: boolean;
  setEncoding(encoding: BufferEncoding): void;
}

export interface CliOutput {
  write(text: string): unknown;
}

export interface CliEnvironment {
  readonly input: CliInput;
  readonly output: CliOutput;
  readonly error: CliOutput;
  readonly version: string;
  setExitCode(code: number): void;
}

export async function runCli(args: readonly string[], environment: CliEnvironment): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    writeLine(environment.output, HELP);
    return;
  }

  if (args.includes("--version") || args.includes("-v")) {
    writeLine(environment.output, environment.version);
    return;
  }

  if (args.length === 1) {
    runExpression(args[0] ?? "", environment);
    return;
  }

  if (args.length > 1) {
    writeLine(environment.error, "error: expression must be provided as a single quoted argument");
    writeLine(environment.error, "usage: rpn32 '3 2 +'");
    environment.setExitCode(1);
    return;
  }

  if (environment.input.isTTY !== true) {
    runExpression(await readStdin(environment.input), environment);
    return;
  }

  await runRepl(environment);
}

function runExpression(expression: string, environment: CliEnvironment): void {
  const calc = new RpnCalculator();
  try {
    const result = processLine(calc, expression);
    const view = calc.view();
    if (result.events.length > 0) {
      for (const event of result.events) writeLine(environment.output, formatEvent(event));
    } else {
      writeLine(environment.output, formatCalculatorStack(view));
    }
  } catch (error) {
    writeLine(environment.error, formatError(error));
    environment.setExitCode(1);
  }
}

async function runRepl(environment: CliEnvironment): Promise<void> {
  const calc = new RpnCalculator();
  let fullStackDisplay = false;
  const repl = createInterface({
    input: environment.input as NodeJS.ReadableStream,
    output: environment.output as NodeJS.WritableStream,
    prompt: promptFor(calc.view()),
    historySize: HISTORY_SIZE,
    removeHistoryDuplicates: true,
  });

  writeLine(environment.output, "rpn32 — type 'help' for commands, 'quit' to exit");
  writeLine(environment.output, formatCalculatorStack(calc.view(), fullStackDisplay));
  prompt(repl, calc);

  for await (const line of repl) {
    const input = parseReplInput(line);
    if (input.type === "quit") break;
    if (input.type === "help") {
      writeLine(environment.output, HELP);
      prompt(repl, calc);
      continue;
    }
    if (input.type === "stack") {
      fullStackDisplay = input.full;
      writeLine(environment.output, formatCalculatorStack(calc.view(), fullStackDisplay));
      prompt(repl, calc);
      continue;
    }
    if (input.type === "empty") {
      writeLine(environment.output, formatCalculatorStack(calc.view(), fullStackDisplay));
      prompt(repl, calc);
      continue;
    }

    try {
      const result = processLine(calc, input.source);
      for (const event of result.events) writeLine(environment.output, formatEvent(event));
    } catch (error) {
      writeLine(environment.output, formatError(error));
    }

    writeLine(environment.output, formatCalculatorStack(calc.view(), fullStackDisplay));
    prompt(repl, calc);
  }

  repl.close();
}

function prompt(repl: ReplInterface, calc: RpnCalculator): void {
  repl.setPrompt(promptFor(calc.view()));
  repl.prompt();
}

async function readStdin(input: CliInput): Promise<string> {
  input.setEncoding("utf8");
  let contents = "";
  for await (const chunk of input) contents += chunk;
  return contents;
}

function writeLine(output: CliOutput, text: string): void {
  output.write(`${text}\n`);
}
