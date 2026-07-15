import { Decimal } from "./vendor/decimal.js/decimal.mjs";
import {
  AngleMode,
  BaseMode,
  DISPLAY_SIGNIFICANT_DIGITS,
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
  type NumberValue,
  type ReadonlyDisplaySettings,
  type UnaryOp,
  type VariableValue,
} from "./calculator.js";
import { fixedWouldExceedDisplay, fixedWouldRoundToZero } from "./display.js";

export type CommandEvent =
  | {
      readonly type: "variable";
      readonly name: string;
      readonly value: NumberValue;
      readonly display: ReadonlyDisplaySettings;
      readonly baseMode: BaseMode;
    }
  | { readonly type: "notice"; readonly code: "no_variables" };

export interface ExecutionResult {
  readonly events: readonly CommandEvent[];
}

export function processLine(calc: RpnCalculator, line: string): ExecutionResult {
  return processTokens(calc, line.split(/\s+/).filter(Boolean));
}

export function processTokens(calc: RpnCalculator, tokens: Iterable<string>): ExecutionResult {
  return calc.runTransaction(() => processTokensUnchecked(calc, tokens));
}

function processTokensUnchecked(calc: RpnCalculator, tokens: Iterable<string>): ExecutionResult {
  const tokenList = Array.from(tokens);
  const events: CommandEvent[] = [];
  let index = 0;
  while (index < tokenList.length) {
    const token = tokenList[index]?.trim().toLowerCase() ?? "";
    if (setBaseMode(calc, token) || processNumber(calc, token)) {
      index += 1;
      continue;
    }

    if (token === "fix" || token === "sci" || token === "eng") {
      setDisplayMode(calc, token, requiredArgument(tokenList, index, "a digit count"));
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
      processVariableCommand(
        calc,
        token,
        requiredArgument(tokenList, index, "a variable name"),
        events,
      );
      index += 2;
    } else if (token === "clear") {
      const scope = tokenList[index + 1]?.trim().toLowerCase();
      if (scope === "var") calc.clearVariables();
      else if (scope === "all") calc.clearAll();
      else calc.clear();
      index += scope === "var" || scope === "all" ? 2 : 1;
    } else {
      processSimpleCommand(calc, token, events);
      index += 1;
    }
  }
  return { events };
}

function processNumber(calc: RpnCalculator, token: string): boolean {
  if (token === "") return true;
  const parsedInput =
    calc.baseMode === BaseMode.Dec
      ? parseDecimalInput(token)
      : { isFraction: false, value: parseBaseInteger(token, calc.baseMode) };
  if (parsedInput.value === undefined) return false;
  calc.pushNumber(parsedInput.value);
  if (parsedInput.isFraction) calc.setFractionDisplay(0);
  return true;
}

function requiredArgument(tokens: readonly string[], index: number, description: string): string {
  const operation = tokens[index]?.trim().toLowerCase() ?? "command";
  const argument = tokens[index + 1];
  if (argument === undefined) {
    throw new RpnError(`${operation} requires ${description}`, {
      code: "missing_argument",
      operation,
    });
  }
  return argument;
}

const baseModes: Readonly<Record<string, BaseMode>> = {
  dec: BaseMode.Dec,
  hex: BaseMode.Hex,
  oct: BaseMode.Oct,
  bin: BaseMode.Bin,
};

function setBaseMode(calc: RpnCalculator, token: string): boolean {
  const mode = baseModes[token];
  if (mode === undefined) return false;
  calc.setBaseMode(mode);
  return true;
}

