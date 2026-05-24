import { Decimal } from "./vendor/decimal.js/decimal.mjs";

// The HP 32SII displays 12 significant digits and keeps a few guard digits
// internally. This is not a perfect emulation, but Decimal gets us much closer
// than JavaScript's binary floating point for calculator-style arithmetic.
export const INTERNAL_PRECISION = 15;
export const DISPLAY_SIGNIFICANT_DIGITS = 12;
export const MAX_DISPLAY_DECIMAL_PLACES = DISPLAY_SIGNIFICANT_DIGITS - 1;
export const DEFAULT_FRACTION_DENOMINATOR = 4095;
export const MAX_FRACTION_DENOMINATOR = 4095;

Decimal.set({ precision: INTERNAL_PRECISION, rounding: Decimal.ROUND_HALF_UP });

export type NumberValue = Decimal;
export type RpnStack = [NumberValue, NumberValue, NumberValue, NumberValue];
export type UnaryOp = (x: NumberValue) => NumberValue;
export type BinaryOp = (a: NumberValue, b: NumberValue) => NumberValue;

export const PI = new Decimal("3.14159265358979");
export const E = new Decimal("2.71828182845905");
export const ZERO = new Decimal(0);
export const BASE_MIN_INTEGER = new Decimal("-34359738368");
export const BASE_MAX_INTEGER = new Decimal("34359738367");

const BASE_WORD_BITS = 36n;
const BASE_UNSIGNED_LIMIT = 1n << BASE_WORD_BITS;
const BASE_SIGN_BIT = 1n << (BASE_WORD_BITS - 1n);
const BASE_MIN_BIGINT = -(1n << (BASE_WORD_BITS - 1n));
const BASE_MAX_BIGINT = (1n << (BASE_WORD_BITS - 1n)) - 1n;

export enum DisplayMode {
  All = "all",
  Fix = "fix",
  Sci = "sci",
  Eng = "eng",
}

export enum AngleMode {
  Deg = "deg",
  Rad = "rad",
  Grad = "grad",
}

export enum BaseMode {
  Dec = "dec",
  Hex = "hex",
  Oct = "oct",
  Bin = "bin",
}

export interface DisplaySettings {
  mode: DisplayMode;
  digits: number;
  fraction: {
    enabled: boolean;
    maxDenominator: number;
  };
}

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

const DECIMAL_NUMBER_TOKEN = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:e[+-]?\d+)?$/i;
const FRACTION_NUMBER_TOKEN = /^([+-]?)(?:(\d+)\.(\d+)\.(\d+)|(\d+)\.\.(\d+))$/;

export function parseDecimal(token: string): NumberValue | undefined {
  if (!DECIMAL_NUMBER_TOKEN.test(token)) return undefined;

  try {
    const value = new Decimal(token);
    return value.isFinite() ? value : undefined;
  } catch {
    return undefined;
  }
}

export function parseFraction(token: string): NumberValue | undefined {
  const match = token.match(FRACTION_NUMBER_TOKEN);
  if (!match) return undefined;

  const [
    ,
    sign = "",
    mixedIntegerPart = "",
    mixedNumeratorPart = "",
    mixedDenominatorPart = "",
    numeratorPart = "",
    denominatorPart = "",
  ] = match;

  const numerator = new Decimal(mixedNumeratorPart || numeratorPart);
  const denominator = new Decimal(mixedDenominatorPart || denominatorPart);
  if (denominator.isZero()) {
    throw new RpnError("fraction denominator must not be zero");
  }

  const mixedInteger = mixedIntegerPart === "" ? ZERO : new Decimal(mixedIntegerPart);
  const magnitude = mixedInteger.plus(numerator.div(denominator));
  return sign === "-" ? magnitude.neg() : magnitude;
}

export function parseBaseInteger(token: string, baseMode: BaseMode): NumberValue | undefined {
  const spec = baseSpec(baseMode);
  if (spec === undefined) return undefined;

  const normalized = token.trim();
  const isNegative = normalized.startsWith("-");
  const digits =
    normalized.startsWith("-") || normalized.startsWith("+") ? normalized.slice(1) : normalized;
  if (digits === "" || !spec.digits.test(digits)) return undefined;
  if (digits.length > spec.maxDigits) {
    throw new RpnError("base input exceeds 36-bit word size");
  }

  let result = 0n;
  const radix = BigInt(spec.radix);
  for (const digit of digits.toLowerCase()) {
    result = result * radix + BigInt(spec.valueOf(digit));
  }
  if (!isNegative && result >= BASE_UNSIGNED_LIMIT) {
    throw new RpnError("base input exceeds 36-bit word size");
  }

  const signedResult = isNegative ? -result : fromBaseWord(result);
  if (signedResult < BASE_MIN_BIGINT || signedResult > BASE_MAX_BIGINT) {
    throw new RpnError("base input exceeds 36-bit word size");
  }

  return new Decimal(signedResult.toString());
}

