import { Decimal } from "decimal.js";
import { StackUnderflowError } from "./errors.js";
import { type BinaryOp, type UnaryOp } from "./math.js";
import { PI, ZERO, type NumberValue } from "./numbers.js";
import { AngleMode, DisplayMode, MAX_DISPLAY_DIGITS, type DisplaySettings } from "./settings.js";

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
    this.lastX = this.x;
    this.stack[3] = op(this.x);
    this.liftEnabled = true;
  }

  applyBinary(op: BinaryOp): void {
    this.lastX = this.x;
    const result = op(this.y, this.x);
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
}

export function trigOps(calc: RpnCalculator): Pick<Record<string, UnaryOp>, "sin" | "cos" | "tan"> {
  return {
    sin: (x) => Decimal.sin(calc.toRadians(x)),
    cos: (x) => Decimal.cos(calc.toRadians(x)),
    tan: (x) => Decimal.tan(calc.toRadians(x)),
  };
}
