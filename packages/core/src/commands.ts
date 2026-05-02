import { Decimal } from "decimal.js";
import { RpnError } from "./errors.js";
import { decimalPower, factorial, type BinaryOp, type UnaryOp } from "./math.js";
import { E, PI, parseDecimal } from "./numbers.js";
import { RpnCalculator, trigOps } from "./calculator.js";
import { AngleMode, DisplayMode, MAX_DISPLAY_DIGITS } from "./settings.js";

export function processLine(calc: RpnCalculator, line: string): void {
  processTokens(calc, line.split(/\s+/).filter(Boolean));
}

export function processTokens(calc: RpnCalculator, tokens: Iterable<string>): void {
  const tokenList = Array.from(tokens);
  let index = 0;
  while (index < tokenList.length) {
    const token = tokenList[index]?.trim().toLowerCase() ?? "";
    if (token === "fix" || token === "sci" || token === "eng") {
      const digitsToken = tokenList[index + 1];
      if (digitsToken === undefined) {
        throw new RpnError(`${token} requires a digit count`);
      }
      setDisplayMode(calc, token, digitsToken);
      index += 2;
    } else {
      processToken(calc, token);
      index += 1;
    }
  }
}

export function processToken(calc: RpnCalculator, token: string): void {
  token = token.trim().toLowerCase();
  if (!token) return;

  const number = parseDecimal(token);
  if (number !== undefined) {
    calc.pushNumber(number);
    return;
  }

  const binaryOps: Record<string, BinaryOp> = {
    "+": (a, b) => a.plus(b),
    "-": (a, b) => a.minus(b),
    "*": (a, b) => a.times(b),
    x: (a, b) => a.times(b),
    "×": (a, b) => a.times(b),
    "/": divide,
    "÷": divide,
    "^": decimalPower,
    pow: decimalPower,
  };
  const unaryOps: Record<string, UnaryOp> = {
    sqrt: sqrt,
    sq: (x) => x.times(x),
    "!": factorial,
    fact: factorial,
    ...trigOps(calc),
    ln: naturalLog,
    log: commonLog,
    exp: (x) => Decimal.exp(x),
    chs: (x) => x.neg(),
    neg: (x) => x.neg(),
    "1/x": reciprocal,
  };

  if (token in binaryOps) {
    calc.applyBinary(binaryOps[token]);
  } else if (token in unaryOps) {
    calc.applyUnary(unaryOps[token]);
  } else if (token === "enter" || token === "dup") {
    calc.enter();
  } else if (token === "drop") {
    calc.drop();
  } else if (token === "clx") {
    calc.clearX();
  } else if (token === "swap" || token === "xy") {
    calc.swap();
  } else if (token === "clear" || token === "clr") {
    calc.clear();
  } else if (token === "lastx") {
    calc.recallLastX();
  } else if (token === "all") {
    calc.display.mode = DisplayMode.All;
  } else if (token === "deg") {
    calc.setAngleMode(AngleMode.Deg);
  } else if (token === "rad") {
    calc.setAngleMode(AngleMode.Rad);
  } else if (token === "pi") {
    calc.pushNumber(PI);
  } else if (token === "e") {
    calc.pushNumber(E);
  } else {
    throw new RpnError(`unknown token: ${JSON.stringify(token)}`);
  }
}

function divide(a: Decimal, b: Decimal): Decimal {
  if (b.isZero()) throw new RpnError("invalid operation (divide by zero)");
  return a.div(b);
}

function sqrt(x: Decimal): Decimal {
  if (x.isNegative()) {
    throw new RpnError("invalid operation (imaginary numbers not supported)");
  }
  return x.sqrt();
}

function naturalLog(x: Decimal): Decimal {
  if (x.lte(0)) throw new RpnError("invalid operation (logarithm domain error)");
  return Decimal.ln(x);
}

function commonLog(x: Decimal): Decimal {
  if (x.lte(0)) throw new RpnError("invalid operation (logarithm domain error)");
  return Decimal.log10(x);
}

function reciprocal(x: Decimal): Decimal {
  if (x.isZero()) throw new RpnError("invalid operation (divide by zero)");
  return new Decimal(1).div(x);
}

function setDisplayMode(
  calc: RpnCalculator,
  mode: "fix" | "sci" | "eng",
  digitsToken: string,
): void {
  const digits = Number(digitsToken);
  if (!Number.isInteger(digits)) {
    throw new RpnError(`display digit count must be an integer: ${JSON.stringify(digitsToken)}`);
  }
  if (digits < 0 || digits > MAX_DISPLAY_DIGITS) {
    throw new RpnError(`display digit count must be from 0 to ${MAX_DISPLAY_DIGITS}`);
  }

  calc.setDisplayMode(mode as DisplayMode, digits);
}
