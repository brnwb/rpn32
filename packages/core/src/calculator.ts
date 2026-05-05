import { Decimal } from "decimal.js";

// The HP 32SII displays 12 significant digits and keeps a few guard digits
// internally. This is not a perfect emulation, but Decimal gets us much closer
// than JavaScript's binary floating point for calculator-style arithmetic.
export const INTERNAL_PRECISION = 15;
export const DISPLAY_SIGNIFICANT_DIGITS = 12;
export const MAX_DISPLAY_DECIMAL_PLACES = DISPLAY_SIGNIFICANT_DIGITS - 1;

Decimal.set({ precision: INTERNAL_PRECISION, rounding: Decimal.ROUND_HALF_UP });

export type NumberValue = Decimal;
export type UnaryOp = (x: NumberValue) => NumberValue;
export type BinaryOp = (a: NumberValue, b: NumberValue) => NumberValue;

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

export interface DisplaySettings {
  mode: DisplayMode;
  digits: number;
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

export function parseDecimal(token: string): NumberValue | undefined {
  try {
    const value = new Decimal(token);
    return value.isFinite() ? value : undefined;
  } catch {
    return undefined;
  }
}

export class RpnCalculator {
  stack: NumberValue[] = [ZERO, ZERO, ZERO, ZERO];
  messages: string[] = [];
  liftEnabled = true;
  lastX: NumberValue = ZERO;
  display: DisplaySettings = { mode: DisplayMode.All, digits: MAX_DISPLAY_DECIMAL_PLACES };
  angleMode: AngleMode = AngleMode.Deg;
  variables = new Map<string, NumberValue>();

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
  }

  setAngleMode(mode: AngleMode): void {
    this.angleMode = mode;
  }

  applyUnary(op: UnaryOp): void {
    const previousStack = [...this.stack];
    const previousLastX = this.lastX;
    const previousLiftEnabled = this.liftEnabled;

    this.lastX = this.x;
    let result: NumberValue;
    try {
      result = op(this.x);
    } catch (error) {
      this.restore(previousStack, previousLastX, previousLiftEnabled);
      throw error;
    }
    if (!result.isFinite()) {
      this.restore(previousStack, previousLastX, previousLiftEnabled);
      throw new RpnError(nonFiniteResultMessage(result));
    }

    this.stack[3] = result;
    this.liftEnabled = true;
  }

  applyBinary(op: BinaryOp): void {
    const previousStack = [...this.stack];
    const previousLastX = this.lastX;
    const previousLiftEnabled = this.liftEnabled;

    this.lastX = this.x;
    let result: NumberValue;
    try {
      result = op(this.y, this.x);
    } catch (error) {
      this.restore(previousStack, previousLastX, previousLiftEnabled);
      throw error;
    }
    if (!result.isFinite()) {
      this.restore(previousStack, previousLastX, previousLiftEnabled);
      throw new RpnError(nonFiniteResultMessage(result));
    }

    this.stack[3] = result;
    this.stack[2] = this.stack[1] ?? ZERO;
    this.stack[1] = this.stack[0] ?? ZERO;
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
    this.stack[0] = this.stack[1] ?? ZERO;
    this.stack[1] = this.stack[2] ?? ZERO;
    this.stack[2] = this.stack[3] ?? ZERO;
  }

  private restore(stack: NumberValue[], lastX: NumberValue, liftEnabled: boolean): void {
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
