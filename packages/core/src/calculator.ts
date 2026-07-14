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
export type NumberInput = string | number | bigint;
export type RpnStack = readonly [NumberValue, NumberValue, NumberValue, NumberValue];
export type UnaryOp = (x: NumberValue) => NumberValue;
export type BinaryOp = (a: NumberValue, b: NumberValue) => NumberValue;

type MutableRpnStack = [NumberValue, NumberValue, NumberValue, NumberValue];

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

export interface ReadonlyDisplaySettings {
  readonly mode: DisplayMode;
  readonly digits: number;
  readonly fraction: {
    readonly enabled: boolean;
    readonly maxDenominator: number;
  };
}

export type RpnErrorCode =
  | "unknown_token"
  | "missing_argument"
  | "invalid_argument"
  | "invalid_variable"
  | "divide_by_zero"
  | "domain"
  | "range"
  | "overflow"
  | "invalid_operation";

export interface RpnErrorOptions extends ErrorOptions {
  code?: RpnErrorCode;
  operation?: string;
  token?: string;
}

export class RpnError extends Error {
  readonly code: RpnErrorCode;
  readonly operation?: string;
  readonly token?: string;

  constructor(message: string, options: RpnErrorOptions = {}) {
    super(message, options);
    this.name = "RpnError";
    this.code = options.code ?? "invalid_operation";
    this.operation = options.operation;
    this.token = options.token;
  }
}

