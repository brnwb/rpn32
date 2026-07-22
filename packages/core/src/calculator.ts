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
export type PairOp = (y: NumberValue, x: NumberValue) => [NumberValue, NumberValue];

export const PI = new Decimal("3.14159265358979");
export const E = new Decimal("2.71828182845905");
export const ZERO = new Decimal(0);

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

interface CalculatorSnapshot {
  stack: RpnStack;
  outputs: OutputEvent[];
  liftEnabled: boolean;
  lastX: NumberValue;
  display: DisplaySettings;
  angleMode: AngleMode;
  baseMode: BaseMode;
  variables: Map<string, NumberValue>;
}

export class RpnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RpnError";
  }
}

const DECIMAL_NUMBER_TOKEN = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:e[+-]?\d+)?$/i;

export function parseDecimal(token: string): NumberValue | undefined {
  if (!DECIMAL_NUMBER_TOKEN.test(token)) return undefined;

  try {
    const value = new Decimal(token);
    return value.isFinite() ? value : undefined;
  } catch {
    return undefined;
  }
}

export interface VariableOutput {
  readonly type: "variable";
  readonly name: string;
  readonly value: NumberValue;
}

export interface EmptyVariablesOutput {
  readonly type: "empty-variables";
}

export interface ShowOutput {
  readonly type: "show";
  readonly value: NumberValue;
  readonly baseMode: BaseMode;
}

export type OutputEvent = VariableOutput | EmptyVariablesOutput | ShowOutput;

/** Mutable command target. Internal to the package; not exported from the package root. */
export class CalculatorMachine {
  stack: RpnStack = [ZERO, ZERO, ZERO, ZERO];
  outputs: OutputEvent[] = [];
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

  rollDown(): void {
    const [t, z, y, x] = this.stack;
    this.stack = [x, t, z, y];
    this.liftEnabled = true;
  }

  rollUp(): void {
    const [t, z, y, x] = this.stack;
    this.stack = [z, y, x, t];
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
    this.liftEnabled = true;
  }

  storeVariableArithmetic(name: string, op: BinaryOp): void {
    const normalized = normalizeVariableName(name);
    const current = this.variables.get(normalized) ?? ZERO;
    this.variables.set(
      normalized,
      evaluateOperation(() => op(current, this.x)),
    );
    this.liftEnabled = true;
  }

  recallVariable(name: string): void {
    this.pushNumber(this.variables.get(normalizeVariableName(name)) ?? ZERO);
  }

  recallVariableArithmetic(name: string, op: BinaryOp): void {
    const value = this.variables.get(normalizeVariableName(name)) ?? ZERO;
    this.lastX = this.x;
    this.stack[3] = evaluateOperation(() => op(this.x, value));
    this.liftEnabled = true;
  }

  exchangeVariable(name: string): void {
    const normalized = normalizeVariableName(name);
    const value = this.variables.get(normalized) ?? ZERO;
    this.variables.set(normalized, this.x);
    this.stack[3] = value;
    this.liftEnabled = true;
  }

  changeSign(): void {
    this.stack[3] = this.x.neg();
    this.liftEnabled = true;
  }

  viewVariable(name: string): void {
    const normalized = normalizeVariableName(name);
    const value = this.variables.get(normalized) ?? ZERO;
    this.outputs.push({ type: "variable", name: normalized, value });
  }

  listVariables(): void {
    const names = [...this.variables.keys()].filter((name) => !this.variables.get(name)?.isZero());
    if (names.length === 0) {
      this.outputs.push({ type: "empty-variables" });
      return;
    }

    for (const name of sortVariableNames(names)) {
      this.outputs.push({
        type: "variable",
        name,
        value: this.variables.get(name) ?? ZERO,
      });
    }
  }

  show(): void {
    this.outputs.push({ type: "show", value: this.x, baseMode: this.baseMode });
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

  takeSnapshot(): CalculatorSnapshot {
    return {
      stack: [...this.stack] as RpnStack,
      outputs: [...this.outputs],
      liftEnabled: this.liftEnabled,
      lastX: this.lastX,
      display: { ...this.display, fraction: { ...this.display.fraction } },
      angleMode: this.angleMode,
      baseMode: this.baseMode,
      variables: new Map(this.variables),
    };
  }

  applyUnary(op: UnaryOp): void {
    this.lastX = this.x;
    this.stack[3] = evaluateOperation(() => op(this.x));
    this.liftEnabled = true;
  }

  applyBinary(op: BinaryOp): void {
    this.lastX = this.x;
    this.stack[3] = evaluateOperation(() => op(this.y, this.x));
    this.stack[2] = this.stack[1];
    this.stack[1] = this.stack[0];
    this.liftEnabled = true;
  }

  applyBinaryPreservingY(op: BinaryOp): void {
    this.lastX = this.x;
    this.stack[3] = evaluateOperation(() => op(this.y, this.x));
    this.liftEnabled = true;
  }

  applyPair(op: PairOp): void {
    this.lastX = this.x;
    let result: [NumberValue, NumberValue];
    try {
      result = op(this.y, this.x);
    } catch (error) {
      throw normalizeMathError(error);
    }
    const [y, x] = result;
    if (!y.isFinite()) throw new RpnError(nonFiniteResultMessage(y));
    if (!x.isFinite()) throw new RpnError(nonFiniteResultMessage(x));
    this.stack[2] = y;
    this.stack[3] = x;
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

  private lift(): void {
    this.stack[0] = this.stack[1];
    this.stack[1] = this.stack[2];
    this.stack[2] = this.stack[3];
  }

  restoreSnapshot(snapshot: CalculatorSnapshot): void {
    this.stack = snapshot.stack;
    this.outputs = snapshot.outputs;
    this.liftEnabled = snapshot.liftEnabled;
    this.lastX = snapshot.lastX;
    this.display = snapshot.display;
    this.angleMode = snapshot.angleMode;
    this.baseMode = snapshot.baseMode;
    this.variables = snapshot.variables;
  }
}

function normalizeVariableName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!/^(?:[a-z]|i)$/.test(normalized)) {
    throw new RpnError(`variable name must be A through Z or i: ${JSON.stringify(name)}`);
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

function evaluateOperation(op: () => NumberValue): NumberValue {
  let result: NumberValue;
  try {
    result = op();
  } catch (error) {
    throw normalizeMathError(error);
  }
  if (!result.isFinite()) throw new RpnError(nonFiniteResultMessage(result));
  return result;
}

function normalizeMathError(error: unknown): unknown {
  if (error instanceof RpnError) return error;
  if (error instanceof Error && error.message.startsWith("[DecimalError] ")) {
    const message = error.message.slice("[DecimalError] ".length);
    return new RpnError(`invalid operation (${message.toLowerCase()})`);
  }
  return error;
}
