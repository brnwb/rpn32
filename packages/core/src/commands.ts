import { Decimal } from "decimal.js";
import {
  AngleMode,
  DISPLAY_SIGNIFICANT_DIGITS,
  DisplayMode,
  E,
  MAX_DISPLAY_DECIMAL_PLACES,
  PI,
  RpnCalculator,
  RpnError,
  parseDecimal,
  type BinaryOp,
  type UnaryOp,
} from "./calculator.js";

export function processLine(calc: RpnCalculator, line: string): void {
  processTokens(calc, line.split(/\s+/).filter(Boolean));
}

export function processTokens(calc: RpnCalculator, tokens: Iterable<string>): void {
  const snapshot = takeSnapshot(calc);
  try {
    processTokensUnchecked(calc, tokens);
  } catch (error) {
    restoreSnapshot(calc, snapshot);
    throw error;
  }
}

function processTokensUnchecked(calc: RpnCalculator, tokens: Iterable<string>): void {
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
    "/": divide,
    "^": decimalPower,
    pow: decimalPower,
    mod: modulo,
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
    abs: (x) => x.abs(),
    int: (x) => x.trunc(),
    frac: fractionalPart,
    floor: (x) => x.floor(),
    ceil: (x) => x.ceil(),
    rnd: (x) => roundToDisplay(x, calc.display),
    round: (x) => roundToDisplay(x, calc.display),
    chs: (x) => x.neg(),
    neg: (x) => x.neg(),
    "1/x": reciprocal,
  };

  if (token in binaryOps) {
    calc.applyBinary(binaryOps[token]);
    return;
  }

  if (token in unaryOps) {
    calc.applyUnary(unaryOps[token]);
    return;
  }

  switch (token) {
    case "enter":
    case "dup":
      calc.enter();
      return;
    case "drop":
      calc.drop();
      return;
    case "clx":
      calc.clearX();
      return;
    case "swap":
    case "xy":
      calc.swap();
      return;
    case "clear":
      calc.clear();
      return;
    case "lastx":
      calc.recallLastX();
      return;
    case "all":
      calc.display.mode = DisplayMode.All;
      return;
    case "deg":
      calc.setAngleMode(AngleMode.Deg);
      return;
    case "rad":
      calc.setAngleMode(AngleMode.Rad);
      return;
    case "grad":
      calc.setAngleMode(AngleMode.Grad);
      return;
    case "pi":
      calc.pushNumber(PI);
      return;
    case "e":
      calc.pushNumber(E);
      return;
    default:
      throw new RpnError(`unknown token: ${JSON.stringify(token)}`);
  }
}

function takeSnapshot(calc: RpnCalculator): RpnCalculatorSnapshot {
  return {
    angleMode: calc.angleMode,
    display: { ...calc.display },
    lastX: calc.lastX,
    liftEnabled: calc.liftEnabled,
    stack: [...calc.stack],
  };
}

function restoreSnapshot(calc: RpnCalculator, snapshot: RpnCalculatorSnapshot): void {
  calc.angleMode = snapshot.angleMode;
  calc.display = { ...snapshot.display };
  calc.lastX = snapshot.lastX;
  calc.liftEnabled = snapshot.liftEnabled;
  calc.stack = [...snapshot.stack];
}

interface RpnCalculatorSnapshot {
  angleMode: AngleMode;
  display: RpnCalculator["display"];
  lastX: RpnCalculator["lastX"];
  liftEnabled: boolean;
  stack: RpnCalculator["stack"];
}

function decimalPower(a: Decimal, b: Decimal): Decimal {
  if (b.isInteger()) return a.pow(b.toNumber());
  return Decimal.pow(a, b);
}

function factorial(value: Decimal): Decimal {
  if (!value.isInteger() || value.isNegative() || value.gt(253)) {
    throw new RpnError("factorial requires an integer from 0 to 253");
  }

  let result = new Decimal(1);
  for (let factor = 2; factor <= value.toNumber(); factor += 1) {
    result = result.times(factor);
  }
  return result;
}

function roundToDisplay(value: Decimal, display: RpnCalculator["display"]): Decimal {
  switch (display.mode) {
    case DisplayMode.Fix:
      return new Decimal(value.toFixed(display.digits));
    case DisplayMode.Sci:
    case DisplayMode.Eng:
      return value.toSignificantDigits(display.digits + 1);
    case DisplayMode.All:
      return value.toSignificantDigits(DISPLAY_SIGNIFICANT_DIGITS);
  }
}

function trigOps(
  calc: RpnCalculator,
): Pick<
  Record<string, UnaryOp>,
  | "sin"
  | "cos"
  | "tan"
  | "asin"
  | "acos"
  | "atan"
  | "sinh"
  | "cosh"
  | "tanh"
  | "asinh"
  | "acosh"
  | "atanh"
> {
  return {
    sin: (x) => Decimal.sin(calc.toRadians(x)),
    cos: (x) => Decimal.cos(calc.toRadians(x)),
    tan: (x) => Decimal.tan(calc.toRadians(x)),
    asin: (x) => calc.fromRadians(inverseCircularTrig(x, (value) => Decimal.asin(value))),
    acos: (x) => calc.fromRadians(inverseCircularTrig(x, (value) => Decimal.acos(value))),
    atan: (x) => calc.fromRadians(Decimal.atan(x)),
    sinh: (x) => Decimal.sinh(x),
    cosh: (x) => Decimal.cosh(x),
    tanh: (x) => Decimal.tanh(x),
    asinh: (x) => Decimal.asinh(x),
    acosh: acosh,
    atanh: atanh,
  };
}

function inverseCircularTrig(x: Decimal, op: (value: Decimal.Value) => Decimal): Decimal {
  if (x.lt(-1) || x.gt(1)) {
    throw new RpnError("invalid operation (inverse trigonometry domain error)");
  }
  return op(x);
}

function acosh(x: Decimal): Decimal {
  if (x.lt(1)) throw new RpnError("invalid operation (hyperbolic domain error)");
  return Decimal.acosh(x);
}

function atanh(x: Decimal): Decimal {
  if (x.lte(-1) || x.gte(1)) {
    throw new RpnError("invalid operation (hyperbolic domain error)");
  }
  return Decimal.atanh(x);
}

function divide(a: Decimal, b: Decimal): Decimal {
  if (b.isZero()) throw new RpnError("invalid operation (divide by zero)");
  return a.div(b);
}

function modulo(a: Decimal, b: Decimal): Decimal {
  if (b.isZero()) throw new RpnError("invalid operation (divide by zero)");
  return a.mod(b);
}

function fractionalPart(x: Decimal): Decimal {
  return x.minus(x.trunc());
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
  if (digits < 0 || digits > MAX_DISPLAY_DECIMAL_PLACES) {
    throw new RpnError(`display digit count must be from 0 to ${MAX_DISPLAY_DECIMAL_PLACES}`);
  }

  calc.setDisplayMode(mode as DisplayMode, digits);
}
