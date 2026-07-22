# @brnwb/rpn32-core

Reusable calculator engine for `rpn32`, a terminal RPN calculator inspired by the HP 32SII.

This package contains calculator state, command processing, decimal math, display formatting, angle modes, and HP-style four-level stack behavior. It has no Node terminal/readline dependencies and no runtime npm dependencies.

Decimal arithmetic is powered by a vendored, unmodified copy of `decimal.js` v10.6.0 under `src/vendor/decimal.js`, including its upstream MIT license.

## API

```ts
import { RpnCalculator, formatStack } from "@brnwb/rpn32-core";

const calculator = new RpnCalculator();
const { outputs, state } = calculator.execute("3 2 +");
console.log(formatStack(state.stack, state.display)); // 5
```

`execute()` applies a whole expression atomically and returns structured output events plus a detached,
read-only state snapshot. Failed expressions throw `RpnError` without changing calculator state. The public
state includes the four-level stack, `lastX`, display settings, angle and base modes, and a read-only copy of
the variables map. `view`, `vars`, and `show` return typed output events so callers can choose their own
presentation.
