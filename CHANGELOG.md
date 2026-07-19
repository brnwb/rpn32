# Changelog

## Unreleased

### Fixed

- Preserved the active display mode and maximum denominator when entering fractions.
- Corrected HP-style FIX rounding, engineering significant-digit formatting, `STO` stack lift, `RND` and change-sign `LASTX` behavior, and the zero-base power domain.
- Disabled `sqrt`, `exp`, `ln`, `^`, `pow`, and `1/x` in non-decimal base modes, matching the HP 32SII.
- Enforced HP fraction-entry digit limits and added fraction-approximation direction indicators.
- Made `ALL` select ordinary or scientific notation according to the HP 32SII's 12-digit display capacity.

## [0.4.0] - 2026-07-18

### Changed

- **Breaking:** Replaced the mutable `RpnCalculator` API with an invariant-preserving façade. Calculator expressions now run through `execute()`, which returns structured output events and a detached, read-only state snapshot.
- **Breaking:** Removed low-level command processors, mutable calculator fields and methods, transaction and operation callbacks, parsing helpers, numeric-policy helpers, internal constants, and `StackUnderflowError` from the `@brnwb/rpn32-core` package exports.
- **Breaking:** Changed `view` and `vars` results from queued display strings to structured variable output events; terminal formatting now belongs to the CLI session.
- **Breaking:** Made `@brnwb/rpn32-cli` binary-only by removing its programmatic entry points and blocking package subpath exports.
- Moved calculator behavior into focused state-machine, command, operation, base-integer, fraction, display, and public-engine modules.
- Centralized whole-expression rollback at the public execution boundary so stack, `LASTX`, display settings, modes, variables, and output events are restored atomically after failures.
- Separated the Node readline/process adapter from the testable CLI calculator session.

### Fixed

- Prevented returned state snapshots and output events from mutating calculator internals through shared arrays, maps, display settings, or Decimal coefficient arrays.
- Prevented inherited object-property names such as `constructor` and `__proto__` from being interpreted as calculator commands.

## [0.3.1] - 2026-05-25

- Renamed CLI npm package from `@brnwb/rpn32` to `@brnwb/rpn32-cli`.

## [0.3.0] - 2026-05-24

- Changed `frac` to toggle fraction display, added `frac n` for maximum denominator, added HP-style fraction entry tokens like `1..2` and `1.1.2`, made `rnd` round to the displayed fraction, and renamed the fractional-part command to `fpart`.

## [0.2.0] - 2026-05-23

- Added explicit `dec`, `hex`, `oct`, and `bin` integer base modes for input and display.

## [0.1.8] - 2026-05-23

- Declared Node.js `>=22.13.0` support for published packages and expanded CI coverage to Node 22 and 24.
- Normalized decimal-library math failures into `RpnError` messages while preserving calculator state.
- Made degree and gradian quadrant trigonometry exact, including explicit errors for undefined tangent values.
- Rejected unsafe integer exponents, non-decimal numeric literals, and non-decimal display digit counts instead of accepting surprising JavaScript coercions.
- Prevented fixed display formatting from materializing enormous strings for very large numbers.

## [0.1.7] - 2026-05-22

- Vendored `decimal.js` in the core package and removed it as a runtime npm dependency.

## [0.1.6] - 2026-05-15

- Changed the core calculator stack type to a fixed four-level tuple to better model the HP-style `T Z Y X` stack.
- Converted the repository from npm workspaces to pnpm workspaces.

## [0.1.5] - 2026-05-04

- Added variable storage and recall with `sto` and `rcl` for variables `A` through `Z` and `i`.
- Added `clear var` and `clear all` clearing commands.
- Added `view` and `vars` commands for inspecting variables without changing the stack.

## [0.1.4] - 2026-05-03

- Added `grad` angle mode for trigonometry.
- Added inverse trigonometric functions: `asin`, `acos`, and `atan`.
- Added hyperbolic functions: `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, and `atanh`.

## [0.1.3] - 2026-05-03

- Changed `round` to use HP-style display-format rounding.
- Added `rnd` as the preferred HP-style rounding command.
- Added HP-style factorial bounds for integers from 0 through 253.
- Improved FIX display fallback to scientific notation for very small or too-wide values.

## [0.1.2] - 2026-05-03

- Clarified internal precision and display precision constants.
- Added numeric regression tests for decimal arithmetic, rounding, trigonometry, powers, and invalid operations.

## [0.1.1] - 2026-05-03

- Renamed CLI npm package from `rpn32` to `@brnwb/rpn32`.
- Added npm package repository, homepage, and issue tracker metadata.

## [0.1.0] - 2026-05-03

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
