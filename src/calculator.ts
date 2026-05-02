import { Decimal } from "decimal.js";

// The HP 32SII displays 12 significant digits and keeps a few guard digits
// internally. This is not a perfect emulation, but Decimal gets us much closer
// than JavaScript's binary floating point for calculator-style arithmetic.
export const WORKING_PRECISION = 15;
export const MAX_DISPLAY_DIGITS = 11;

Decimal.set({ precision: WORKING_PRECISION, rounding: Decimal.ROUND_HALF_UP });

export type NumberValue = Decimal;
type UnaryOp = (x: NumberValue) => NumberValue;
type BinaryOp = (a: NumberValue, b: NumberValue) => NumberValue;

export const PI = new Decimal("3.14159265358979");
export const E = new Decimal("2.71828182845905");
export const ZERO = new Decimal(0);

export class RpnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RpnError";
  }
}

export class StackUnderflowError extends RpnError {
  constructor(message: string) {
    super(message);
    this.name = "StackUnderflowError";
  }
}

export enum DisplayMode {
  All = "all",
  Fix = "fix",
  Sci = "sci",
  Eng = "eng",
}

export enum AngleMode {
  Deg = "deg",
  Rad = "rad",
}

export interface DisplaySettings {
  mode: DisplayMode;
  digits: number;
}

export class RpnCalculator {
  stack: NumberValue[] = [ZERO, ZERO, ZERO, ZERO];
  liftEnabled = true;
  lastX: NumberValue = ZERO;
  display: DisplaySettings = { mode: DisplayMode.All, digits: MAX_DISPLAY_DIGITS };
  angleMode: AngleMode = AngleMode.Deg;

  /** Process a whitespace-separated line of RPN tokens. */
  processLine(line: string): void {
    this.processTokens(line.split(/\s+/).filter(Boolean));
  }

  processTokens(tokens: Iterable<string>): void {
    const tokenList = Array.from(tokens);
    let index = 0;
    while (index < tokenList.length) {
      const token = tokenList[index]?.trim().toLowerCase() ?? "";
      if (token === "fix" || token === "sci" || token === "eng") {
        const digitsToken = tokenList[index + 1];
        if (digitsToken === undefined) {
          throw new RpnError(`${token} requires a digit count`);
        }
        this.setDisplayMode(token, digitsToken);
        index += 2;
      } else {
        this.processToken(token);
        index += 1;
      }
    }
  }

  processToken(token: string): void {
    token = token.trim().toLowerCase();
    if (!token) return;

    const number = parseDecimal(token);
    if (number !== undefined) {
      this.pushNumber(number);
      return;
    }

    const binaryOps: Record<string, BinaryOp> = {
      "+": (a, b) => a.plus(b),
      "-": (a, b) => a.minus(b),
      "*": (a, b) => a.times(b),
      x: (a, b) => a.times(b),
      "×": (a, b) => a.times(b),
      "/": (a, b) => a.div(b),
      "÷": (a, b) => a.div(b),
      "^": decimalPower,
      pow: decimalPower,
    };
    const unaryOps: Record<string, UnaryOp> = {
      sqrt: (x) => x.sqrt(),
      sq: (x) => x.times(x),
      "!": factorial,
      fact: factorial,
      sin: (x) => Decimal.sin(this.toRadians(x)),
      cos: (x) => Decimal.cos(this.toRadians(x)),
      tan: (x) => Decimal.tan(this.toRadians(x)),
      ln: (x) => Decimal.ln(x),
      log: (x) => Decimal.log10(x),
      exp: (x) => Decimal.exp(x),
      chs: (x) => x.neg(),
      neg: (x) => x.neg(),
      "1/x": (x) => new Decimal(1).div(x),
    };

    if (token in binaryOps) {
      this.binary(binaryOps[token]);
    } else if (token in unaryOps) {
      this.unary(unaryOps[token]);
    } else if (token === "enter" || token === "dup") {
      this.enter();
    } else if (token === "drop") {
      this.drop();
    } else if (token === "clx") {
      this.clearX();
    } else if (token === "swap" || token === "xy") {
      this.swap();
    } else if (token === "clear" || token === "clr") {
      this.clear();
    } else if (token === "lastx") {
      this.recallLastX();
    } else if (token === "all") {
      this.display.mode = DisplayMode.All;
    } else if (token === "deg") {
      this.angleMode = AngleMode.Deg;
    } else if (token === "rad") {
      this.angleMode = AngleMode.Rad;
    } else if (token === "pi") {
      this.pushNumber(PI);
    } else if (token === "e") {
      this.pushNumber(E);
    } else {
      throw new RpnError(`unknown token: ${JSON.stringify(token)}`);
    }
  }

  get x(): NumberValue {
    return this.stack[3] ?? ZERO;
  }

  get y(): NumberValue {
    return this.stack[2] ?? ZERO;
  }

  get z(): NumberValue {
    return this.stack[1] ?? ZERO;
  }

  get t(): NumberValue {
    return this.stack[0] ?? ZERO;
  }

  setDisplayMode(mode: DisplayMode | "fix" | "sci" | "eng", digitsToken: string): void {
    const digits = Number(digitsToken);
    if (!Number.isInteger(digits)) {
      throw new RpnError(`display digit count must be an integer: ${JSON.stringify(digitsToken)}`);
    }
    if (digits < 0 || digits > MAX_DISPLAY_DIGITS) {
      throw new RpnError(`display digit count must be from 0 to ${MAX_DISPLAY_DIGITS}`);
    }

    this.display.mode = mode as DisplayMode;
    this.display.digits = digits;
  }

