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

  test("decimal arithmetic avoids binary floating point surprises", () => {
    const calc = new RpnCalculator();
    processLine(calc, "0.1 0.2 +");
    expect(calc.x.toString()).toBe("0.3");
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

  test("floor ceiling and round", () => {
    const calc = new RpnCalculator();
    processLine(calc, "12.6 floor 12.1 ceil 12.5 round");
    expectStack(calc, [ZERO, d(12), d(13), d(13)]);
  });

  test("factorial rejects non-integers", () => {
    const calc = new RpnCalculator();
    processLine(calc, "2.5");
    expect(() => processLine(calc, "!")).toThrow("factorial requires a non-negative integer");
  });

  test("factorial rejects negative integers", () => {
    const calc = new RpnCalculator();
    processLine(calc, "-1");
    expect(() => processLine(calc, "!")).toThrow("factorial requires a non-negative integer");
    expectStack(calc, [ZERO, ZERO, ZERO, d(-1)]);
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

  test("can switch from radians back to degrees", () => {
    const calc = new RpnCalculator();
    processLine(calc, "rad deg 90 sin");
    expect(calc.angleMode).toBe(AngleMode.Deg);
    expect(calc.x.toNumber()).toBeCloseTo(1, 14);
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
