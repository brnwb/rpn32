# @brnwb/rpn32-cli

Terminal CLI for `rpn32`, an HP 32SII-inspired RPN calculator written in TypeScript.

For installation, usage, commands, and development documentation, see the main project README:

https://github.com/brnwb/rpn32#readme

The package executable is a thin `bin` entry point. The importable package root exports `runCli` and its injected environment types for embedding and testing without mutating process globals.
