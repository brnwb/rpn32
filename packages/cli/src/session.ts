import {
  AngleMode,
  BaseMode,
  RpnCalculator,
  RpnError,
  formatStack,
  type OutputEvent,
} from "@brnwb/rpn32-core";

export const HELP = `rpn32 — an HP 32SII-inspired RPN calculator

Usage:
  rpn32                 start interactive REPL
  rpn32 '3 2 +'        evaluate one quoted RPN expression
  echo '3 2 +' | rpn32 evaluate piped input
  rpn32 --help         show this help
  rpn32 --version      show version

REPL commands:
  numbers         push values onto the stack, e.g. 3 2 +
  fractions       enter n/d as n..d or i n/d as i.n.d
  + - * / ^       arithmetic
  sqrt sq ! fact mod abs int fpart floor ceil rnd round
  sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh
  ln log exp chs 1/x
  deg rad grad    set trigonometry angle mode
  dec hex oct bin set integer base mode for input and display
  enter           duplicate X with HP-style ENTER behavior
  lastx           recall the previous X value
  sto A / rcl A   store or recall variables A through Z and i
  view A / vars   view one variable or list stored variables
  swap            swap X and Y
  drop clx        drop/clear X
  clear           clear the stack
  clear var       clear all variables
  clear all       clear stack, lastx, and variables
  fix n           show n digits after the decimal point
  sci n           show scientific notation with n decimal places
  eng n           show engineering notation with n decimal places
  frac [n]        toggle fraction display, or set max denominator n
  all             show compact 12-digit display
  stack           show all stack registers after each entry
  stack off       return to compact display
  help            show this help
  quit            leave

You can enter a whole expression on one line: 3 2 +
Or use it like a calculator: enter 3, then 2, then + on separate prompts.`;

export interface SessionResult {
  quit: boolean;
  lines: string[];
  error?: boolean;
}

export class CalculatorSession {
  readonly #calculator = new RpnCalculator();
  #fullStackDisplay = false;

  get prompt(): string {
    const { angleMode, baseMode } = this.#calculator.state;
    const baseLabel = baseMode === BaseMode.Dec ? "" : `/${baseMode}`;
    if (angleMode === AngleMode.Rad) return `rpn(rad${baseLabel})> `;
    if (angleMode === AngleMode.Grad) return `rpn(grad${baseLabel})> `;
    return baseLabel === "" ? "rpn> " : `rpn(${baseMode})> `;
  }

  stack(): string {
    const state = this.#calculator.state;
    return formatStack(state.stack, state.display, {
      baseMode: state.baseMode,
      full: this.#fullStackDisplay,
    });
  }

  evaluate(expression: string): SessionResult {
    try {
      const result = this.#calculator.execute(expression);
      const lines = result.outputs.map(renderOutput);
      return { quit: false, lines: lines.length > 0 ? lines : [this.stack()] };
    } catch (error) {
      return { quit: false, lines: [formatError(error)], error: true };
    }
  }

  handleLine(line: string): SessionResult {
    const command = line.trim().toLowerCase();
    if (!command) return { quit: false, lines: [this.stack()] };
    if (command === "quit") return { quit: true, lines: [] };
    if (command === "help") return { quit: false, lines: [HELP] };
    if (command === "stack" || command === "stack off") {
      this.#fullStackDisplay = command === "stack";
      return { quit: false, lines: [this.stack()] };
    }

    const lines: string[] = [];
    try {
      lines.push(...this.#calculator.execute(line).outputs.map(renderOutput));
    } catch (error) {
      lines.push(formatError(error));
    }
    lines.push(this.stack());
    return { quit: false, lines };
  }
}

function renderOutput(output: OutputEvent): string {
  if (output.type === "empty-variables") return "no variables";
  const name = output.name === "i" ? output.name : output.name.toUpperCase();
  return `${name}: ${output.value.toString()}`;
}

export function formatError(error: unknown): string {
  if (error instanceof RpnError) return `error: ${error.message}`;
  if (error instanceof Error) return `math error: ${error.message}`;
  return `math error: ${String(error)}`;
}
