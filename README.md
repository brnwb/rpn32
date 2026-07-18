# rpn32

A terminal RPN calculator inspired by my favorite calculator, the HP 32SII. Written in TypeScript for Node.js.

The calculator core uses a vendored copy of `decimal.js` instead of JavaScript binary floating point, which makes decimal calculator-style arithmetic behave more like an HP calculator without adding runtime npm dependencies. It also uses a fixed four-level HP-style stack, `T Z Y X`, with stack lift, `ENTER`, and `lastx` behavior. `lastx` is updated by numeric operations and preserved by stack/display/angle commands and invalid operations.

This is _inspired_ by the 32SII, but not a perfect emulation.

## Install

```bash
npm install -g @brnwb/rpn32-cli
```

Then run:

```bash
rpn32 '3 2 +'
# 5
```

## Development setup

```bash
pnpm install
```

## Run in development

```bash
pnpm run dev
```

## Build and run

```bash
pnpm run build
pnpm --filter @brnwb/rpn32-cli exec rpn32
```

## Usage

Show help or version:

```bash
rpn32 --help
rpn32 --version
```

Evaluate directly from the command line:

```bash
rpn32 '3 2 +'
# 5
```

Pass the expression as one quoted argument. Or pipe an expression into `rpn32`:

```bash
echo '3 2 +' | rpn32
# 5
```

Interactive mode starts when no arguments or piped input are provided. The REPL supports up/down arrow history for the current session without writing history files.

Use one expression per line:

```text
rpn> 3 2 +
5
```

Or enter tokens one prompt at a time:

```text
rpn> 3
3
rpn> 2
2
rpn> +
5
```

`ENTER` behaves like an HP stack key: it copies `X` into `Y` and makes the next number replace `X` instead of lifting the stack again:

```text
rpn> 3 enter
3
rpn> 2
2
rpn> +
5
```

Show the full four-level stack with `stack`:

```text
rpn> 5 2 +
7
rpn> stack
T: 0  Z: 0  Y: 0  X: 7
rpn> 8
T: 0  Z: 0  Y: 7  X: 8
rpn> stack off
8
```

Non-degree angle modes are shown in the prompt:

```text
rpn> rad
0
rpn(rad)> pi sin
0
rpn(rad)> grad
0
rpn(grad)> deg
0
rpn>
```

Integer base modes convert display and input mode:

```text
rpn> 125.99 hex
7D
rpn(hex)> oct
175
rpn(oct)> bin
1111101
rpn(bin)> dec
125.99
```

Invalid operations preserve the stack and show a specific error when possible:

```text
rpn> -1
-1
rpn> sqrt
error: invalid operation (imaginary numbers not supported)
-1
rpn> 1 0 /
error: invalid operation (divide by zero)
0
```

## Current commands

- Numbers push onto the stack
- Fraction input: `n..d` for `n/d`, `i.n.d` for `i n/d`
- Arithmetic: `+ - * / ^`
- Math: `sqrt sq ! fact mod abs int fpart floor ceil rnd round`
- Trig/log/exponential: `sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh ln log exp`
- Other numeric functions: `chs 1/x`
- Angle modes: `deg`, `rad`, `grad`
- Integer base modes: `dec`, `hex`, `oct`, `bin`
- Variables: `sto A`, `rcl A`, `view A`, `vars` for variables `A` through `Z` and `i`
- Stack: `enter`, `lastx`, `swap`, `drop`, `clx`, `clear`
- Clearing: `clear var`, `clear all`
- Display modes: `fix n`, `sci n`, `eng n`, `frac`, `frac n`, `all`
- Full stack display: `stack`, `stack off`
- Constants: `pi`, `e`
- REPL: `help`, `quit`

Base modes follow the HP 32SII's 36-bit, two's-complement integer model. Changing base changes display and input mode without truncating the stored decimal value, but arithmetic in `hex`, `oct`, and `bin` uses integer parts and returns integer results.

Fraction input and display follow the HP 32SII model: `1..2` enters `1/2`, `1.1.2` enters `1 1/2`, `frac` toggles fraction display, `frac n` sets the maximum denominator up to 4095 and turns fraction display on, and decimal display modes turn fraction display off. The `fpart` command returns the fractional part of `X`.
In fraction display, `rnd` changes `X` to the decimal value of the displayed fraction.

A few convenience aliases are currently accepted: `dup`, `xy`, `pow`, `fact`, and `neg`.

## Project structure

This is a pnpm workspace monorepo with the reusable calculator engine separated from the CLI shell.

```text
packages/
  core/                 @brnwb/rpn32-core
    src/
      calculator.ts     internal mutable machine, Decimal setup, settings, and errors
      engine.ts         narrow public API and detached, read-only state snapshots
      commands.ts       token grammar, validation, and command dispatch
      operations.ts     mathematical operations and domain validation
      base.ts           36-bit integer parsing, arithmetic, and conversion
      fraction.ts       fraction parsing, approximation, and decomposition
      display.ts        numeric formatting, display rounding, and stack rendering
      index.ts          public core exports
    test/
      calculator.test.ts

  cli/                  @brnwb/rpn32-cli
    src/
      session.ts        Node-free calculator session and terminal presentation
      cli.ts            Node process, stdin, and readline adapter
```

The CLI depends on `@brnwb/rpn32-core`; calculator behavior belongs in the core package, while terminal behavior belongs in the CLI package.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release notes.

## Development commands

```bash
pnpm run format        # format with oxfmt
pnpm run format:check  # check formatting with oxfmt
pnpm run lint          # lint with oxlint
pnpm run check         # format check, lint, build, and test
```
