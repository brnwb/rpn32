import {
  type CalculatorView,
  type CommandEvent,
  RpnCalculator,
  type RpnErrorCode,
  formatStack,
  numberValue,
  processLine,
} from "@brnwb/rpn32-core";

const calculator = new RpnCalculator();
calculator.pushNumber(numberValue("0.1"));
const result = processLine(calculator, "0.2 +");
const view: CalculatorView = calculator.view();
const events: readonly CommandEvent[] = result.events;
const errorCode: RpnErrorCode = "divide_by_zero";

formatStack(view.stack, view.display, { baseMode: view.baseMode });
void events;
void errorCode;

// @ts-expect-error Calculator views expose a read-only stack.
view.stack[3] = numberValue(4);
// @ts-expect-error Calculator views expose read-only display settings.
view.display.digits = 4;
// @ts-expect-error Decimal is intentionally not part of the package facade.
void import("@brnwb/rpn32-core/dist/vendor/decimal.js/decimal.mjs");
