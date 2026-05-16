# Changelog

## Unreleased

## 0.1.6 - 2026-05-15

- Changed the core calculator stack type to a fixed four-level tuple to better model the HP-style `T Z Y X` stack.
- Converted the repository from npm workspaces to pnpm workspaces.

## 0.1.5 - 2026-05-04

- Added variable storage and recall with `sto` and `rcl` for variables `A` through `Z` and `i`.
- Added `clear var` and `clear all` clearing commands.
- Added `view` and `vars` commands for inspecting variables without changing the stack.

## 0.1.4 - 2026-05-03

- Added `grad` angle mode for trigonometry.
- Added inverse trigonometric functions: `asin`, `acos`, and `atan`.
- Added hyperbolic functions: `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, and `atanh`.

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