export function baseIntegerFromDecimal(value: NumberValue): bigint | undefined {
  const integer = value.trunc();
  if (integer.lt(BASE_MIN_INTEGER) || integer.gt(BASE_MAX_INTEGER)) return undefined;
  return BigInt(integer.toFixed(0));
}

export function clampBaseInteger(value: bigint): bigint {
  if (value < BASE_MIN_BIGINT) return BASE_MIN_BIGINT;
  if (value > BASE_MAX_BIGINT) return BASE_MAX_BIGINT;
  return value;
}

export function toBaseWord(value: bigint): bigint {
  return value < 0n ? value + BASE_UNSIGNED_LIMIT : value;
}

export function approximateFraction(value: NumberValue, maxDenominator: number): [bigint, bigint] {
  const limit = Math.max(1, maxDenominator);
  let bestNumerator = 0n;
  let bestDenominator = 1n;
  let bestError: Decimal | undefined;

  for (let denominator = 1; denominator <= limit; denominator += 1) {
    const denominatorDecimal = new Decimal(denominator);
    const numeratorDecimal = value.times(denominator).round();
    const error = value.minus(numeratorDecimal.div(denominatorDecimal)).abs();

    if (
      bestError === undefined ||
      error.lt(bestError) ||
      (error.eq(bestError) && denominator < Number(bestDenominator))
    ) {
      bestError = error;
      bestNumerator = BigInt(numeratorDecimal.toFixed(0));
      bestDenominator = BigInt(denominator);
      if (error.isZero()) break;
    }
  }

  const divisor = gcd(bestNumerator, bestDenominator);
  return [bestNumerator / divisor, bestDenominator / divisor];
}

function fromBaseWord(value: bigint): bigint {
  return value >= BASE_SIGN_BIT ? value - BASE_UNSIGNED_LIMIT : value;
}

function gcd(a: bigint, b: bigint): bigint {
  let left = a < 0n ? -a : a;
  let right = b < 0n ? -b : b;
  while (right !== 0n) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left === 0n ? 1n : left;
}

export class RpnCalculator {
  stack: RpnStack = [ZERO, ZERO, ZERO, ZERO];
  messages: string[] = [];
  liftEnabled = true;
  lastX: NumberValue = ZERO;
  display: DisplaySettings = {
    mode: DisplayMode.All,
    digits: MAX_DISPLAY_DECIMAL_PLACES,
    fraction: {
      enabled: false,
      maxDenominator: DEFAULT_FRACTION_DENOMINATOR,
    },
  };
  angleMode: AngleMode = AngleMode.Deg;
  baseMode: BaseMode = BaseMode.Dec;
  variables = new Map<string, NumberValue>();

  get x(): NumberValue {
    return this.stack[3];
  }

  get y(): NumberValue {
    return this.stack[2];
  }

  get z(): NumberValue {
    return this.stack[1];
  }

  get t(): NumberValue {
    return this.stack[0];
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
    this.stack[3] = this.stack[2];
    this.stack[2] = this.stack[1];
    this.stack[1] = this.stack[0];
    this.stack[0] = ZERO;
    this.liftEnabled = true;
  }

  clearX(): void {
    this.stack[3] = ZERO;
    this.liftEnabled = false;
  }

  swap(): void {
    const x = this.stack[3];
    this.stack[3] = this.stack[2];
    this.stack[2] = x;
    this.liftEnabled = true;
  }

  clear(): void {
    this.stack = [ZERO, ZERO, ZERO, ZERO];
    this.liftEnabled = true;
    this.lastX = ZERO;
  }

  clearVariables(): void {
    this.variables.clear();
  }

  clearAll(): void {
    this.clear();
    this.clearVariables();
  }

  recallLastX(): void {
    this.pushNumber(this.lastX);
  }

  storeVariable(name: string): void {
    this.variables.set(normalizeVariableName(name), this.x);
  }

  recallVariable(name: string): void {
    this.pushNumber(this.variables.get(normalizeVariableName(name)) ?? ZERO);
  }

  viewVariable(name: string): void {
    const normalized = normalizeVariableName(name);
    const value = this.variables.get(normalized) ?? ZERO;
    this.messages.push(`${formatVariableName(normalized)}: ${value.toString()}`);
  }

  listVariables(): void {
    const names = [...this.variables.keys()].filter((name) => !this.variables.get(name)?.isZero());
    if (names.length === 0) {
      this.messages.push("no variables");
      return;
    }

    for (const name of sortVariableNames(names)) {
      this.messages.push(
        `${formatVariableName(name)}: ${this.variables.get(name)?.toString() ?? "0"}`,
      );
    }
  }

  takeMessages(): string[] {
    const messages = this.messages;
    this.messages = [];
    return messages;
  }

  setDisplayMode(mode: DisplayMode, digits: number): void {
    this.display.mode = mode;
    this.display.digits = digits;
    this.display.fraction.enabled = false;
  }

  setAngleMode(mode: AngleMode): void {
    this.angleMode = mode;
  }

  setBaseMode(mode: BaseMode): void {
    this.baseMode = mode;
  }

  toggleFractionDisplay(): void {
    this.display.fraction.enabled = !this.display.fraction.enabled;
  }

