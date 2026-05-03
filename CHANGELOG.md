# Changelog

## 0.1.3 - 2026-05-03

- Changed `round` to use HP-style display-format rounding.
- Added `rnd` as the preferred HP-style rounding command.
- Added HP-style factorial bounds for integers from 0 through 253.
- Improved FIX display fallback to scientific notation for very small or too-wide values.

## 0.1.2 - 2026-05-03

- Clarified internal precision and display precision constants.
- Added numeric regression tests for decimal arithmetic, rounding, trigonometry, powers, and invalid operations.

## 0.1.1 - 2026-05-03

- Renamed CLI npm package from `rpn32` to `@brnwb/rpn32`.
- Added npm package repository, homepage, and issue tracker metadata.

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
