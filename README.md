# rpn32

A terminal RPN calculator inspired by the HP 32SII, written in TypeScript for Node.js.

The calculator core uses `decimal.js` instead of JavaScript binary floating point, which makes decimal calculator-style arithmetic behave more like an HP calculator. It also uses a fixed four-level HP-style stack, `T Z Y X`, with stack lift, `ENTER`, and `lastx` behavior.

This is closer to a 32SII, but not yet a perfect emulation.

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

## Current commands

- Numbers push onto the stack
- `+ - * / ^` arithmetic
- `sqrt sq sin cos tan ln log exp chs 1/x`
- `enter`/`dup`, `lastx`, `swap`/`xy`, `drop`/`clx`, `clear`/`clr`
- `fix n`, `sci n`, `eng n`, `all` display modes
- `stack` to show all registers once
- `stack on` / `stack off` to toggle full stack display
- `pi`, `e`
- `help`, `quit`

## Check

```bash
npm run check
```
