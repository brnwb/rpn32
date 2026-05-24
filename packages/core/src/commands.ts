import { Decimal } from "./vendor/decimal.js/decimal.mjs";
import {
  AngleMode,
  BaseMode,
  DISPLAY_SIGNIFICANT_DIGITS,
  type DisplaySettings,
  DisplayMode,
  E,
  MAX_FRACTION_DENOMINATOR,
  MAX_DISPLAY_DECIMAL_PLACES,
  PI,
  RpnCalculator,
  RpnError,
  ZERO,
  approximateFraction,
  baseIntegerFromDecimal,
  clampBaseInteger,
  parseBaseInteger,
  parseDecimal,
  parseFraction,
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
    } else if (token === "frac") {
      const denominatorToken = tokenList[index + 1];
      if (denominatorToken !== undefined && isPlainIntegerToken(denominatorToken)) {
        setFractionDisplay(calc, denominatorToken);
        index += 2;
      } else {
        calc.toggleFractionDisplay();
        index += 1;
      }
    } else if (token === "sto" || token === "rcl" || token === "view") {
      const variableToken = tokenList[index + 1];
      if (variableToken === undefined) {
        throw new RpnError(`${token} requires a variable name`);
      }
      processVariableCommand(calc, token, variableToken);
      index += 2;
    } else if (token === "clear" && tokenList[index + 1]?.trim().toLowerCase() === "var") {
      calc.clearVariables();
      index += 2;
    } else if (token === "clear" && tokenList[index + 1]?.trim().toLowerCase() === "all") {
      calc.clearAll();
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

  if (setBaseMode(calc, token)) return;

  const parsedInput =
    calc.baseMode === BaseMode.Dec
      ? parseDecimalInput(token)
      : { isFraction: false, value: parseBaseInteger(token, calc.baseMode) };
  if (parsedInput.value !== undefined) {
    calc.pushNumber(parsedInput.value);
    if (parsedInput.isFraction) {
      calc.setFractionDisplay(0);
    }
    return;
  }

  const binaryOps = binaryOpsFor(calc);
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
    fpart: fractionalPart,
    floor: (x) => x.floor(),
    ceil: (x) => x.ceil(),
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
    case "rnd":
    case "round": {
      const lastX = calc.lastX;
      calc.applyUnary((x) => roundToDisplay(x, calc.display));
      calc.lastX = lastX;
      return;
    }
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
      calc.setDisplayMode(DisplayMode.All, calc.display.digits);
      return;
    case "vars":
      calc.listVariables();
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

function parseDecimalInput(token: string): { isFraction: boolean; value: Decimal | undefined } {
  const fraction = parseFraction(token);
  if (fraction !== undefined) return { isFraction: true, value: fraction };
  return { isFraction: false, value: parseDecimal(token) };
}

function binaryOpsFor(calc: RpnCalculator): Record<string, BinaryOp> {
  if (calc.baseMode !== BaseMode.Dec) {
    return {
      "+": baseBinaryOp((a, b) => a + b),
      "-": baseBinaryOp((a, b) => a - b),
      "*": baseBinaryOp((a, b) => a * b),
      "/": baseDivide,
      "^": decimalPower,
      pow: decimalPower,
      mod: baseModulo,
    };
  }

  return {
    "+": (a, b) => a.plus(b),
    "-": (a, b) => a.minus(b),
    "*": (a, b) => a.times(b),
    "/": divide,
    "^": decimalPower,
    pow: decimalPower,
    mod: modulo,
  };
}

function baseBinaryOp(op: (a: bigint, b: bigint) => bigint): BinaryOp {
  return (a, b) =>
    new Decimal(clampBaseInteger(op(requireBaseInteger(a), requireBaseInteger(b))).toString());
}

function baseDivide(a: Decimal, b: Decimal): Decimal {
  const divisor = requireBaseInteger(b);
  if (divisor === 0n) throw new RpnError("invalid operation (divide by zero)");

  const result = requireBaseInteger(a) / divisor;
  return new Decimal(clampBaseInteger(result).toString());
}

function baseModulo(a: Decimal, b: Decimal): Decimal {
  const divisor = requireBaseInteger(b);
  if (divisor === 0n) throw new RpnError("invalid operation (divide by zero)");

  const result = requireBaseInteger(a) % divisor;
  return new Decimal(clampBaseInteger(result).toString());
}

function requireBaseInteger(value: Decimal): bigint {
  const integer = baseIntegerFromDecimal(value);
  if (integer === undefined) {
    throw new RpnError("base operation exceeds 36-bit word size");
  }
  return integer;
}

function takeSnapshot(calc: RpnCalculator): RpnCalculatorSnapshot {
  return {
    angleMode: calc.angleMode,
    baseMode: calc.baseMode,
    display: cloneDisplay(calc.display),
    lastX: calc.lastX,
    liftEnabled: calc.liftEnabled,
    messages: [...calc.messages],
    stack: [...calc.stack],
    variables: new Map(calc.variables),
  };
}

function restoreSnapshot(calc: RpnCalculator, snapshot: RpnCalculatorSnapshot): void {
  calc.angleMode = snapshot.angleMode;
  calc.baseMode = snapshot.baseMode;
  calc.display = cloneDisplay(snapshot.display);
  calc.lastX = snapshot.lastX;
  calc.liftEnabled = snapshot.liftEnabled;
  calc.messages = [...snapshot.messages];
  calc.stack = [...snapshot.stack];
  calc.variables = new Map(snapshot.variables);
}

interface RpnCalculatorSnapshot {
  angleMode: AngleMode;
  baseMode: BaseMode;
  display: RpnCalculator["display"];
  lastX: RpnCalculator["lastX"];
  liftEnabled: boolean;
  messages: RpnCalculator["messages"];
  stack: RpnCalculator["stack"];
  variables: RpnCalculator["variables"];
}

function setBaseMode(calc: RpnCalculator, token: string): boolean {
  switch (token) {
    case "dec":
      calc.setBaseMode(BaseMode.Dec);
      return true;
    case "hex":
      calc.setBaseMode(BaseMode.Hex);
      return true;
    case "oct":
      calc.setBaseMode(BaseMode.Oct);
      return true;
    case "bin":
      calc.setBaseMode(BaseMode.Bin);
      return true;
    default:
      return false;
  }
}

function cloneDisplay(display: DisplaySettings): DisplaySettings {
  return {
    mode: display.mode,
    digits: display.digits,
    fraction: { ...display.fraction },
  };
}

function processVariableCommand(
  calc: RpnCalculator,
  command: "sto" | "rcl" | "view",
  variableName: string,
): void {
  if (command === "sto") calc.storeVariable(variableName);
  else if (command === "rcl") calc.recallVariable(variableName);
  else calc.viewVariable(variableName);
}

function decimalPower(a: Decimal, b: Decimal): Decimal {
  if (b.isInteger()) {
    if (b.abs().gt(Number.MAX_SAFE_INTEGER)) {
      throw new RpnError("invalid operation (exponent out of range)");
    }
    return a.pow(b.toNumber());
  }
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
  if (display.fraction.enabled)
    return roundToFractionDisplay(value, display.fraction.maxDenominator);

  switch (display.mode) {
    case DisplayMode.Fix:
      if (fixedWouldRoundToZero(value, display.digits)) return ZERO;
      if (fixedWouldExceedDisplay(value, display.digits)) {
        return value.toSignificantDigits(display.digits + 1);
      }
      return new Decimal(value.toFixed(display.digits));
    case DisplayMode.Sci:
    case DisplayMode.Eng:
      return value.toSignificantDigits(display.digits + 1);
    case DisplayMode.All:
      return value.toSignificantDigits(DISPLAY_SIGNIFICANT_DIGITS);
  }
}

function roundToFractionDisplay(value: Decimal, maxDenominator: number): Decimal {
  if (value.isZero()) return ZERO;

  const sign = value.isNegative() ? -1 : 1;
  const absolute = value.abs();
  const integerPart = absolute.trunc();
  const fractionPart = absolute.minus(integerPart);
  const [numerator, denominator] = approximateFraction(fractionPart, maxDenominator);
  const roundedMagnitude = new Decimal(integerPart.toFixed(0)).plus(
    new Decimal(numerator.toString()).div(denominator.toString()),
  );

  return sign < 0 ? roundedMagnitude.neg() : roundedMagnitude;
}

function fixedWouldRoundToZero(value: Decimal, digits: number): boolean {
  return !value.isZero() && value.e < -digits;
}

function fixedWouldExceedDisplay(value: Decimal, digits: number): boolean {
  return value.e >= 0 && value.e + 1 + digits > DISPLAY_SIGNIFICANT_DIGITS;
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
    sin: (x) => exactQuadrantTrig(calc, x, "sin") ?? Decimal.sin(calc.toRadians(x)),
    cos: (x) => exactQuadrantTrig(calc, x, "cos") ?? Decimal.cos(calc.toRadians(x)),
    tan: (x) => exactQuadrantTrig(calc, x, "tan") ?? Decimal.tan(calc.toRadians(x)),
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

function exactQuadrantTrig(
  calc: RpnCalculator,
  x: Decimal,
  op: "sin" | "cos" | "tan",
): Decimal | undefined {
  const unit =
    calc.angleMode === AngleMode.Deg
      ? new Decimal(90)
      : calc.angleMode === AngleMode.Grad
        ? new Decimal(100)
        : undefined;
  if (unit === undefined) return undefined;

  const quarterTurns = x.div(unit);
  if (!quarterTurns.isInteger()) return undefined;

  const quadrant = positiveModulo(quarterTurns, 4);
  if (op === "sin") {
    if (quadrant === 0 || quadrant === 2) return new Decimal(0);
    return new Decimal(quadrant === 1 ? 1 : -1);
  }
  if (op === "cos") {
    if (quadrant === 1 || quadrant === 3) return new Decimal(0);
    return new Decimal(quadrant === 0 ? 1 : -1);
  }

  if (quadrant === 1 || quadrant === 3) {
    throw new RpnError("invalid operation (tangent undefined)");
  }
  return new Decimal(0);
}

function positiveModulo(value: Decimal, divisor: number): number {
  const remainder = value.mod(divisor).toNumber();
  return ((remainder % divisor) + divisor) % divisor;
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
  const normalizedDigitsToken = digitsToken.trim();
  if (!/^[+-]?\d+$/.test(normalizedDigitsToken)) {
    throw new RpnError(`display digit count must be an integer: ${JSON.stringify(digitsToken)}`);
  }

  const digits = Number(normalizedDigitsToken);
  if (digits < 0 || digits > MAX_DISPLAY_DECIMAL_PLACES) {
    throw new RpnError(`display digit count must be from 0 to ${MAX_DISPLAY_DECIMAL_PLACES}`);
  }

  calc.setDisplayMode(mode as DisplayMode, digits);
}

function setFractionDisplay(calc: RpnCalculator, denominatorToken: string): void {
  const denominator = Number(denominatorToken.trim());
  if (!Number.isInteger(denominator)) {
    throw new RpnError(
      `fraction denominator must be an integer from 0 to ${MAX_FRACTION_DENOMINATOR}`,
    );
  }

  calc.setFractionDisplay(denominator);
}

function isPlainIntegerToken(token: string): boolean {
  return /^[+-]?\d+$/.test(token.trim());
}
