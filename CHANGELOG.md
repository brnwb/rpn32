# Changelog

## 0.1.0 - 2026-05-03

- Initial npm release.
- Added TypeScript npm workspace with `@brnwb/rpn32-core` and `rpn32` packages.
- Added HP-style four-level stack: `T Z Y X`.
- Added HP-style stack lift, `ENTER`, and `lastx` behavior.
- Added interactive REPL mode.
- Added quoted command-line expression mode: `rpn32 '3 2 +'`.
- Added piped stdin mode: `echo '3 2 +' | rpn32`.
- Added decimal arithmetic via `decimal.js`.
- Added display modes: `all`, `fix`, `sci`, and `eng`.
- Added angle modes: `deg` and `rad`.
- Added factorial, modulo, absolute value, integer/fractional part, floor, ceiling, and rounding functions.
- Added invalid operation handling that preserves calculator state.
