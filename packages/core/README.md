# @brnwb/rpn32-core

Reusable calculator engine for `rpn32`, a terminal RPN calculator inspired by the HP 32SII.

This package contains calculator state, command processing, decimal math, display formatting, angle modes, and HP-style four-level stack behavior. It has no Node terminal/readline dependencies and no runtime npm dependencies.

Decimal arithmetic is powered by a vendored, unmodified copy of `decimal.js` v10.6.0 under `src/vendor/decimal.js`, including its upstream MIT license.