  pushNumber(value: NumberValue): void {
    if (this.liftEnabled) this.lift();
    this.stack[3] = value;
    this.liftEnabled = true;
  }

  enter(): void {
    this.lift();
    this.liftEnabled = false;
  }

  drop(): void {
    this.stack[3] = this.stack[2] ?? ZERO;
    this.stack[2] = this.stack[1] ?? ZERO;
    this.stack[1] = this.stack[0] ?? ZERO;
    this.stack[0] = ZERO;
    this.liftEnabled = true;
  }

  clearX(): void {
    this.stack[3] = ZERO;
    this.liftEnabled = false;
  }

  swap(): void {
    const x = this.stack[3] ?? ZERO;
    this.stack[3] = this.stack[2] ?? ZERO;
    this.stack[2] = x;
    this.liftEnabled = true;
  }

  clear(): void {
    this.stack = [ZERO, ZERO, ZERO, ZERO];
    this.liftEnabled = true;
    this.lastX = ZERO;
  }

  recallLastX(): void {
    this.pushNumber(this.lastX);
  }

  private lift(): void {
    this.stack[0] = this.stack[1] ?? ZERO;
    this.stack[1] = this.stack[2] ?? ZERO;
    this.stack[2] = this.stack[3] ?? ZERO;
  }

  private unary(op: UnaryOp): void {
    this.lastX = this.x;
    this.stack[3] = op(this.x);
    this.liftEnabled = true;
  }

  private toRadians(value: NumberValue): NumberValue {
    if (this.angleMode === AngleMode.Rad) return value;
    return value.times(PI).div(180);
  }

  private binary(op: BinaryOp): void {
    this.lastX = this.x;
    const result = op(this.y, this.x);
    this.stack[3] = result;
    this.stack[2] = this.stack[1] ?? ZERO;
    this.stack[1] = this.stack[0] ?? ZERO;
    // T repeats when the HP stack drops after a two-argument operation.
    this.liftEnabled = true;
  }
}

function parseDecimal(token: string): Decimal | undefined {
  try {
    const value = new Decimal(token);
    return value.isFinite() ? value : undefined;
  } catch {
    return undefined;
  }
}

export function decimalPower(a: NumberValue, b: NumberValue): NumberValue {
  if (b.isInteger()) return a.pow(b.toNumber());
  return Decimal.pow(a, b);
}

export function factorial(value: NumberValue): NumberValue {
  if (!value.isInteger() || value.isNegative()) {
    throw new RpnError("factorial requires a non-negative integer");
  }

  let result = new Decimal(1);
  for (let factor = 2; factor <= value.toNumber(); factor += 1) {
    result = result.times(factor);
  }
  return result;
}

export function formatNumber(value: NumberValue, display: DisplaySettings = { mode: DisplayMode.All, digits: MAX_DISPLAY_DIGITS }): string {
  if (display.mode === DisplayMode.Fix) return value.toFixed(display.digits);
  if (display.mode === DisplayMode.Sci) return formatScientific(value, display.digits);
  if (display.mode === DisplayMode.Eng) return formatEngineering(value, display.digits);
  return formatAll(value);
}

function formatAll(value: NumberValue): string {
  if (value.isZero()) return "0";
  const text = value.toSignificantDigits(12).toString();
  if (text.includes("e")) {
    const [mantissa, exponent] = text.split("e");
    return `${stripTrailingDecimalZeros(mantissa ?? "0")}e${formatExponent(Number(exponent ?? 0))}`;
  }
  return stripTrailingDecimalZeros(text);
}

function formatScientific(value: NumberValue, digits: number): string {
  const text = value.toExponential(digits);
  const [mantissa, exponent] = text.split("e");
  return `${mantissa ?? "0"}e${formatExponent(Number(exponent ?? 0))}`;
}

function formatEngineering(value: NumberValue, digits: number): string {
  if (value.isZero()) return `${ZERO.toFixed(digits)}e+0`;

  const exponent = value.abs().logarithm(10).floor().toNumber();
  const engineeringExponent = exponent - modulo(exponent, 3);
  const mantissa = value.div(new Decimal(10).pow(engineeringExponent));
  return `${mantissa.toFixed(digits)}e${formatExponent(engineeringExponent)}`;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function formatExponent(exponent: number): string {
  return exponent >= 0 ? `+${exponent}` : `${exponent}`;
}

function stripTrailingDecimalZeros(text: string): string {
  if (!text.includes(".")) return text;
  return text.replace(/0+$/, "").replace(/\.$/, "");
}

export function formatStack(
  stack: readonly NumberValue[],
  display: DisplaySettings = { mode: DisplayMode.All, digits: MAX_DISPLAY_DIGITS },
  options: { full?: boolean } = {},
): string {
  if (stack.length !== 4) throw new RpnError("expected a four-level stack: T Z Y X");

  if (options.full !== true) return formatNumber(stack[3] ?? ZERO, display);

  const labels = ["T", "Z", "Y", "X"];
  return stack
    .map((value, index) => `${labels[index]}: ${formatNumber(value, display)}`)
    .join("  ");
}
