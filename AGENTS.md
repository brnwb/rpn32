# AGENTS.md

## Project

`rpn32` is a pnpm workspace monorepo for an HP 32SII-inspired RPN calculator written in TypeScript.

## Packages

- `packages/core`: reusable calculator engine. No Node terminal/readline APIs here.
- `packages/cli`: Node readline CLI published as `@brnwb/rpn32`. Depends on `@brnwb/rpn32-core`.

## Commands

Run from the repository root:

- `pnpm run dev`: build core and run the CLI
- `pnpm run build`: build all packages
- `pnpm run format`: format with oxfmt
- `pnpm run format:check`: check formatting with oxfmt
- `pnpm run lint`: lint with oxlint
- `pnpm run test`: run tests
- `pnpm run check`: format check, lint, build, and test

## Guidelines

- Keep calculator behavior in `packages/core`.
- Keep terminal/readline behavior in `packages/cli`.
- Add or update tests for calculator behavior changes.
- Preserve four-level HP-style stack behavior: `T Z Y X`.
- Preserve HP-style stack lift and `ENTER` behavior.
- Invalid math operations should preserve the stack and throw `RpnError` with a useful message.
- Do not add compatibility facades for unpublished APIs unless there is a clear reason.
