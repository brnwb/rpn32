import { Decimal } from "decimal.js";

// The HP 32SII displays 12 significant digits and keeps a few guard digits
// internally. This is not a perfect emulation, but Decimal gets us much closer
// than JavaScript's binary floating point for calculator-style arithmetic.
export const WORKING_PRECISION = 15;
export const MAX_DISPLAY_DIGITS = 11;

Decimal.set({ precision: WORKING_PRECISION, rounding: Decimal.ROUND_HALF_UP });

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
  liftEnabled = true;
  lastX: NumberValue = ZERO;
  display: DisplaySettings = { mode: DisplayMode.All, digits: MAX_DISPLAY_DIGITS };
  angleMode: AngleMode = AngleMode.Deg;

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

  recallLastX(): void {
    this.pushNumber(this.lastX);
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
    return value.times(PI).div(180);
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

function nonFiniteResultMessage(result: NumberValue): string {
  if (!result.isNaN()) return "invalid operation (overflow)";
  return "invalid operation";
}
