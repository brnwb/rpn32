export const HELP = `rpn32 — an HP 32SII-inspired RPN calculator

Usage:
  rpn32                 start interactive REPL
  rpn32 '3 2 +'        evaluate one quoted RPN expression
  echo '3 2 +' | rpn32 evaluate piped input
  rpn32 --help         show this help
  rpn32 --version      show version

REPL commands:
  numbers         push values onto the stack, e.g. 3 2 +
  fractions       enter n/d as n..d or i n/d as i.n.d
  + - * / ^       arithmetic
  sqrt sq ! fact mod abs int fpart floor ceil rnd round
  sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh
  ln log exp chs 1/x
  deg rad grad    set trigonometry angle mode
  dec hex oct bin set integer base mode for input and display
  enter           duplicate X with HP-style ENTER behavior
  lastx           recall the previous X value
  sto A / rcl A   store or recall variables A through Z and i
  view A / vars   view one variable or list stored variables
  swap            swap X and Y
  drop clx        drop/clear X
  clear           clear the stack
  clear var       clear all variables
  clear all       clear stack, lastx, and variables
  fix n           show n digits after the decimal point
  sci n           show scientific notation with n decimal places
  eng n           show engineering notation with n decimal places
  frac [n]        toggle fraction display, or set max denominator n
  all             show compact 12-digit display
  stack           show all stack registers after each entry
  stack off       return to compact display
  help            show this help
  quit            leave

You can enter a whole expression on one line: 3 2 +
Or use it like a calculator: enter 3, then 2, then + on separate prompts.`;
