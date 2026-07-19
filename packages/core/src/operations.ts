import { Decimal } from "./vendor/decimal.js/decimal.mjs";
import { baseBinaryOp, baseDivide, baseModulo } from "./base.js";
import {
  AngleMode,
  BaseMode,
  CalculatorMachine,
  RpnError,
  type BinaryOp,
  type UnaryOp,
} from "./calculator.js";

export function binaryOperations(calc: CalculatorMachine): ReadonlyMap<string, BinaryOp> {
  const entries: [string, BinaryOp][] =
    calc.baseMode === BaseMode.Dec
      ? [
          ["+", (a, b) => a.plus(b)],
          ["-", (a, b) => a.minus(b)],
          ["*", (a, b) => a.times(b)],
          ["/", divide],
          ["^", power],
          ["pow", power],
          ["mod", modulo],
        ]
      : [
          ["+", baseBinaryOp((a, b) => a + b)],
          ["-", baseBinaryOp((a, b) => a - b)],
          ["*", baseBinaryOp((a, b) => a * b)],
          ["/", baseDivide],
          ["mod", baseModulo],
        ];
  return new Map(entries);
}

export function unaryOperations(calc: CalculatorMachine): ReadonlyMap<string, UnaryOp> {
  return new Map<string, UnaryOp>([
    ["sqrt", sqrt],
    ["sq", (x) => x.times(x)],
    ["!", factorial],
    ["fact", factorial],
    ["sin", (x) => exactTrig(calc, x, "sin") ?? Decimal.sin(calc.toRadians(x))],
    ["cos", (x) => exactTrig(calc, x, "cos") ?? Decimal.cos(calc.toRadians(x))],
    ["tan", (x) => exactTrig(calc, x, "tan") ?? Decimal.tan(calc.toRadians(x))],
    ["asin", (x) => calc.fromRadians(inverseTrig(x, (value) => Decimal.asin(value)))],
    ["acos", (x) => calc.fromRadians(inverseTrig(x, (value) => Decimal.acos(value)))],
    ["atan", (x) => calc.fromRadians(Decimal.atan(x))],
    ["sinh", (x) => Decimal.sinh(x)],
    ["cosh", (x) => Decimal.cosh(x)],
    ["tanh", (x) => Decimal.tanh(x)],
    ["asinh", (x) => Decimal.asinh(x)],
    [
      "acosh",
      (x) => {
        if (x.lt(1)) throw new RpnError("invalid operation (hyperbolic domain error)");
        return Decimal.acosh(x);
      },
    ],
    [
      "atanh",
      (x) => {
        if (x.lte(-1) || x.gte(1))
          throw new RpnError("invalid operation (hyperbolic domain error)");
        return Decimal.atanh(x);
      },
    ],
    [
      "ln",
      (x) => {
        if (x.lte(0)) throw new RpnError("invalid operation (logarithm domain error)");
        return Decimal.ln(x);
      },
    ],
    [
      "log",
      (x) => {
        if (x.lte(0)) throw new RpnError("invalid operation (logarithm domain error)");
        return Decimal.log10(x);
      },
    ],
    ["exp", (x) => Decimal.exp(x)],
    ["abs", (x) => x.abs()],
    ["int", (x) => x.trunc()],
    ["fpart", (x) => x.minus(x.trunc())],
    ["floor", (x) => x.floor()],
    ["ceil", (x) => x.ceil()],
    [
      "1/x",
      (x) => {
        if (x.isZero()) throw new RpnError("invalid operation (divide by zero)");
        return new Decimal(1).div(x);
      },
    ],
  ]);
}

function power(a: Decimal, b: Decimal): Decimal {
  if (a.isZero() && b.lte(0)) {
    throw new RpnError("invalid operation (zero base requires a positive exponent)");
  }
  if (b.isInteger()) {
    if (b.abs().gt(Number.MAX_SAFE_INTEGER))
      throw new RpnError("invalid operation (exponent out of range)");
    return a.pow(b.toNumber());
  }
  return Decimal.pow(a, b);
}
function factorial(x: Decimal): Decimal {
  if (!x.isInteger() || x.isNegative() || x.gt(253))
    throw new RpnError("factorial requires an integer from 0 to 253");
  let result = new Decimal(1);
  for (let n = 2; n <= x.toNumber(); n++) result = result.times(n);
  return result;
}
function divide(a: Decimal, b: Decimal): Decimal {
  if (b.isZero()) throw new RpnError("invalid operation (divide by zero)");
  return a.div(b);
}
function modulo(a: Decimal, b: Decimal): Decimal {
  if (b.isZero()) throw new RpnError("invalid operation (divide by zero)");
  return a.mod(b);
}
function sqrt(x: Decimal): Decimal {
  if (x.isNegative()) throw new RpnError("invalid operation (imaginary numbers not supported)");
  return x.sqrt();
}
function inverseTrig(x: Decimal, op: (x: Decimal.Value) => Decimal): Decimal {
  if (x.lt(-1) || x.gt(1))
    throw new RpnError("invalid operation (inverse trigonometry domain error)");
  return op(x);
}
function exactTrig(
  calc: CalculatorMachine,
  x: Decimal,
  op: "sin" | "cos" | "tan",
): Decimal | undefined {
  const unit =
    calc.angleMode === AngleMode.Deg
      ? new Decimal(90)
      : calc.angleMode === AngleMode.Grad
        ? new Decimal(100)
        : undefined;
  if (!unit) return undefined;
  const turns = x.div(unit);
  if (!turns.isInteger()) return undefined;
  const quadrant = ((turns.mod(4).toNumber() % 4) + 4) % 4;
  if (op === "sin")
    return quadrant === 0 || quadrant === 2 ? new Decimal(0) : new Decimal(quadrant === 1 ? 1 : -1);
  if (op === "cos")
    return quadrant === 1 || quadrant === 3 ? new Decimal(0) : new Decimal(quadrant === 0 ? 1 : -1);
  if (quadrant === 1 || quadrant === 3) throw new RpnError("invalid operation (tangent undefined)");
  return new Decimal(0);
}
