import { Decimal } from "./vendor/decimal.js/decimal.mjs";
import { baseBinaryOp, baseDivide, baseModulo } from "./base.js";
import {
  AngleMode,
  BaseMode,
  CalculatorMachine,
  INTERNAL_PRECISION,
  PI,
  RpnError,
  type BinaryOp,
  type PairOp,
  type UnaryOp,
} from "./calculator.js";

const ONE_HUNDRED = new Decimal(100);
const POUNDS_PER_KILOGRAM = new Decimal("2.20462262184878");
const CENTIMETERS_PER_INCH = new Decimal("2.54");
const LITERS_PER_GALLON = new Decimal("3.785411784");
const GammaDecimal = Decimal.clone({
  precision: INTERNAL_PRECISION + 15,
  rounding: Decimal.ROUND_HALF_UP,
});
const GAMMA_PI = new GammaDecimal("3.1415926535897932384626433832795028841971693993751");
const LANCZOS_COEFFICIENTS = [
  "0.99999999999980993",
  "676.5203681218851",
  "-1259.1392167224028",
  "771.32342877765313",
  "-176.61502916214059",
  "12.507343278686905",
  "-0.13857109526572012",
  "0.0000099843695780195716",
  "0.00000015056327351493116",
].map((value) => new GammaDecimal(value));
const SQRT_TWO_PI = new GammaDecimal("2.5066282746310005024157652848110452530069867406099");
const LN_TEN = GammaDecimal.ln(10);
const MIN_FACTORIAL_LOG_MAGNITUDE = LN_TEN.times(-499);
const MAX_FACTORIAL_LOG_MAGNITUDE = GammaDecimal.ln("9.99999999999e499");

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
          ["xroot", xthRoot],
          ["mod", modulo],
        ]
      : [
          ["+", baseBinaryOp((a, b) => a + b)],
          ["-", baseBinaryOp((a, b) => a - b)],
          ["*", baseBinaryOp((a, b) => a * b)],
          ["/", baseDivide],
          ["mod", baseModulo],
        ];
  const probabilityOperand = (value: Decimal): Decimal =>
    calc.baseMode === BaseMode.Dec ? value : value.trunc();
  return new Map([
    ...entries,
    ["ncr", (n, r) => combinations(probabilityOperand(n), probabilityOperand(r))],
    ["npr", (n, r) => permutations(probabilityOperand(n), probabilityOperand(r))],
  ]);
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
    ["10^x", (x) => Decimal.pow(10, x)],
    ["alog", (x) => Decimal.pow(10, x)],
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
    [">hms", decimalToHms],
    [">hr", hmsToDecimal],
    [">rad", (x) => x.times(PI).div(180)],
    [">deg", (x) => x.times(180).div(PI)],
    [">kg", (x) => x.div(POUNDS_PER_KILOGRAM)],
    [">lb", (x) => x.times(POUNDS_PER_KILOGRAM)],
    [">c", (x) => x.minus(32).times(5).div(9)],
    [">f", (x) => x.times(9).div(5).plus(32)],
    [">cm", (x) => x.times(CENTIMETERS_PER_INCH)],
    [">in", (x) => x.div(CENTIMETERS_PER_INCH)],
    [">l", (x) => x.times(LITERS_PER_GALLON)],
    [">gal", (x) => x.div(LITERS_PER_GALLON)],
  ]);
}

export const percent: BinaryOp = (y, x) => y.times(x).div(ONE_HUNDRED);

export const percentChange: BinaryOp = (y, x) => {
  if (y.isZero()) throw new RpnError("invalid operation (percent change requires a nonzero base)");
  return x.minus(y).times(ONE_HUNDRED).div(y);
};

export function rectangularToPolar(calc: CalculatorMachine): PairOp {
  return (y, x) => {
    const radius = x.times(x).plus(y.times(y)).sqrt();
    const angle = calc.fromRadians(Decimal.atan2(y, x));
    return [angle, radius];
  };
}

