#!/usr/bin/env node
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline";
import { AngleMode, RpnCalculator, RpnError, formatStack, processLine } from "@rpn32/core";

const HELP = `Commands:
  numbers         push values onto the stack, e.g. 3 2 +
  + - * / ^       arithmetic
  sqrt sq !/fact sin cos tan ln log exp chs 1/x
  deg/rad         set trigonometry angle mode
  enter/dup       duplicate X
  lastx           recall the previous X value
  swap/xy         swap X and Y
  drop/clx        drop X
  clear/clr       clear the stack
  fix n           show n digits after the decimal point
  sci n           show scientific notation with n decimal places
  eng n           show engineering notation with n decimal places
  all             show compact 12-digit display
  stack/on/full   always show all stack registers
  stack off       return to compact stack display
  help            show this help
  quit/exit/q     leave

You can enter a whole expression on one line: 3 2 +
Or use it like a calculator: enter 3, then 2, then + on separate prompts.`;

export async function main(): Promise<void> {
  const calc = new RpnCalculator();
  let fullStackDisplay = false;
  const repl = createInterface({ input, output, prompt: promptFor(calc) });

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
    if (command === "quit" || command === "exit" || command === "q") break;
    if (command === "help" || command === "?") {
      console.log(HELP);
      prompt(repl, calc);
      continue;
    }
    if (command === "stack" || command === "stack on" || command === "stack full") {
      fullStackDisplay = true;
      console.log(formatStack(calc.stack, calc.display, { full: true }));
      prompt(repl, calc);
      continue;
    }
    if (command === "stack off" || command === "stack compact") {
      fullStackDisplay = false;
      console.log(formatStack(calc.stack, calc.display, { full: false }));
      prompt(repl, calc);
      continue;
    }

    try {
      processLine(calc, line);
    } catch (error) {
      if (error instanceof RpnError) {
        console.log(`error: ${error.message}`);
      } else if (error instanceof Error) {
        console.log(`math error: ${error.message}`);
      } else {
        console.log(`math error: ${String(error)}`);
      }
    }

    console.log(formatStack(calc.stack, calc.display, { full: fullStackDisplay }));
    prompt(repl, calc);
  }

  repl.close();
}

function prompt(repl: ReturnType<typeof createInterface>, calc: RpnCalculator): void {
  repl.setPrompt(promptFor(calc));
  repl.prompt();
}

function promptFor(calc: RpnCalculator): string {
  return calc.angleMode === AngleMode.Rad ? "rpn(rad)> " : "rpn> ";
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