  setFractionDisplay(maxDenominator: number): void {
    if (
      !Number.isInteger(maxDenominator) ||
      maxDenominator < 0 ||
      maxDenominator > MAX_FRACTION_DENOMINATOR
    ) {
      throw new RpnError(
        `fraction denominator must be an integer from 0 to ${MAX_FRACTION_DENOMINATOR}`,
      );
    }

    this.display.fraction.maxDenominator =
      maxDenominator === 0 ? DEFAULT_FRACTION_DENOMINATOR : maxDenominator;
    this.display.fraction.enabled = true;
  }

  applyUnary(op: UnaryOp): void {
    const previousStack: RpnStack = [...this.stack];
    const previousLastX = this.lastX;
    const previousLiftEnabled = this.liftEnabled;

    this.lastX = this.x;
    let result: NumberValue;
    try {
      result = op(this.x);
    } catch (error) {
      this.restore(previousStack, previousLastX, previousLiftEnabled);
      throw normalizeMathError(error);
    }
    if (!result.isFinite()) {
      this.restore(previousStack, previousLastX, previousLiftEnabled);
      throw new RpnError(nonFiniteResultMessage(result));
    }

    this.stack[3] = result;
    this.liftEnabled = true;
  }

  applyBinary(op: BinaryOp): void {
    const previousStack: RpnStack = [...this.stack];
    const previousLastX = this.lastX;
    const previousLiftEnabled = this.liftEnabled;

    this.lastX = this.x;
    let result: NumberValue;
    try {
      result = op(this.y, this.x);
    } catch (error) {
      this.restore(previousStack, previousLastX, previousLiftEnabled);
      throw normalizeMathError(error);
    }
    if (!result.isFinite()) {
      this.restore(previousStack, previousLastX, previousLiftEnabled);
      throw new RpnError(nonFiniteResultMessage(result));
    }

    this.stack[3] = result;
    this.stack[2] = this.stack[1];
    this.stack[1] = this.stack[0];
    // T repeats when the HP stack drops after a two-argument operation.
    this.liftEnabled = true;
  }

  toRadians(value: NumberValue): NumberValue {
    if (this.angleMode === AngleMode.Rad) return value;
    if (this.angleMode === AngleMode.Grad) return value.times(PI).div(200);
    return value.times(PI).div(180);
  }

  fromRadians(value: NumberValue): NumberValue {
    if (this.angleMode === AngleMode.Rad) return value;
    if (this.angleMode === AngleMode.Grad) return value.times(200).div(PI);
    return value.times(180).div(PI);
  }

  requireStackDepth(count: number): void {
    if (count > 4) {
      throw new StackUnderflowError("the HP-style stack only has four levels");
    }
  }

  private lift(): void {
    this.stack[0] = this.stack[1];
    this.stack[1] = this.stack[2];
    this.stack[2] = this.stack[3];
  }

  private restore(stack: RpnStack, lastX: NumberValue, liftEnabled: boolean): void {
    this.stack = stack;
    this.lastX = lastX;
    this.liftEnabled = liftEnabled;
  }
}

export function normalizeVariableName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!/^(?:[a-z]|i)$/.test(normalized)) {
    throw new RpnError(`variable name must be A through Z or i: ${JSON.stringify(name)}`);
  }
  return normalized;
}

function formatVariableName(name: string): string {
  return name === "i" ? "i" : name.toUpperCase();
}

function sortVariableNames(names: string[]): string[] {
  return [...names].sort((left: string, right: string) => {
    if (left === "i") return right === "i" ? 0 : 1;
    if (right === "i") return -1;
    return left.localeCompare(right);
  });
}

function nonFiniteResultMessage(result: NumberValue): string {
  if (!result.isNaN()) return "invalid operation (overflow)";
  return "invalid operation";
}

function normalizeMathError(error: unknown): unknown {
  if (error instanceof RpnError) return error;
  if (error instanceof Error && error.message.startsWith("[DecimalError] ")) {
    const message = error.message.slice("[DecimalError] ".length);
    return new RpnError(`invalid operation (${message.toLowerCase()})`);
  }
  return error;
}

function baseSpec(baseMode: BaseMode):
  | {
      digits: RegExp;
      maxDigits: number;
      radix: number;
      valueOf: (digit: string) => number;
    }
  | undefined {
  switch (baseMode) {
    case BaseMode.Hex:
      return {
        digits: /^[0-9a-f]+$/i,
        maxDigits: 9,
        radix: 16,
        valueOf: (digit) => Number.parseInt(digit, 16),
      };
    case BaseMode.Oct:
      return {
        digits: /^[0-7]+$/,
        maxDigits: 12,
        radix: 8,
        valueOf: (digit) => Number.parseInt(digit, 8),
      };
    case BaseMode.Bin:
      return {
        digits: /^[01]+$/,
        maxDigits: 36,
        radix: 2,
        valueOf: (digit) => Number.parseInt(digit, 2),
      };
    case BaseMode.Dec:
      return undefined;
  }
}
