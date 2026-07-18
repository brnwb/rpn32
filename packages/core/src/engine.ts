import {
  AngleMode,
  BaseMode,
  CalculatorMachine,
  type DisplaySettings,
  type NumberValue,
  type OutputEvent,
} from "./calculator.js";
import { processLine } from "./commands.js";
import { Decimal } from "./vendor/decimal.js/decimal.mjs";

export interface CalculatorState {
  readonly stack: readonly [NumberValue, NumberValue, NumberValue, NumberValue];
  readonly lastX: NumberValue;
  readonly display: Readonly<{
    mode: DisplaySettings["mode"];
    digits: number;
    fraction: Readonly<{ enabled: boolean; maxDenominator: number }>;
  }>;
  readonly angleMode: AngleMode;
  readonly baseMode: BaseMode;
  readonly variables: ReadonlyMap<string, NumberValue>;
}

export interface ExecutionResult {
  readonly outputs: readonly OutputEvent[];
  readonly state: CalculatorState;
}

export class RpnCalculator {
  readonly #machine = new CalculatorMachine();

  get state(): CalculatorState {
    const machine = this.#machine;
    return {
      stack: machine.stack.map(cloneNumber) as [NumberValue, NumberValue, NumberValue, NumberValue],
      lastX: cloneNumber(machine.lastX),
      display: {
        mode: machine.display.mode,
        digits: machine.display.digits,
        fraction: { ...machine.display.fraction },
      },
      angleMode: machine.angleMode,
      baseMode: machine.baseMode,
      variables: new Map(
        [...machine.variables].map(([name, value]) => [name, cloneNumber(value)] as const),
      ),
    };
  }

  execute(expression: string): ExecutionResult {
    const snapshot = this.#machine.takeSnapshot();
    this.#machine.outputs = [];
    try {
      processLine(this.#machine, expression);
      const outputs = this.#machine.outputs.map(cloneOutput);
      this.#machine.outputs = [];
      return { outputs, state: this.state };
    } catch (error) {
      this.#machine.restoreSnapshot(snapshot);
      throw error;
    }
  }
}

function cloneNumber(value: NumberValue): NumberValue {
  return new Decimal(value);
}

function cloneOutput(output: OutputEvent): OutputEvent {
  if (output.type === "empty-variables") return { type: output.type };
  return { ...output, value: cloneNumber(output.value) };
}