export function polarToRectangular(calc: CalculatorMachine): PairOp {
  return (angle, radius) => {
    const radians = calc.toRadians(angle);
    const sine = exactTrig(calc, angle, "sin") ?? Decimal.sin(radians);
    const cosine = exactTrig(calc, angle, "cos") ?? Decimal.cos(radians);
    return [radius.times(sine), radius.times(cosine)];
  };
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

function xthRoot(radicand: Decimal, index: Decimal): Decimal {
  if (index.isZero()) throw new RpnError("invalid operation (root index must be nonzero)");
  if (radicand.isZero() && index.isNegative()) {
    throw new RpnError("invalid operation (zero cannot have a negative root index)");
  }
  if (radicand.isNegative()) {
    if (!index.isInteger() || index.abs().mod(2).isZero()) {
      throw new RpnError("invalid operation (negative radicand requires an odd integer root)");
    }
    return Decimal.pow(radicand.neg(), new Decimal(1).div(index)).neg();
  }
  return Decimal.pow(radicand, new Decimal(1).div(index));
}

function factorial(x: Decimal): Decimal {
  if (x.isNegative() && x.isInteger()) {
    throw new RpnError("factorial or gamma is undefined for negative integers");
  }
  if (x.gt(253)) throw new RpnError("factorial or gamma input is out of range");
  if (!x.isInteger()) {
    const result = gammaFactorial(x);
    if (!result.isFinite() || result.e > 499) throw new RpnError("invalid operation (overflow)");
    return result.isZero() || result.e >= -499 ? result : new Decimal(0);
  }

  let value = new Decimal(1);
  for (let n = 2; n <= x.toNumber(); n++) value = value.times(n);
  return value;
}

function gammaFactorial(x: Decimal): Decimal {
  const value = new GammaDecimal(x);
  if (value.lt("-0.5")) {
    const sine = sinPi(value);
    const logMagnitude = GAMMA_PI.ln().minus(sine.abs().ln()).minus(logGamma(value.neg()));
    if (logMagnitude.lt(MIN_FACTORIAL_LOG_MAGNITUDE)) return new Decimal(0);
    if (logMagnitude.gt(MAX_FACTORIAL_LOG_MAGNITUDE)) {
      throw new RpnError("invalid operation (overflow)");
    }
    const magnitude = GammaDecimal.exp(logMagnitude);
    return gammaResult(sine.isNegative() ? magnitude : magnitude.neg());
  }
  return gammaResult(gamma(value.plus(1)));
}

function gamma(value: Decimal): Decimal {
  const { shifted, series, base } = lanczos(value);
  return SQRT_TWO_PI.times(base.pow(shifted.plus("0.5")))
    .times(GammaDecimal.exp(base.neg()))
    .times(series);
}

function logGamma(value: Decimal): Decimal {
  const { shifted, series, base } = lanczos(value);
  return SQRT_TWO_PI.ln()
    .plus(base.ln().times(shifted.plus("0.5")))
    .minus(base)
    .plus(series.ln());
}

function lanczos(value: Decimal): { shifted: Decimal; series: Decimal; base: Decimal } {
  const shifted = value.minus(1);
  let series = LANCZOS_COEFFICIENTS[0] ?? new Decimal(0);
  for (let index = 1; index < LANCZOS_COEFFICIENTS.length; index++) {
    series = series.plus((LANCZOS_COEFFICIENTS[index] ?? new Decimal(0)).div(shifted.plus(index)));
  }
  const base = shifted.plus("7.5");
  return { shifted, series, base };
}

function sinPi(value: Decimal): Decimal {
  const nearestInteger = value.round();
  const reduced = value.minus(nearestInteger);
  const sine = GammaDecimal.sin(GAMMA_PI.times(reduced));
  return nearestInteger.abs().mod(2).isZero() ? sine : sine.neg();
}

function gammaResult(value: Decimal): Decimal {
  return new Decimal(value.toSignificantDigits(INTERNAL_PRECISION));
}

function combinations(n: Decimal, r: Decimal): Decimal {
  const { nValue, rValue } = probabilityInputs(n, r);
  const count = Math.min(rValue, nValue - rValue);
  let result = new Decimal(1);
  for (let index = 1; index <= count; index++) {
    result = result.times(nValue - count + index).div(index);
    if (result.e > 499) throw new RpnError("invalid operation (overflow)");
  }
  return result;
}

function permutations(n: Decimal, r: Decimal): Decimal {
  const { nValue, rValue } = probabilityInputs(n, r);
  let result = new Decimal(1);
  for (let index = 0; index < rValue; index++) {
    result = result.times(nValue - index);
    if (result.e > 499) throw new RpnError("invalid operation (overflow)");
  }
  return result;
}

function probabilityInputs(n: Decimal, r: Decimal): { nValue: number; rValue: number } {
  if (!n.isInteger() || !r.isInteger() || n.isNegative() || r.isNegative() || r.gt(n)) {
    throw new RpnError(
      "probability operands require nonnegative integers with r no greater than n",
    );
  }
  if (n.gte("1e12")) {
    throw new RpnError("probability operands are out of range");
  }
  return { nValue: n.toNumber(), rValue: r.toNumber() };
}

function decimalToHms(value: Decimal): Decimal {
  const negative = value.isNegative();
  const absolute = value.abs().toSignificantDigits(INTERNAL_PRECISION);
  const hours = absolute.trunc();
  const totalSeconds = absolute.minus(hours).times(3600);
  const minutes = totalSeconds.div(60).trunc();
  const seconds = totalSeconds.minus(minutes.times(60));
  const converted = hours.plus(minutes.div(100)).plus(seconds.div(10000));
  return negative ? converted.neg() : converted;
}

function hmsToDecimal(value: Decimal): Decimal {
  const negative = value.isNegative();
  const absolute = value.abs();
  const hours = absolute.trunc();
  const encodedMinutes = absolute.minus(hours).times(100);
  const minutes = encodedMinutes.trunc();
  const seconds = encodedMinutes.minus(minutes).times(100);
  const converted = hours.plus(minutes.div(60)).plus(seconds.div(3600));
  return negative ? converted.neg() : converted;
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