function processSimpleCommand(calc: RpnCalculator, token: string, events: CommandEvent[]): void {
  const binaryOperation = binaryOpsFor(calc)[token];
  if (binaryOperation !== undefined) {
    calc.applyBinary(binaryOperation);
    return;
  }

  const unaryOperation = unaryOps[token];
  if (unaryOperation !== undefined) {
    calc.applyUnary(unaryOperation);
    return;
  }
  if (trigTokens.has(token)) {
    calc.applyUnary(trigOps(calc)[token]!);
    return;
  }

  switch (token) {
    case "rnd":
    case "round":
      calc.applyUnary((x) => roundToDisplay(x, calc.display), { preserveLastX: true });
      return;
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
    case "lastx":
      calc.recallLastX();
      return;
    case "all":
      calc.setDisplayMode(DisplayMode.All, calc.display.digits);
      return;
    case "vars": {
      const variables = calc.listVariables();
      if (variables.length === 0) events.push({ type: "notice", code: "no_variables" });
      else events.push(...variables.map((variable) => variableEvent(calc, variable)));
      return;
    }
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
      throw new RpnError(`unknown token: ${JSON.stringify(token)}`, {
        code: "unknown_token",
        token,
      });
  }
}

const unaryOps: Readonly<Record<string, UnaryOp>> = {
  sqrt,
  sq: (x) => x.times(x),
  "!": factorial,
  fact: factorial,
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

const trigTokens = new Set([
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "asinh",
  "acosh",
  "atanh",
]);

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
      "^": basePower,
      pow: basePower,
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
  if (divisor === 0n) {
    throw new RpnError("invalid operation (divide by zero)", { code: "divide_by_zero" });
  }

  const result = requireBaseInteger(a) / divisor;
  return new Decimal(clampBaseInteger(result).toString());
}

function baseModulo(a: Decimal, b: Decimal): Decimal {
  const divisor = requireBaseInteger(b);
  if (divisor === 0n) {
    throw new RpnError("invalid operation (divide by zero)", { code: "divide_by_zero" });
  }

  const result = requireBaseInteger(a) % divisor;
  return new Decimal(clampBaseInteger(result).toString());
}

function basePower(a: Decimal, b: Decimal): Decimal {
  const base = requireBaseInteger(a);
  let exponent = requireBaseInteger(b);

  if (exponent < 0n) {
    if (base === 0n) {
      throw new RpnError("invalid operation (divide by zero)", { code: "divide_by_zero" });
    }
    if (base === 1n) return new Decimal(1);
    if (base === -1n) return new Decimal(exponent % 2n === 0n ? 1 : -1);
    return new Decimal(0);
  }

  let result = 1n;
  let factor = base;
  while (exponent > 0n) {
    if (exponent % 2n === 1n) result = clampBaseInteger(result * factor);
    exponent /= 2n;
    if (exponent > 0n) factor = clampBaseInteger(factor * factor);
  }
  return new Decimal(result.toString());
}

function requireBaseInteger(value: Decimal): bigint {
  const integer = baseIntegerFromDecimal(value);
  if (integer === undefined) {
    throw new RpnError("base operation exceeds 36-bit word size", { code: "range" });
  }
  return integer;
}

function processVariableCommand(
  calc: RpnCalculator,
  command: "sto" | "rcl" | "view",
  variableName: string,
  events: CommandEvent[],
): void {
  if (command === "sto") calc.storeVariable(variableName);
  else if (command === "rcl") calc.recallVariable(variableName);
  else events.push(variableEvent(calc, calc.viewVariable(variableName)));
}

function variableEvent(calc: RpnCalculator, variable: VariableValue): CommandEvent {
  const view = calc.view();
  return {
    type: "variable",
    ...variable,
    display: view.display,
    baseMode: view.baseMode,
  };
}

function decimalPower(a: Decimal, b: Decimal): Decimal {
  if (b.isInteger()) {
    if (b.abs().gt(Number.MAX_SAFE_INTEGER)) {
      throw new RpnError("invalid operation (exponent out of range)", { code: "range" });
    }
    return a.pow(b.toNumber());
  }
  return Decimal.pow(a, b);
}