export function numberValue(input: NumberInput): NumberValue {
  let value: Decimal;
  try {
    value = new Decimal(input);
  } catch (error) {
    throw new RpnError(`invalid number: ${JSON.stringify(String(input))}`, {
      cause: error,
      code: "invalid_argument",
    });
  }

  if (!value.isFinite()) {
    throw new RpnError("number must be finite", { code: "invalid_argument" });
  }
  return value;
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
    throw new RpnError("fraction denominator must not be zero", { code: "invalid_argument" });
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
  const significantDigits = digits.replace(/^0+(?=.)/, "");
  if (significantDigits.length > spec.maxDigits) {
    throw new RpnError("base input exceeds 36-bit word size", { code: "range" });
  }

  let result = 0n;
  const radix = BigInt(spec.radix);
  for (const digit of significantDigits.toLowerCase()) {
    result = result * radix + BigInt(spec.valueOf(digit));
  }
  if (!isNegative && result >= BASE_UNSIGNED_LIMIT) {
    throw new RpnError("base input exceeds 36-bit word size", { code: "range" });
  }

  const signedResult = isNegative ? -result : fromBaseWord(result);
  if (signedResult < BASE_MIN_BIGINT || signedResult > BASE_MAX_BIGINT) {
    throw new RpnError("base input exceeds 36-bit word size", { code: "range" });
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

export interface CalculatorView {
  readonly angleMode: AngleMode;
  readonly baseMode: BaseMode;
  readonly display: ReadonlyDisplaySettings;
  readonly lastX: NumberValue;
  readonly liftEnabled: boolean;
  readonly stack: RpnStack;
  readonly variables: ReadonlyMap<string, NumberValue>;
}

export interface VariableValue {
  readonly name: string;
  readonly value: NumberValue;
}

interface CalculatorState {
  angleMode: AngleMode;
  baseMode: BaseMode;
  display: DisplaySettings;
  lastX: NumberValue;
  liftEnabled: boolean;
  stack: MutableRpnStack;
  variables: Map<string, NumberValue>;
}

export function createDefaultDisplaySettings(): DisplaySettings {
  return {
    mode: DisplayMode.All,
    digits: MAX_DISPLAY_DECIMAL_PLACES,
    fraction: {
      enabled: false,
      maxDenominator: DEFAULT_FRACTION_DENOMINATOR,
    },
  };
}

export function cloneDisplaySettings(display: DisplaySettings): DisplaySettings {
  return {
    mode: display.mode,
    digits: display.digits,
    fraction: { ...display.fraction },
  };
}

export class RpnCalculator {
  private state: CalculatorState = {
    angleMode: AngleMode.Deg,
    baseMode: BaseMode.Dec,
    display: createDefaultDisplaySettings(),
    lastX: ZERO,
    liftEnabled: true,
    stack: [ZERO, ZERO, ZERO, ZERO],
    variables: new Map<string, NumberValue>(),
  };

  get stack(): RpnStack {
    return [...this.state.stack];
  }

  get liftEnabled(): boolean {
    return this.state.liftEnabled;
  }

  get lastX(): NumberValue {
    return this.state.lastX;
  }

  get display(): DisplaySettings {
    return cloneDisplaySettings(this.state.display);
  }

  get angleMode(): AngleMode {
    return this.state.angleMode;
  }

  get baseMode(): BaseMode {
    return this.state.baseMode;
  }

  get variables(): ReadonlyMap<string, NumberValue> {
    return new Map(this.state.variables);
  }

  view(): CalculatorView {
    return {
      angleMode: this.state.angleMode,
      baseMode: this.state.baseMode,
      display: cloneDisplaySettings(this.state.display),
      lastX: this.state.lastX,
      liftEnabled: this.state.liftEnabled,
      stack: [...this.state.stack],
      variables: new Map(this.state.variables),
    };
  }

  transaction<T>(operation: () => T): T {
    const previousState = cloneCalculatorState(this.state);
    try {
      return operation();
    } catch (error) {
      this.state = previousState;
      throw error;
    }
  }

  get x(): NumberValue {
    return this.state.stack[3];
  }

  get y(): NumberValue {
    return this.state.stack[2];
  }

  get z(): NumberValue {
    return this.state.stack[1];
  }

  get t(): NumberValue {
    return this.state.stack[0];
  }

  pushNumber(value: NumberValue): void {
    assertNumberValue(value, "pushNumber");
    if (!value.isFinite()) {
      throw new RpnError("number must be finite", { code: "invalid_argument" });
    }
    if (this.state.liftEnabled) this.lift();
    this.state.stack[3] = value;
    this.state.liftEnabled = true;
  }

  enter(): void {
    this.lift();
    this.state.liftEnabled = false;
  }

  drop(): void {
    this.state.stack[3] = this.state.stack[2];
    this.state.stack[2] = this.state.stack[1];
    this.state.stack[1] = this.state.stack[0];
    this.state.stack[0] = ZERO;
    this.state.liftEnabled = true;
  }

  clearX(): void {
    this.state.stack[3] = ZERO;
    this.state.liftEnabled = false;
  }

  swap(): void {
    const x = this.state.stack[3];
    this.state.stack[3] = this.state.stack[2];
    this.state.stack[2] = x;
    this.state.liftEnabled = true;
  }

  clear(): void {
    this.state.stack = [ZERO, ZERO, ZERO, ZERO];
    this.state.liftEnabled = true;
    this.state.lastX = ZERO;
  }

  clearVariables(): void {
    this.state.variables.clear();
  }

  clearAll(): void {
    this.clear();
    this.clearVariables();
  }

  recallLastX(): void {
    this.pushNumber(this.state.lastX);
  }

  storeVariable(name: string): void {
    this.state.variables.set(normalizeVariableName(name), this.x);
  }

  recallVariable(name: string): void {
    this.pushNumber(this.state.variables.get(normalizeVariableName(name)) ?? ZERO);
  }

  viewVariable(name: string): VariableValue {
    const normalized = normalizeVariableName(name);
    return { name: normalized, value: this.state.variables.get(normalized) ?? ZERO };
  }

  listVariables(): VariableValue[] {
    const names = [...this.state.variables.keys()].filter(
      (name) => !this.state.variables.get(name)?.isZero(),
    );
    return sortVariableNames(names).map((name) => ({
      name,
      value: this.state.variables.get(name) ?? ZERO,
    }));
  }

  setDisplayMode(mode: DisplayMode, digits: number): void {
    if (!Object.values(DisplayMode).includes(mode)) {
      throw new RpnError(`invalid display mode: ${JSON.stringify(mode)}`, {
        code: "invalid_argument",
      });
    }
    if (!Number.isInteger(digits) || digits < 0 || digits > MAX_DISPLAY_DECIMAL_PLACES) {
      throw new RpnError(`display digit count must be from 0 to ${MAX_DISPLAY_DECIMAL_PLACES}`, {
        code: "range",
      });
    }
    this.state.display.mode = mode;
    this.state.display.digits = digits;
    this.state.display.fraction.enabled = false;
  }

  setAngleMode(mode: AngleMode): void {
    if (!Object.values(AngleMode).includes(mode)) {
      throw new RpnError(`invalid angle mode: ${JSON.stringify(mode)}`, {
        code: "invalid_argument",
      });
    }
    this.state.angleMode = mode;
  }

  setBaseMode(mode: BaseMode): void {
    if (!Object.values(BaseMode).includes(mode)) {
      throw new RpnError(`invalid base mode: ${JSON.stringify(mode)}`, {
        code: "invalid_argument",
      });
    }
    this.state.baseMode = mode;
  }

  toggleFractionDisplay(): void {
    this.state.display.fraction.enabled = !this.state.display.fraction.enabled;
  }

  setFractionDisplay(maxDenominator: number): void {
    if (
      !Number.isInteger(maxDenominator) ||
      maxDenominator < 0 ||
      maxDenominator > MAX_FRACTION_DENOMINATOR
    ) {
      throw new RpnError(
        `fraction denominator must be an integer from 0 to ${MAX_FRACTION_DENOMINATOR}`,
        { code: "range" },
      );
    }

    this.state.display.fraction.maxDenominator =
      maxDenominator === 0 ? DEFAULT_FRACTION_DENOMINATOR : maxDenominator;
    this.state.display.fraction.enabled = true;
  }

  applyUnary(op: UnaryOp, options: { preserveLastX?: boolean } = {}): void {
    this.transaction(() => {
      const previousX = this.x;
      let result: NumberValue;
      try {
        result = op(previousX);
      } catch (error) {
        throw normalizeMathError(error);
      }
      assertNumberValue(result, "unary operation");
      if (!result.isFinite()) {
        throw new RpnError(nonFiniteResultMessage(result), {
          code: result.isNaN() ? "invalid_operation" : "overflow",
        });
      }

      if (options.preserveLastX !== true) this.state.lastX = previousX;
      this.state.stack[3] = result;
      this.state.liftEnabled = true;
    });
  }

  applyBinary(op: BinaryOp): void {
    this.transaction(() => {
      const previousX = this.x;
      let result: NumberValue;
      try {
        result = op(this.y, previousX);
      } catch (error) {
        throw normalizeMathError(error);
      }
      assertNumberValue(result, "binary operation");
      if (!result.isFinite()) {
        throw new RpnError(nonFiniteResultMessage(result), {
          code: result.isNaN() ? "invalid_operation" : "overflow",
        });
      }

      this.state.lastX = previousX;
      this.state.stack[3] = result;
      this.state.stack[2] = this.state.stack[1];
      this.state.stack[1] = this.state.stack[0];
      // T repeats when the HP stack drops after a two-argument operation.
      this.state.liftEnabled = true;
    });
  }

  toRadians(value: NumberValue): NumberValue {
    if (this.state.angleMode === AngleMode.Rad) return value;
    if (this.state.angleMode === AngleMode.Grad) return value.times(PI).div(200);
    return value.times(PI).div(180);
  }

  fromRadians(value: NumberValue): NumberValue {
    if (this.state.angleMode === AngleMode.Rad) return value;
    if (this.state.angleMode === AngleMode.Grad) return value.times(200).div(PI);
    return value.times(180).div(PI);
  }

  private lift(): void {
    this.state.stack[0] = this.state.stack[1];
    this.state.stack[1] = this.state.stack[2];
    this.state.stack[2] = this.state.stack[3];
  }
}

function cloneCalculatorState(state: CalculatorState): CalculatorState {
  return {
    angleMode: state.angleMode,
    baseMode: state.baseMode,
    display: cloneDisplaySettings(state.display),
    lastX: state.lastX,
    liftEnabled: state.liftEnabled,
    stack: [...state.stack],
    variables: new Map(state.variables),
  };
}

export function normalizeVariableName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!/^(?:[a-z]|i)$/.test(normalized)) {
    throw new RpnError(`variable name must be A through Z or i: ${JSON.stringify(name)}`, {
      code: "invalid_variable",
    });
  }
  return normalized;
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

function assertNumberValue(value: unknown, operation: string): asserts value is NumberValue {
  if (!(value instanceof Decimal)) {
    throw new RpnError(`${operation} requires a value created by numberValue`, {
      code: "invalid_argument",
      operation,
    });
  }
}

function normalizeMathError(error: unknown): unknown {
  if (error instanceof RpnError) return error;
  if (error instanceof Error && error.message.startsWith("[DecimalError] ")) {
    const message = error.message.slice("[DecimalError] ".length);
    return new RpnError(`invalid operation (${message.toLowerCase()})`, {
      cause: error,
      code: "invalid_operation",
    });
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
