import { Decimal } from "decimal.js";
import { describe, expect, test } from "vitest";

import {
  AngleMode,
  DisplayMode,
  RpnCalculator,
  ZERO,
  formatNumber,
  formatStack,
  processLine,
} from "../src/index.js";

const d = (value: string | number): Decimal => new Decimal(value);

const expectStack = (calc: RpnCalculator, expected: Decimal[]): void => {
  expect(calc.stack.map((value) => value.toString())).toEqual(
    expected.map((value) => value.toString()),
  );
};

describe("RpnCalculator", () => {
  test("initial stack is four zero registers", () => {
    const calc = new RpnCalculator();
    expectStack(calc, [ZERO, ZERO, ZERO, ZERO]);
    expect(calc.x.eq(ZERO)).toBe(true);
  });

  test("one-line expression", () => {
    const calc = new RpnCalculator();
    processLine(calc, "3 2 +");
    expectStack(calc, [ZERO, ZERO, ZERO, d(5)]);
  });

  test("old-school entry with return between numbers", () => {
    const calc = new RpnCalculator();
    processLine(calc, "3");
    processLine(calc, "2");
    processLine(calc, "+");
    expectStack(calc, [ZERO, ZERO, ZERO, d(5)]);
  });

  test("enter copies X to Y and next number replaces X", () => {
    const calc = new RpnCalculator();
    processLine(calc, "3 enter");
    expectStack(calc, [ZERO, ZERO, d(3), d(3)]);

    processLine(calc, "2");
    expectStack(calc, [ZERO, ZERO, d(3), d(2)]);

    processLine(calc, "+");
    expectStack(calc, [ZERO, ZERO, ZERO, d(5)]);
  });

  test("enter allows square by multiplication", () => {
    const calc = new RpnCalculator();
    processLine(calc, "3 enter *");
    expectStack(calc, [ZERO, ZERO, ZERO, d(9)]);
  });

  test("stack lift repeats T register", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1 2 3 4 5");
    expectStack(calc, [d(2), d(3), d(4), d(5)]);
  });

  test("binary operation drops stack and repeats T", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1 2 3 4 +");
    expectStack(calc, [d(1), d(1), d(2), d(7)]);
  });

  test("number after binary operation lifts result", () => {
    const calc = new RpnCalculator();
    processLine(calc, "3 2 + 4 *");
    expect(calc.x.eq(20)).toBe(true);
  });

  test("lastx remembers X before binary operation", () => {
    const calc = new RpnCalculator();
    processLine(calc, "3 2 + lastx");
    expectStack(calc, [ZERO, ZERO, d(5), d(2)]);
  });

  test("lastx remembers X before unary operation", () => {
    const calc = new RpnCalculator();
    processLine(calc, "9 sqrt lastx");
    expectStack(calc, [ZERO, ZERO, d(3), d(9)]);
  });

  test("lastx can reverse division", () => {
    const calc = new RpnCalculator();
    processLine(calc, "10 4 / lastx *");
    expect(calc.x.eq(10)).toBe(true);
  });

  test("stack, entry, display, and angle commands do not update lastx", () => {
    const calc = new RpnCalculator();
    processLine(calc, "8 2 /");
    expect(calc.lastX.eq(2)).toBe(true);

    processLine(calc, "9 enter 10 swap drop clx rad deg fix 2 all pi e");
    expect(calc.lastX.eq(2)).toBe(true);
  });

  test("recalling lastx does not change lastx", () => {
    const calc = new RpnCalculator();
    processLine(calc, "8 2 / lastx");
    expect(calc.x.eq(2)).toBe(true);
    expect(calc.lastX.eq(2)).toBe(true);
  });

  test("invalid operations preserve lastx", () => {
    const calc = new RpnCalculator();
    processLine(calc, "8 2 / -1");
    expect(calc.lastX.eq(2)).toBe(true);

    expect(() => processLine(calc, "sqrt")).toThrow(
      "invalid operation (imaginary numbers not supported)",
    );
    expect(calc.lastX.eq(2)).toBe(true);
  });

  test("clear resets lastx", () => {
    const calc = new RpnCalculator();
    processLine(calc, "8 2 / clear");
    expect(calc.lastX.eq(0)).toBe(true);
  });

  test("store and recall variables", () => {
    const calc = new RpnCalculator();
    processLine(calc, "42 sto A clear rcl A");
    expectStack(calc, [ZERO, ZERO, ZERO, d(42)]);
  });

  test("store does not modify the stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1 2 sto B");
    expectStack(calc, [ZERO, ZERO, d(1), d(2)]);
  });

  test("recall lifts the stack and uninitialized variables recall zero", () => {
    const calc = new RpnCalculator();
    processLine(calc, "7 rcl C");
    expectStack(calc, [ZERO, ZERO, d(7), ZERO]);
  });

  test("variable names are case-insensitive and include i", () => {
    const calc = new RpnCalculator();
    processLine(calc, "12 sto i clear rcl I");
    expectStack(calc, [ZERO, ZERO, ZERO, d(12)]);
  });

  test("invalid variable commands roll back the whole input line", () => {
    const calc = new RpnCalculator();
    processLine(calc, "20");
    expect(() => processLine(calc, "30 sto AA")).toThrow("variable name must be A through Z or i");
    expectStack(calc, [ZERO, ZERO, ZERO, d(20)]);
  });

  test("clear var clears variables without clearing the stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "42 sto A 7 clear var rcl A");
    expectStack(calc, [ZERO, d(42), d(7), ZERO]);
  });

  test("clear all clears stack lastx and variables", () => {
    const calc = new RpnCalculator();
    processLine(calc, "42 sto A 8 2 / clear all rcl A");
    expect(calc.lastX.eq(0)).toBe(true);
    expectStack(calc, [ZERO, ZERO, ZERO, ZERO]);
  });

  test("view shows a variable without changing the stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "42 sto A 123 view A");
    expect(calc.messages).toEqual(["A: 42"]);
    expectStack(calc, [ZERO, ZERO, d(42), d(123)]);
  });

  test("vars lists nonzero variables sorted by name with i last", () => {
    const calc = new RpnCalculator();
    processLine(calc, "3 sto C 1 sto A 2 sto i vars");
    expect(calc.messages).toEqual(["A: 1", "C: 3", "i: 2"]);
    expectStack(calc, [ZERO, d(3), d(1), d(2)]);
  });

  test("vars reports no variables when none are nonzero", () => {
    const calc = new RpnCalculator();
    processLine(calc, "vars");
    expect(calc.messages).toEqual(["no variables"]);
    expectStack(calc, [ZERO, ZERO, ZERO, ZERO]);
  });

  test("takeMessages returns and clears display messages", () => {
    const calc = new RpnCalculator();
    processLine(calc, "42 sto A view A");
    expect(calc.takeMessages()).toEqual(["A: 42"]);
    expect(calc.takeMessages()).toEqual([]);
    expectStack(calc, [ZERO, ZERO, ZERO, d(42)]);
  });

  test("decimal arithmetic avoids binary floating point surprises", () => {
    const calc = new RpnCalculator();
    processLine(calc, "0.1 0.2 +");
    expect(calc.x.toString()).toBe("0.3");
  });

  test("decimal arithmetic keeps common decimal sums exact", () => {
    const calc = new RpnCalculator();
    processLine(calc, "0.1 0.2 + 0.3 -");
    expect(calc.x.toString()).toBe("0");
  });

  test("division and multiplication round consistently at internal precision", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1 3 / 3 *");
    expect(calc.x.toString()).toBe("0.999999999999999");
  });

  test("integer powers stay exact within internal precision", () => {
    const calc = new RpnCalculator();
    processLine(calc, "2 10 ^");
    expect(calc.x.toString()).toBe("1024");
  });

  test("negative base fractional power is rejected and preserves stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "-8 0.333333333333333");
    expect(() => processLine(calc, "^")).toThrow("invalid operation");
    expectStack(calc, [ZERO, ZERO, d(-8), d("0.333333333333333")]);
  });

  test("unknown token rolls back the whole input line", () => {
    const calc = new RpnCalculator();
    processLine(calc, "20");

    expect(() => processLine(calc, "clear x")).toThrow('unknown token: "x"');
    expectStack(calc, [ZERO, ZERO, ZERO, d(20)]);
  });

  test("invalid operation rolls back the whole input line", () => {
    const calc = new RpnCalculator();
    processLine(calc, "20");

    expect(() => processLine(calc, "1 0 /")).toThrow("invalid operation (divide by zero)");
    expectStack(calc, [ZERO, ZERO, ZERO, d(20)]);
  });

  test("square", () => {
    const calc = new RpnCalculator();
    processLine(calc, "3 sq");
    expect(calc.x.eq(9)).toBe(true);
  });

  test("factorial", () => {
    const calc = new RpnCalculator();
    processLine(calc, "5 !");
    expect(calc.x.eq(120)).toBe(true);
  });

  test("factorial word command", () => {
    const calc = new RpnCalculator();
    processLine(calc, "6 fact");
    expect(calc.x.eq(720)).toBe(true);
  });

  test("modulo", () => {
    const calc = new RpnCalculator();
    processLine(calc, "17 5 mod");
    expect(calc.x.eq(2)).toBe(true);
  });

  test("absolute value", () => {
    const calc = new RpnCalculator();
    processLine(calc, "-5 abs");
    expect(calc.x.eq(5)).toBe(true);
  });

  test("integer and fractional parts", () => {
    const calc = new RpnCalculator();
    processLine(calc, "12.345 int 12.345 frac");
    expectStack(calc, [ZERO, ZERO, d(12), d("0.345")]);
  });

  test("integer and fractional parts preserve sign", () => {
    const calc = new RpnCalculator();
    processLine(calc, "-12.345 int -12.345 frac");
    expectStack(calc, [ZERO, ZERO, d(-12), d("-0.345")]);
  });

  test("floor and ceiling", () => {
    const calc = new RpnCalculator();
    processLine(calc, "12.6 floor 12.1 ceil");
    expectStack(calc, [ZERO, ZERO, d(12), d(13)]);
  });

  test("rnd rounds X internally according to fixed display format", () => {
    const calc = new RpnCalculator();
    processLine(calc, "12.3456 fix 2 rnd");
    expect(calc.x.toString()).toBe("12.35");
  });

  test("rnd rounds X internally according to scientific display format", () => {
    const calc = new RpnCalculator();
    processLine(calc, "12.3456 sci 3 rnd");
    expect(calc.x.toString()).toBe("12.35");
  });

  test("round is an alias for rnd", () => {
    const calc = new RpnCalculator();
    processLine(calc, "12.3456 fix 2 round");
    expect(calc.x.toString()).toBe("12.35");
  });

  test("factorial rejects non-integers", () => {
    const calc = new RpnCalculator();
    processLine(calc, "2.5");
    expect(() => processLine(calc, "!")).toThrow("factorial requires an integer from 0 to 253");
  });

  test("factorial rejects negative integers", () => {
    const calc = new RpnCalculator();
    processLine(calc, "-1");
    expect(() => processLine(calc, "!")).toThrow("factorial requires an integer from 0 to 253");
    expectStack(calc, [ZERO, ZERO, ZERO, d(-1)]);
  });

  test("factorial rejects values above the HP 32SII range", () => {
    const calc = new RpnCalculator();
    processLine(calc, "254");
    expect(() => processLine(calc, "!")).toThrow("factorial requires an integer from 0 to 253");
    expectStack(calc, [ZERO, ZERO, ZERO, d(254)]);
  });

  test("invalid unary operation preserves stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "-1");
    expect(() => processLine(calc, "sqrt")).toThrow(
      "invalid operation (imaginary numbers not supported)",
    );
    expectStack(calc, [ZERO, ZERO, ZERO, d(-1)]);
  });

  test("division by zero preserves stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1 0");
    expect(() => processLine(calc, "/")).toThrow("invalid operation (divide by zero)");
    expectStack(calc, [ZERO, ZERO, d(1), d(0)]);
  });

  test("modulo by zero preserves stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1 0");
    expect(() => processLine(calc, "mod")).toThrow("invalid operation (divide by zero)");
    expectStack(calc, [ZERO, ZERO, d(1), d(0)]);
  });

  test("reciprocal of zero reports divide by zero and preserves stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "0");
    expect(() => processLine(calc, "1/x")).toThrow("invalid operation (divide by zero)");
    expectStack(calc, [ZERO, ZERO, ZERO, ZERO]);
  });

  test("logarithm domain error preserves stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "0");
    expect(() => processLine(calc, "ln")).toThrow("invalid operation (logarithm domain error)");
    expectStack(calc, [ZERO, ZERO, ZERO, ZERO]);
  });

  test("overflow reports overflow and preserves stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1e9000000000000000 10");
    expect(() => processLine(calc, "*")).toThrow("invalid operation (overflow)");
    expectStack(calc, [ZERO, ZERO, d("1e9000000000000000"), d(10)]);
  });

  test("default trig angle mode is degrees", () => {
    const calc = new RpnCalculator();
    expect(calc.angleMode).toBe(AngleMode.Deg);
    processLine(calc, "90 sin");
    expect(calc.x.toNumber()).toBeCloseTo(1, 14);
  });

  test("radian mode uses radians for trig", () => {
    const calc = new RpnCalculator();
    processLine(calc, "rad pi sin");
    expect(calc.angleMode).toBe(AngleMode.Rad);
    expect(calc.x.toNumber()).toBeCloseTo(Math.sin(Math.PI), 14);
  });

  test("gradian mode uses gradians for trig", () => {
    const calc = new RpnCalculator();
    processLine(calc, "grad 100 sin 200 cos 50 tan");
    expect(calc.angleMode).toBe(AngleMode.Grad);
    expect(calc.z.toNumber()).toBeCloseTo(1, 14);
    expect(calc.y.toNumber()).toBeCloseTo(-1, 14);
    expect(calc.x.toNumber()).toBeCloseTo(1, 14);
  });

  test("can switch between angle modes", () => {
    const calc = new RpnCalculator();
    processLine(calc, "rad grad deg 90 sin");
    expect(calc.angleMode).toBe(AngleMode.Deg);
    expect(calc.x.toNumber()).toBeCloseTo(1, 14);
  });

  test("inverse trig results use the current angle mode", () => {
    const deg = new RpnCalculator();
    processLine(deg, "1 asin 0 acos 1 atan");
    expect(deg.z.toNumber()).toBeCloseTo(90, 12);
    expect(deg.y.toNumber()).toBeCloseTo(90, 12);
    expect(deg.x.toNumber()).toBeCloseTo(45, 12);

    const rad = new RpnCalculator();
    processLine(rad, "rad 1 asin");
    expect(rad.x.toNumber()).toBeCloseTo(Math.PI / 2, 14);

    const grad = new RpnCalculator();
    processLine(grad, "grad 1 asin");
    expect(grad.x.toNumber()).toBeCloseTo(100, 12);
  });

  test("inverse trig domain errors preserve stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "2");
    expect(() => processLine(calc, "asin")).toThrow(
      "invalid operation (inverse trigonometry domain error)",
    );
    expectStack(calc, [ZERO, ZERO, ZERO, d(2)]);
  });

  test("hyperbolic trig functions", () => {
    const calc = new RpnCalculator();
    processLine(calc, "0 sinh 0 cosh 0 tanh");
    expect(calc.z.toNumber()).toBeCloseTo(0, 14);
    expect(calc.y.toNumber()).toBeCloseTo(1, 14);
    expect(calc.x.toNumber()).toBeCloseTo(0, 14);
  });

  test("inverse hyperbolic functions", () => {
    const calc = new RpnCalculator();
    processLine(calc, "0 asinh 1 acosh 0 atanh");
    expect(calc.z.toNumber()).toBeCloseTo(0, 14);
    expect(calc.y.toNumber()).toBeCloseTo(0, 14);
    expect(calc.x.toNumber()).toBeCloseTo(0, 14);
  });

  test("inverse hyperbolic domain errors preserve stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "0");
    expect(() => processLine(calc, "acosh")).toThrow("invalid operation (hyperbolic domain error)");
    expectStack(calc, [ZERO, ZERO, ZERO, ZERO]);
  });

  test("trig regression values in degrees", () => {
    const calc = new RpnCalculator();
    processLine(calc, "90 sin 180 cos 45 tan");
    expect(calc.z.toNumber()).toBeCloseTo(1, 14);
    expect(calc.y.toNumber()).toBeCloseTo(-1, 14);
    expect(calc.x.toNumber()).toBeCloseTo(1, 14);
  });

  test("radian trig regression value", () => {
    const calc = new RpnCalculator();
    processLine(calc, "rad pi cos");
    expect(calc.x.toNumber()).toBeCloseTo(-1, 14);
  });

  test("display mode commands do not push the digit argument", () => {
    const calc = new RpnCalculator();
    processLine(calc, "10 3 / fix 2");
    expect(calc.x.toString()).toBe("3.33333333333333");
    expect(calc.display.mode).toBe(DisplayMode.Fix);
    expect(calc.display.digits).toBe(2);
    expect(formatStack(calc.stack, calc.display)).toBe("3.33");
  });

  test("scientific display mode", () => {
    const calc = new RpnCalculator();
    processLine(calc, "12345 sci 4");
    expect(formatStack(calc.stack, calc.display)).toBe("1.2345e+4");
  });

  test("engineering display mode", () => {
    const calc = new RpnCalculator();
    processLine(calc, "12345 eng 3");
    expect(formatStack(calc.stack, calc.display)).toBe("12.345e+3");
  });

  test("all display mode restores compact display", () => {
    const calc = new RpnCalculator();
    processLine(calc, "5 fix 2 all");
    expect(calc.display.mode).toBe(DisplayMode.All);
    expect(formatStack(calc.stack, calc.display)).toBe("5");
  });

  test("fixed display rounds positive and negative values", () => {
    const positive = new RpnCalculator();
    processLine(positive, "2.345 fix 2");
    expect(formatStack(positive.stack, positive.display)).toBe("2.35");

    const negative = new RpnCalculator();
    processLine(negative, "-2.345 fix 2");
    expect(formatStack(negative.stack, negative.display)).toBe("-2.35");
  });

  test("fixed display falls back to scientific notation for very small values", () => {
    const calc = new RpnCalculator();
    processLine(calc, "0.000042 fix 4");
    expect(formatStack(calc.stack, calc.display)).toBe("4.2000e-5");
  });

  test("fixed display falls back to scientific notation for values too wide for fixed", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1234567890123 fix 2");
    expect(formatStack(calc.stack, calc.display)).toBe("1.23e+12");
  });

  test("engineering display handles small numbers", () => {
    const calc = new RpnCalculator();
    processLine(calc, "0.00123 eng 3");
    expect(formatStack(calc.stack, calc.display)).toBe("1.230e-3");
  });

  test("format number trims trailing decimal zeroes", () => {
    expect(formatNumber(d("0.625000000000"))).toBe("0.625");
    expect(formatNumber(d("5.00000000000"))).toBe("5");
  });

  test("format stack compact", () => {
    expect(formatStack([ZERO, ZERO, ZERO, ZERO])).toBe("0");
    expect(formatStack([ZERO, ZERO, d(3), d(2)])).toBe("2");
    expect(formatStack([d(1), ZERO, ZERO, d(2)])).toBe("2");
  });

  test("format stack full", () => {
    expect(formatStack([ZERO, ZERO, ZERO, d(7)], undefined, { full: true })).toBe(
      "T: 0  Z: 0  Y: 0  X: 7",
    );
  });
});
