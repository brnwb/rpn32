# @brnwb/rpn32-core

Reusable calculator engine for `rpn32`, a terminal RPN calculator inspired by the HP 32SII.

This package contains calculator state, command processing, decimal math, display formatting, angle modes, and HP-style four-level stack behavior. It has no Node terminal/readline dependencies and no runtime npm dependencies.

Decimal arithmetic is powered by a vendored, unmodified copy of `decimal.js` v10.6.0 under `src/vendor/decimal.js`, including its upstream MIT license.

## API

```ts
import { RpnCalculator, formatStack, numberValue, processLine } from "@brnwb/rpn32-core";

const calculator = new RpnCalculator();
calculator.pushNumber(numberValue("0.1"));
const result = processLine(calculator, "0.2 +");
const view = calculator.view();

console.log(formatStack(view.stack, view.display, { baseMode: view.baseMode }));
// 0.3

for (const event of result.events) {
  // Handle structured output from commands such as `view` and `vars`.
}
```

Use decimal strings with `numberValue` when the input must remain exact. Calculator views are defensive, read-only snapshots. Invalid input and math operations throw `RpnError`, whose `code` property provides a stable machine-readable category.

The vendored `Decimal` constructor and numeric implementation helpers are intentionally not part of the package facade.

## Migrating from 0.3

- Use `numberValue(input)` to construct values passed to `pushNumber`.
- Read cohesive calculator state through `calculator.view()`.
- Read command output from the `ExecutionResult.events` returned by `processLine` or `processTokens`; the calculator no longer retains a mutable message queue.
- Use `RpnError.code` instead of parsing error messages.
- `processToken`, `StackUnderflowError`, and low-level parsing/base/fraction helpers are no longer public exports.
