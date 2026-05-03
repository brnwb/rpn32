# AGENTS.md

## Project

`rpn32` is an npm workspace monorepo for an HP 32SII-inspired RPN calculator written in TypeScript.

## Packages

- `packages/core`: reusable calculator engine. No Node terminal/readline APIs here.
- `packages/cli`: Node readline CLI published as `@brnwb/rpn32`. Depends on `@brnwb/rpn32-core`.

## Commands

Run from the repository root:

- `npm run dev`: build core and run the CLI
- `npm run build`: build all packages
- `npm run format`: format with oxfmt
- `npm run format:check`: check formatting with oxfmt
- `npm run lint`: lint with oxlint
- `npm run test`: run tests
- `npm run check`: format check, lint, build, and test

## Guidelines

- Keep calculator behavior in `packages/core`.
- Keep terminal/readline behavior in `packages/cli`.
- Add or update tests for calculator behavior changes.
- Preserve four-level HP-style stack behavior: `T Z Y X`.
- Preserve HP-style stack lift and `ENTER` behavior.
- Invalid math operations should preserve the stack and throw `RpnError` with a useful message.
- Do not add compatibility facades for unpublished APIs unless there is a clear reason.
