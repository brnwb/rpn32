# rpn32

A terminal RPN calculator inspired by my favorite calculator, the HP 32SII. Written in TypeScript for Node.js.

The calculator core uses `decimal.js` instead of JavaScript binary floating point, which makes decimal calculator-style arithmetic behave more like an HP calculator. It also uses a fixed four-level HP-style stack, `T Z Y X`, with stack lift, `ENTER`, and `lastx` behavior. `lastx` is updated by numeric operations and preserved by stack/display/angle commands and invalid operations.

This is _inspired_ by the 32SII, but not a perfect emulation.

## Install dependencies

```bash
npm install
```

## Run in development

```bash
npm run dev
```

## Build and run

```bash
npm run build
npx rpn32
```

## Usage

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

Interactive mode starts when no arguments or piped input are provided.

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

Radian mode is shown in the prompt:

```text
rpn> rad
0
rpn(rad)> pi sin
0
rpn(rad)> deg
0
rpn>
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
- `+ - * / ^` arithmetic
- `sqrt sq ! fact sin cos tan ln log exp chs 1/x`
- `deg`, `rad` angle modes for trigonometry
- `enter`/`dup`, `lastx`, `swap`/`xy`, `drop`/`clx`, `clear`/`clr`
- `fix n`, `sci n`, `eng n`, `all` display modes
- `stack` / `stack on` to show all registers after each entry
- `stack off` to return to compact display
- `pi`, `e`
- `help`, `quit`

## Project structure

This is an npm workspace monorepo with the reusable calculator engine separated from the CLI shell.

```text
packages/
  core/                 @rpn32/core
    src/
      calculator.ts     HP-style stack/state behavior
      commands.ts       token parsing and command execution
      display.ts        display formatting and stack rendering
      errors.ts         RPN error types
      math.ts           math helpers like factorial and power
      numbers.ts        Decimal setup and constants
      settings.ts       display and angle settings
      index.ts          public core exports
    test/
      calculator.test.ts

  cli/                  rpn32
    src/
      cli.ts            Node readline REPL
```

The CLI depends on `@rpn32/core`, so future interfaces like a TUI can use the same calculator engine without depending on the CLI.

## Development commands

```bash
npm run format        # format with oxfmt
npm run format:check  # check formatting with oxfmt
npm run lint          # lint with oxlint
npm run check         # format check, lint, build, and test
```