function factorial(value: Decimal): Decimal {
  if (!value.isInteger() || value.isNegative() || value.gt(253)) {
    throw new RpnError("factorial requires an integer from 0 to 253", { code: "domain" });
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

function trigOps(calc: RpnCalculator): Readonly<Record<string, UnaryOp>> {
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
    throw new RpnError("invalid operation (tangent undefined)", { code: "domain" });
  }
  return new Decimal(0);
}

function positiveModulo(value: Decimal, divisor: number): number {
  const remainder = value.mod(divisor).toNumber();
  return ((remainder % divisor) + divisor) % divisor;
}

function inverseCircularTrig(x: Decimal, op: (value: Decimal.Value) => Decimal): Decimal {
  if (x.lt(-1) || x.gt(1)) {
    throw new RpnError("invalid operation (inverse trigonometry domain error)", {
      code: "domain",
    });
  }
  return op(x);
}

function acosh(x: Decimal): Decimal {
  if (x.lt(1)) {
    throw new RpnError("invalid operation (hyperbolic domain error)", { code: "domain" });
  }
  return Decimal.acosh(x);
}

function atanh(x: Decimal): Decimal {
  if (x.lte(-1) || x.gte(1)) {
    throw new RpnError("invalid operation (hyperbolic domain error)", { code: "domain" });
  }
  return Decimal.atanh(x);
}

function divide(a: Decimal, b: Decimal): Decimal {
  if (b.isZero()) {
    throw new RpnError("invalid operation (divide by zero)", { code: "divide_by_zero" });
  }
  return a.div(b);
}

function modulo(a: Decimal, b: Decimal): Decimal {
  if (b.isZero()) {
    throw new RpnError("invalid operation (divide by zero)", { code: "divide_by_zero" });
  }
  return a.mod(b);
}

function fractionalPart(x: Decimal): Decimal {
  return x.minus(x.trunc());
}

function sqrt(x: Decimal): Decimal {
  if (x.isNegative()) {
    throw new RpnError("invalid operation (imaginary numbers not supported)", { code: "domain" });
  }
  return x.sqrt();
}

function naturalLog(x: Decimal): Decimal {
  if (x.lte(0)) {
    throw new RpnError("invalid operation (logarithm domain error)", { code: "domain" });
  }
  return Decimal.ln(x);
}

function commonLog(x: Decimal): Decimal {
  if (x.lte(0)) {
    throw new RpnError("invalid operation (logarithm domain error)", { code: "domain" });
  }
  return Decimal.log10(x);
}

function reciprocal(x: Decimal): Decimal {
  if (x.isZero()) {
    throw new RpnError("invalid operation (divide by zero)", { code: "divide_by_zero" });
  }
  return new Decimal(1).div(x);
}

function setDisplayMode(
  calc: RpnCalculator,
  mode: "fix" | "sci" | "eng",
  digitsToken: string,
): void {
  const normalizedDigitsToken = digitsToken.trim();
  if (!/^[+-]?\d+$/.test(normalizedDigitsToken)) {
    throw new RpnError(`display digit count must be an integer: ${JSON.stringify(digitsToken)}`, {
      code: "invalid_argument",
    });
  }

  const digits = Number(normalizedDigitsToken);
  if (digits < 0 || digits > MAX_DISPLAY_DECIMAL_PLACES) {
    throw new RpnError(`display digit count must be from 0 to ${MAX_DISPLAY_DECIMAL_PLACES}`, {
      code: "range",
    });
  }

  calc.setDisplayMode(mode as DisplayMode, digits);
}

function setFractionDisplay(calc: RpnCalculator, denominatorToken: string): void {
  const denominator = Number(denominatorToken.trim());
  if (!Number.isInteger(denominator)) {
    throw new RpnError(
      `fraction denominator must be an integer from 0 to ${MAX_FRACTION_DENOMINATOR}`,
      { code: "invalid_argument" },
    );
  }

  calc.setFractionDisplay(denominator);
}

function isPlainIntegerToken(token: string): boolean {
  return /^[+-]?\d+$/.test(token.trim());
}
