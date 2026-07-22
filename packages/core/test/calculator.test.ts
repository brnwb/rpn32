import { Decimal } from "../src/vendor/decimal.js/decimal.mjs";
import { describe, expect, test } from "vitest";

import {
  AngleMode,
  BaseMode,
  DisplayMode,
  RpnCalculator as PublicRpnCalculator,
  RpnError,
  formatNumber,
  formatStack,
  type NumberValue,
  type OutputEvent,
} from "../src/index.js";

const d = (value: string | number): Decimal => new Decimal(value);
const ZERO = d(0);

class RpnCalculator extends PublicRpnCalculator {
  outputs: readonly OutputEvent[] = [];
  get stack() {
    return this.state.stack;
  }
  get x() {
    return this.state.stack[3];
  }
  get y() {
    return this.state.stack[2];
  }
  get z() {
    return this.state.stack[1];
  }
  get t() {
    return this.state.stack[0];
  }
  get lastX() {
    return this.state.lastX;
  }
  get display() {
    return this.state.display;
  }
  get angleMode() {
    return this.state.angleMode;
  }
  get baseMode() {
    return this.state.baseMode;
  }
  get variables() {
    return this.state.variables;
  }
  get messages(): string[] {
    return this.outputs.map((output) =>
      output.type === "empty-variables"
        ? "no variables"
        : output.type === "show"
          ? formatNumber(output.value, undefined, output.baseMode)
          : `${output.name === "i" ? output.name : output.name.toUpperCase()}: ${output.value.toString()}`,
    );
  }
  takeMessages(): string[] {
    const messages = this.messages;
    this.outputs = [];
    return messages;
  }
}

const processLine = (calc: RpnCalculator, expression: string): void => {
  calc.outputs = calc.execute(expression).outputs;
};

const expectStack = (calc: RpnCalculator, expected: Decimal[]): void => {
  expect(calc.stack.map((value) => value.toString())).toEqual(
    expected.map((value) => value.toString()),
  );
};

const expectRelativeErrorAtMost = (
  actual: Decimal,
  expected: string,
  tolerance = "5e-13",
): void => {
  const reference = d(expected);
  const relativeError = actual.minus(reference).abs().div(reference.abs());
  expect(relativeError.toNumber()).toBeLessThanOrEqual(Number(tolerance));
};

describe("RpnCalculator", () => {
  test("initial stack is four zero registers", () => {
    const calc = new RpnCalculator();
    expectStack(calc, [ZERO, ZERO, ZERO, ZERO]);
    expect(calc.x.eq(ZERO)).toBe(true);
  });

  test("failed expressions atomically restore all public state", () => {
    const calc = new RpnCalculator();
    calc.execute("8 2 / 42 sto A fix 2 frac 7 rad hex dec");
    const before = calc.state;
    expect(() => calc.execute("1 sto B grad bin view B nope")).toThrow("unknown token");
    expect(calc.state).toEqual(before);
    expect(calc.execute("vars").outputs.map((output) => output.type)).toEqual(["variable"]);
  });

  test("state snapshots deeply detach mutable containers and settings", () => {
    const calc = new PublicRpnCalculator();
    calc.execute("1 2 fix 3 frac 7 42 sto A");
    const snapshot = calc.state;

    (snapshot.stack as NumberValue[])[3] = d(99);
    (snapshot.display as { digits: number }).digits = 9;
    (snapshot.display.fraction as { maxDenominator: number }).maxDenominator = 2;
    (snapshot.variables as Map<string, Decimal>).set("b", d(88));
    snapshot.stack[2].d[0] = 99;
    snapshot.lastX.d[0] = 99;
    snapshot.variables.get("a")!.d[0] = 99;

    const fresh = calc.state;
    expect(fresh.stack[3].toString()).toBe("42");
    expect(fresh.stack[2].toString()).toBe("2");
    expect(fresh.lastX.toString()).toBe("0");
    expect(fresh.display.digits).toBe(3);
    expect(fresh.display.fraction.maxDenominator).toBe(7);
    expect(fresh.variables.get("a")?.toString()).toBe("42");
    expect(fresh.variables.has("b")).toBe(false);
    expect(fresh.stack).not.toBe(snapshot.stack);
    expect(fresh.display).not.toBe(snapshot.display);
    expect(fresh.display.fraction).not.toBe(snapshot.display.fraction);
    expect(fresh.variables).not.toBe(snapshot.variables);
  });

  test("execute returns structured, execution-scoped variable output", () => {
    const calc = new PublicRpnCalculator();
    const viewed = calc.execute("42 sto A view A");
    expect(viewed.outputs).toHaveLength(1);
    expect(viewed.outputs[0]?.type).toBe("variable");
    expect(viewed.outputs[0]).toMatchObject({ type: "variable", name: "a" });
    if (viewed.outputs[0]?.type === "variable") viewed.outputs[0].value.d[0] = 99;
    expect(calc.state.variables.get("a")?.toString()).toBe("42");
    expect(calc.execute("1").outputs).toEqual([]);

    const empty = new PublicRpnCalculator().execute("vars");
    expect(empty.outputs).toEqual([{ type: "empty-variables" }]);
  });

  test("show emits a detached full-precision value without changing the display mode", () => {
    const calc = new PublicRpnCalculator();
    const result = calc.execute("10 3 / fix 2 show");

    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]).toMatchObject({ type: "show", baseMode: BaseMode.Dec });
    expect(result.state.display.mode).toBe(DisplayMode.Fix);
    expect(formatStack(result.state.stack, result.state.display)).toBe("3.33");
    if (result.outputs[0]?.type === "show") {
      expect(formatNumber(result.outputs[0].value)).toBe("3.33333333333");
      result.outputs[0].value.d[0] = 99;
    }
    expect(calc.state.stack[3].toString()).toBe("3.33333333333333");
  });

  test("show captures the active base and preserves disabled stack lift", () => {
    const calc = new PublicRpnCalculator();
    const result = calc.execute("255 enter hex show 1");

    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]).toMatchObject({ type: "show", baseMode: BaseMode.Hex });
    if (result.outputs[0]?.type === "show") {
      expect(formatNumber(result.outputs[0].value, undefined, result.outputs[0].baseMode)).toBe(
        "FF",
      );
    }
    expect(result.state.stack.map((value) => value.toString())).toEqual(["0", "0", "255", "1"]);
  });

  test("execution results remain detached from later executions", () => {
    const calc = new PublicRpnCalculator();
    const first = calc.execute("1");

    calc.execute("2");

    expect(first.state.stack[3].toString()).toBe("1");
    expect(calc.state.stack[3].toString()).toBe("2");
  });

  test("failed expressions do not leak partial output into later executions", () => {
    const calc = new PublicRpnCalculator();
    calc.execute("42 sto A");

    expect(() => calc.execute("view A nope")).toThrow('unknown token: "nope"');
    expect(calc.execute("1").outputs).toEqual([]);
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

  test("roll down and roll up rotate all four stack registers", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1 2 3 4 rdown");
    expectStack(calc, [d(4), d(1), d(2), d(3)]);

    processLine(calc, "rup");
    expectStack(calc, [d(1), d(2), d(3), d(4)]);

    processLine(calc, "rdn");
    expectStack(calc, [d(4), d(1), d(2), d(3)]);
  });

  test("roll down and roll up enable stack lift", () => {
    const down = new RpnCalculator();
    processLine(down, "1 2 3 4 enter rdown 5");
    expectStack(down, [d(2), d(3), d(4), d(5)]);

    const up = new RpnCalculator();
    processLine(up, "1 2 3 4 enter rup 5");
    expectStack(up, [d(4), d(4), d(2), d(5)]);
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

  test("store enables stack lift", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1 enter sto A 2");
    expectStack(calc, [ZERO, d(1), d(1), d(2)]);
  });

  test("recall lifts the stack and uninitialized variables recall zero", () => {
    const calc = new RpnCalculator();
    processLine(calc, "7 rcl C");
    expectStack(calc, [ZERO, ZERO, d(7), ZERO]);
  });

  test("storage arithmetic updates a variable without changing the stack or lastx", () => {
    const calc = new RpnCalculator();
    processLine(calc, "8 2 / 20 sto A 3 sto + A sto * A sto - A sto / A");

    expect(calc.variables.get("a")?.toString()).toBe("22");
    expectStack(calc, [ZERO, d(4), d(20), d(3)]);
    expect(calc.lastX.toString()).toBe("2");
  });

  test.each([
    ["+", "14"],
    ["-", "6"],
    ["*", "40"],
    ["/", "2.5"],
  ])("recall arithmetic %s changes only X and saves the previous X", (operator, expected) => {
    const calc = new RpnCalculator();
    processLine(calc, `4 sto A 1 2 10 rcl ${operator} A`);

    expectStack(calc, [d(4), d(1), d(2), d(expected)]);
    expect(calc.lastX.toString()).toBe("10");
    expect(calc.variables.get("a")?.toString()).toBe("4");
  });

  test("X-variable exchange leaves Y, Z, and T unchanged", () => {
    const calc = new RpnCalculator();
    processLine(calc, "12 sto A 1 2 3 x<> A");

    expectStack(calc, [d(12), d(1), d(2), d(12)]);
    expect(calc.variables.get("a")?.toString()).toBe("3");
  });

  test("X-variable exchange enables stack lift", () => {
    const calc = new RpnCalculator();
    processLine(calc, "9 sto A 1 2 3 4 enter x<> A 5");

    expectStack(calc, [d(3), d(4), d(9), d(5)]);
    expect(calc.variables.get("a")?.toString()).toBe("4");
  });

  test("invalid variable arithmetic rolls back the whole expression", () => {
    const calc = new RpnCalculator();
    processLine(calc, "10 sto A 7");
    const before = calc.state;

    expect(() => processLine(calc, "0 sto / A")).toThrow("divide by zero");
    expect(calc.state).toEqual(before);
    expect(() => processLine(calc, "sto +")).toThrow("sto + requires a variable name");
    expect(calc.state).toEqual(before);
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

  test("numeric input accepts decimal and scientific notation", () => {
    const calc = new RpnCalculator();
    processLine(calc, "+1 -2 .5 5. 1e3 1e-3");
    expectStack(calc, [d("0.5"), d(5), d(1000), d("0.001")]);
  });

  test("numeric input rejects non-decimal literal forms and rolls back the line", () => {
    const calc = new RpnCalculator();
    processLine(calc, "20");

    expect(() => processLine(calc, "30 0x10 +")).toThrow('unknown token: "0x10"');
    expect(() => processLine(calc, "30 0b10 +")).toThrow('unknown token: "0b10"');
    expect(() => processLine(calc, "30 1_000 +")).toThrow('unknown token: "1_000"');
    expectStack(calc, [ZERO, ZERO, ZERO, d(20)]);
  });

  test("fraction input parses proper and mixed fractions", () => {
    const calc = new RpnCalculator();

    processLine(calc, "1..2 1.1.2 -1.1.2");
    expectStack(calc, [ZERO, d("0.5"), d("1.5"), d("-1.5")]);
    expect(calc.display.fraction.enabled).toBe(false);
    expect(formatStack(calc.stack, calc.display)).toBe("-1.5");
  });

  test("fraction input enforces HP entry digit limits", () => {
    const calc = new RpnCalculator();
    processLine(calc, "20");

    expect(() => processLine(calc, "12345678.12345.2")).toThrow(
      "fraction integer and numerator must not exceed 12 digits total",
    );
    expect(() => processLine(calc, "1.2.10000")).toThrow(
      "fraction denominator must not exceed 4 digits",
    );
    expect(() => processLine(calc, "000000000001.1.2")).toThrow(
      "fraction integer and numerator must not exceed 12 digits total",
    );
    expectStack(calc, [ZERO, ZERO, ZERO, d(20)]);
  });

  test("fraction input accepts the HP digit-limit boundaries", () => {
    const calc = new RpnCalculator();

    processLine(calc, "12345678.1234.9999 15..8192");

    expect(calc.y.eq(d("12345678").plus(d("1234").div(9999)))).toBe(true);
    expect(calc.x.eq(d(15).div(8192))).toBe(true);
  });

  test("fraction input uses the current display mode and denominator", () => {
    const calc = new RpnCalculator();

    processLine(calc, "frac 8 frac 1..2");
    expect(calc.display.fraction.enabled).toBe(false);
    expect(calc.display.fraction.maxDenominator).toBe(8);
    expect(formatStack(calc.stack, calc.display)).toBe("0.5");

    processLine(calc, "frac 1.1.2 3..4 +");
    expect(calc.x.toString()).toBe("2.25");
    expect(calc.display.fraction.maxDenominator).toBe(8);
    expect(formatStack(calc.stack, calc.display)).toBe("2 1/4");
  });

  test("invalid fraction input rolls back the whole line", () => {
    const calc = new RpnCalculator();
    processLine(calc, "20");

    expect(() => processLine(calc, "1..0")).toThrow("fraction denominator must not be zero");
    expect(calc.display.fraction.enabled).toBe(false);
    expectStack(calc, [ZERO, ZERO, ZERO, d(20)]);
  });

  test("base modes do not parse fraction input", () => {
    const calc = new RpnCalculator();
    processLine(calc, "hex a");

    expect(() => processLine(calc, "1..2")).toThrow('unknown token: "1..2"');
    expect(calc.display.fraction.enabled).toBe(false);
    expectStack(calc, [ZERO, ZERO, ZERO, d(10)]);
  });

  test("base mode commands parse and display integer values", () => {
    const calc = new RpnCalculator();

    processLine(calc, "hex ff a +");
    expect(calc.baseMode).toBe(BaseMode.Hex);
    expect(calc.x.toString()).toBe("265");
    expect(formatStack(calc.stack, calc.display, { baseMode: calc.baseMode })).toBe("109");

    processLine(calc, "bin 1010");
    expect(calc.x.toString()).toBe("10");
    expect(formatStack(calc.stack, calc.display, { baseMode: calc.baseMode })).toBe("1010");

    processLine(calc, "oct 17 dec");
    expect(calc.x.toString()).toBe("15");
    expect(formatStack(calc.stack, calc.display, { baseMode: calc.baseMode })).toBe("15");
  });

  test("base display uses the integer part and preserves decimal values across mode changes", () => {
    const calc = new RpnCalculator();

    processLine(calc, "125.99 hex");
    expect(calc.x.toString()).toBe("125.99");
    expect(formatStack(calc.stack, calc.display, { baseMode: calc.baseMode })).toBe("7D");

    processLine(calc, "oct");
    expect(formatStack(calc.stack, calc.display, { baseMode: calc.baseMode })).toBe("175");

    processLine(calc, "bin");
    expect(formatStack(calc.stack, calc.display, { baseMode: calc.baseMode })).toBe("1111101");

    processLine(calc, "dec");
    expect(calc.x.toString()).toBe("125.99");
    expect(formatStack(calc.stack, calc.display, { baseMode: calc.baseMode })).toBe("125.99");
  });

  test("base modes use 36-bit twos-complement representation", () => {
    const calc = new RpnCalculator();

    processLine(calc, "hex fffffffff");
    expect(calc.x.toString()).toBe("-1");
    expect(formatStack(calc.stack, calc.display, { baseMode: calc.baseMode })).toBe("FFFFFFFFF");

    processLine(calc, "hex 800000000 dec");
    expect(calc.x.toString()).toBe("-34359738368");

    processLine(calc, "hex 7ffffffff");
    expect(calc.x.toString()).toBe("34359738367");
  });

  test("base mode arithmetic truncates operands and results to integers", () => {
    const calc = new RpnCalculator();

    processLine(calc, "dec 100 5 / oct");
    expect(formatStack(calc.stack, calc.display, { baseMode: calc.baseMode })).toBe("24");

    processLine(calc, "100 5 /");
    expect(calc.x.toString()).toBe("12");
    expect(formatStack(calc.stack, calc.display, { baseMode: calc.baseMode })).toBe("14");
  });

  test("HP-disabled operations are unavailable outside decimal mode", () => {
    const calc = new RpnCalculator();
    processLine(calc, "9 hex");
    const stack = [...calc.stack];

    for (const operation of ["sqrt", "exp", "10^x", "alog", "ln", "^", "pow", "xroot", "1/x"]) {
      expect(() => processLine(calc, operation)).toThrow(`${operation} is unavailable in hex mode`);
      expectStack(calc, stack);
      expect(calc.baseMode).toBe(BaseMode.Hex);
    }
  });

  test("probability functions truncate operands in non-decimal modes", () => {
    const calc = new RpnCalculator();
    processLine(calc, "5.9 2.9 hex ncr");
    expect(calc.x.toString()).toBe("10");
    expect(formatStack(calc.stack, calc.display, { baseMode: calc.baseMode })).toBe("A");

    processLine(calc, "dec 5.9 2.9 oct npr");
    expect(calc.x.toString()).toBe("20");
    expect(formatStack(calc.stack, calc.display, { baseMode: calc.baseMode })).toBe("24");
  });

  test("probability functions validate truncated base-mode operands", () => {
    const negative = new RpnCalculator();
    processLine(negative, "-5.9 2 hex");
    const negativeState = negative.state;
    expect(() => processLine(negative, "ncr")).toThrow("probability operands require");
    expect(negative.state).toEqual(negativeState);

    const reversed = new RpnCalculator();
    processLine(reversed, "3.9 4.1 bin");
    const reversedState = reversed.state;
    expect(() => processLine(reversed, "ncr")).toThrow("probability operands require");
    expect(reversed.state).toEqual(reversedState);
  });

  test("base-mode probability results remain decimal values instead of clamping to 36 bits", () => {
    const tooBig = new RpnCalculator();
    processLine(tooBig, "40 20 hex ncr");
    expect(tooBig.x.toString()).toBe("137846528820");
    expect(formatStack(tooBig.stack, tooBig.display, { baseMode: tooBig.baseMode })).toBe(
      "Too Big",
    );
    processLine(tooBig, "dec");
    expect(formatStack(tooBig.stack, tooBig.display, { baseMode: tooBig.baseMode })).toBe(
      "137846528820",
    );

    const representable = new RpnCalculator();
    processLine(representable, "36 18 hex ncr");
    expect(representable.x.toString()).toBe("9075135300");
    expect(
      formatStack(representable.stack, representable.display, { baseMode: representable.baseMode }),
    ).toBe("21CEB9344");
  });

  test("base mode arithmetic clamps 36-bit overflow", () => {
    const positive = new RpnCalculator();
    processLine(positive, "hex 7ffffffff 1 +");
    expect(positive.x.toString()).toBe("34359738367");
    expect(formatStack(positive.stack, positive.display, { baseMode: positive.baseMode })).toBe(
      "7FFFFFFFF",
    );

    const negative = new RpnCalculator();
    processLine(negative, "hex 800000000 1 -");
    expect(negative.x.toString()).toBe("-34359738368");
    expect(formatStack(negative.stack, negative.display, { baseMode: negative.baseMode })).toBe(
      "800000000",
    );
  });

  test("base mode commands take precedence over hexadecimal digits", () => {
    const calc = new RpnCalculator();

    processLine(calc, "hex dec 10");
    expect(calc.baseMode).toBe(BaseMode.Dec);
    expect(calc.x.toString()).toBe("10");
  });

  test("object prototype names are not treated as base mode commands", () => {
    const calc = new RpnCalculator();
    processLine(calc, "20");

    expect(() => processLine(calc, "30 constructor")).toThrow('unknown token: "constructor"');
    expect(() => processLine(calc, "30 __proto__")).toThrow('unknown token: "__proto__"');
    expect(calc.baseMode).toBe(BaseMode.Dec);
    expectStack(calc, [ZERO, ZERO, ZERO, d(20)]);
  });

  test("base modes reject invalid digits and roll back the whole line", () => {
    const calc = new RpnCalculator();
    processLine(calc, "hex a");

    expect(() => processLine(calc, "bin 102")).toThrow('unknown token: "102"');
    expect(calc.baseMode).toBe(BaseMode.Hex);
    expectStack(calc, [ZERO, ZERO, ZERO, d(10)]);
  });

  test("base modes reject values outside 36-bit word size", () => {
    const calc = new RpnCalculator();

    expect(() => processLine(calc, "hex 20000000000000")).toThrow(
      "base input exceeds 36-bit word size",
    );
    expect(() => processLine(calc, "bin 1000000000000000000000000000000000000")).toThrow(
      "base input exceeds 36-bit word size",
    );

    processLine(calc, "dec 1e12 hex");
    expect(formatStack(calc.stack, calc.display, { baseMode: calc.baseMode })).toBe("Too Big");
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

  test("unsafe integer powers are rejected and preserve stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "2 9007199254740993");
    expect(() => processLine(calc, "^")).toThrow("invalid operation (exponent out of range)");
    expectStack(calc, [ZERO, ZERO, d(2), d("9007199254740993")]);
  });

  test("negative base fractional power is rejected and preserves stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "-8 0.333333333333333");
    expect(() => processLine(calc, "^")).toThrow("invalid operation");
    expectStack(calc, [ZERO, ZERO, d(-8), d("0.333333333333333")]);
  });

  test("zero cannot be raised to zero or a negative power", () => {
    const calc = new RpnCalculator();

    processLine(calc, "0 0");
    expect(() => processLine(calc, "^")).toThrow(
      "invalid operation (zero base requires a positive exponent)",
    );
    expectStack(calc, [ZERO, ZERO, ZERO, ZERO]);

    processLine(calc, "clx -1");
    expect(() => processLine(calc, "pow")).toThrow(
      "invalid operation (zero base requires a positive exponent)",
    );
    expectStack(calc, [ZERO, ZERO, ZERO, d(-1)]);
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

  test("factorial evaluates non-integers as gamma of X plus one", () => {
    const calc = new RpnCalculator();
    processLine(calc, "2.5 !");
    expect(calc.x.toNumber()).toBeCloseTo(3.32335097044784, 12);

    processLine(calc, "-0.5 !");
    expect(calc.x.toNumber()).toBeCloseTo(Math.sqrt(Math.PI), 12);
  });

  test("gamma-backed factorial agrees with independent high-precision reference values", () => {
    // References were generated independently with mpmath 1.3.0 at 80 decimal digits.
    // The tolerance is tighter than half a unit in the calculator's 12th significant digit.
    const references = [
      ["-9.75", "-0.000021426084765762825406719919612220105369532114469554"],
      ["-9.9999999999999", "-27557319.223992095879048355196930730476717364113978886"],
      ["-10.0000000000001", "27557319.223979685426066285525922973332654577464310191"],
      ["-5.5", "-0.06001960130050424642702789361578481042277416147716"],
      ["-3.75", "-1.0044979832303122595825274890715628060246352021832"],
      ["-1.99999999999999", "-100000000000000.42278433509848125779679217436498158323"],
      ["-2.00000000000001", "99999999999999.577215664901546979009816354428914194443"],
      ["-2.5", "2.3632718012073547030642233111215269103967326081632"],
      ["-1.5", "-3.5449077018110320545963349666822903655950989122448"],
      ["-1.1", "-10.68628702119319354897305335694480778169838785061"],
      ["-1.000001", "-1000000.57721665395843566863687744059753273243643"],
      ["-0.999999", "999999.42278532415355498927168952386455694173499103"],
      ["-0.75", "3.6256099082219083119306851558676720029951676828801"],
      ["-0.5", "1.7724538509055160272981674833411451827975494561224"],
      ["-0.25", "1.2254167024651776451290983033628905268512392481081"],
      ["0.1", "0.95135076986687318362924871772654021925505786260884"],
      ["0.5", "0.88622692545275801364908374167057259139877472806119"],
      ["1.5", "1.3293403881791370204736256125058588870981620920918"],
      ["10.25", "6552134.1374906621414085236192298709133226091712174"],
      ["50.5", "2.1666837707377397045124563740097635252812665640414e+65"],
      ["100.25", "2.9558374475433668949348698240972757583387658816627e+158"],
      ["252.5", "3.2509204772173278009283519744234321525815045241502e+498"],
      ["252.999999999999", "5.1734609926114419296315026172191705486013277974154e+499"],
    ] as const;

    for (const [input, expected] of references) {
      const calc = new RpnCalculator();
      processLine(calc, `${input} !`);
      expectRelativeErrorAtMost(calc.x, expected);
    }
  });

  test("gamma-backed factorial satisfies the gamma recurrence across both calculation paths", () => {
    for (const input of ["-8.75", "-3.5", "-1.25", "-0.75", "0.25", "4.5", "40.25"]) {
      const x = d(input);
      const factorial = new RpnCalculator();
      const successorFactorial = new RpnCalculator();
      processLine(factorial, `${input} !`);
      processLine(successorFactorial, `${x.plus(1).toString()} !`);

      const expected = factorial.x.times(x.plus(1));
      expectRelativeErrorAtMost(successorFactorial.x, expected.toString(), "1e-12");
    }
  });

  test("factorial handles exact integer boundaries", () => {
    for (const [input, expected] of [
      ["0", "1"],
      ["1", "1"],
      ["253", "5.1734609926400789218043308997295274695423561272066e+499"],
    ] as const) {
      const calc = new RpnCalculator();
      processLine(calc, `${input} !`);
      expectRelativeErrorAtMost(calc.x, expected);
    }
  });

  test("gamma-backed factorial follows HP underflow and overflow limits", () => {
    const smallest = new RpnCalculator();
    processLine(smallest, "-254.1 !");
    expectRelativeErrorAtMost(
      smallest.x,
      "1.1297437316854821716772633191356365954071853171768e-499",
    );

    const underflow = new RpnCalculator();
    processLine(underflow, "-254.2 !");
    expect(underflow.x.isZero()).toBe(true);

    const hugeUnderflow = new RpnCalculator();
    processLine(hugeUnderflow, "-30000000000000000.5 !");
    expect(hugeUnderflow.x.isZero()).toBe(true);

    const largest = new RpnCalculator();
    processLine(largest, `-0.${"9".repeat(499)} !`);
    expectRelativeErrorAtMost(largest.x, "1e499");

    const nearMaximum = new RpnCalculator();
    processLine(nearMaximum, `-0.${"9".repeat(499)}8999999999998 !`);
    expectRelativeErrorAtMost(nearMaximum.x, "9.99999999998e499");

    const nearPole = `-0.${"9".repeat(500)}`;
    const overflow = new RpnCalculator();
    processLine(overflow, nearPole);
    expect(() => processLine(overflow, "!")).toThrow("invalid operation (overflow)");
    expectStack(overflow, [ZERO, ZERO, ZERO, d(nearPole)]);
  });

  test("common exponential and X root", () => {
    const calc = new RpnCalculator();
    processLine(calc, "3 10^x 27 3 xroot -27 3 xroot");
    expectStack(calc, [d(1000), d(1000), d(3), d(-3)]);
  });

  test("X root rejects invalid real roots without changing the stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "-16 2");
    const before = calc.state;
    expect(() => processLine(calc, "xroot")).toThrow(
      "negative radicand requires an odd integer root",
    );
    expect(calc.state).toEqual(before);
  });

  test("percentage functions preserve Y and save X in lastx", () => {
    const percent = new RpnCalculator();
    processLine(percent, "1 2 15.76 6 %");
    expectStack(percent, [d(1), d(2), d("15.76"), d("0.9456")]);
    expect(percent.lastX.toString()).toBe("6");
    processLine(percent, "+");
    expect(percent.x.toString()).toBe("16.7056");

    const change = new RpnCalculator();
    processLine(change, "16.12 15.76 %chg");
    expect(change.y.toString()).toBe("16.12");
    expect(change.x.toNumber()).toBeCloseTo(-2.23325062035, 11);
    expect(change.lastX.toString()).toBe("15.76");
  });

  test("percentage change rejects a zero base without changing the stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "0 5");
    const before = calc.state;
    expect(() => processLine(calc, "%chg")).toThrow("percent change requires a nonzero base");
    expect(calc.state).toEqual(before);
  });

  test("combinations and permutations use n in Y and r in X", () => {
    const calc = new RpnCalculator();
    processLine(calc, "28 4 ncr 28 4 npr");
    expectStack(calc, [ZERO, ZERO, d(20475), d(491400)]);
    expect(calc.lastX.toString()).toBe("4");
  });

  test("probability functions stop when results exceed the HP numeric range", () => {
    const combinations = new RpnCalculator();
    processLine(combinations, "999999999999 499999999999");
    expect(() => processLine(combinations, "ncr")).toThrow("invalid operation (overflow)");

    const permutations = new RpnCalculator();
    processLine(permutations, "999999999999 499999999999");
    expect(() => processLine(permutations, "npr")).toThrow("invalid operation (overflow)");
  });

  test("probability functions reject n at the HP domain limit", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1000000000000 0");
    const before = calc.state;
    expect(() => processLine(calc, "ncr")).toThrow("probability operands are out of range");
    expect(calc.state).toEqual(before);
  });

  test("coordinate conversions replace the Y-X pair and honor angle mode", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1 2 3 4 r>p");
    expect(calc.t.toString()).toBe("1");
    expect(calc.z.toString()).toBe("2");
    expect(calc.y.toNumber()).toBeCloseTo(36.869897645844, 11);
    expect(calc.x.toString()).toBe("5");
    expect(calc.lastX.toString()).toBe("4");

    processLine(calc, "p>r");
    expect(calc.y.toNumber()).toBeCloseTo(3, 12);
    expect(calc.x.toNumber()).toBeCloseTo(4, 12);
  });

  test("coordinate conversions honor radians and gradians", () => {
    const radians = new RpnCalculator();
    processLine(radians, "rad 4 3 r>p");
    expect(radians.y.toNumber()).toBeCloseTo(0.927295218001612, 12);
    expect(radians.x.toString()).toBe("5");

    const gradians = new RpnCalculator();
    processLine(gradians, "grad 4 3 r>p");
    expect(gradians.y.toNumber()).toBeCloseTo(59.033447060173, 11);
    expect(gradians.x.toString()).toBe("5");

    const polarRadians = new RpnCalculator();
    processLine(polarRadians, "rad pi 6 / 10 p>r");
    expect(polarRadians.y.toNumber()).toBeCloseTo(5, 12);
    expect(polarRadians.x.toNumber()).toBeCloseTo(8.66025403784439, 12);

    const polarGradians = new RpnCalculator();
    processLine(polarGradians, "grad 33.3333333333333 10 p>r");
    expect(polarGradians.y.toNumber()).toBeCloseTo(5, 12);
    expect(polarGradians.x.toNumber()).toBeCloseTo(8.66025403784439, 12);
  });

  test("polar conversion returns exact degree and gradian quadrant results", () => {
    const degrees = new RpnCalculator();
    processLine(degrees, "90 1 p>r");
    expect(degrees.y.toString()).toBe("1");
    expect(degrees.x.toString()).toBe("0");

    const gradians = new RpnCalculator();
    processLine(gradians, "grad 100 1 p>r");
    expect(gradians.y.toString()).toBe("1");
    expect(gradians.x.toString()).toBe("0");
  });

  test("time, angle, and unit conversions follow HP command direction", () => {
    const time = new RpnCalculator();
    processLine(time, "1 7 / >hms >hr");
    expect(time.x.toNumber()).toBeCloseTo(1 / 7, 12);

    const angle = new RpnCalculator();
    processLine(angle, "180 >rad >deg");
    expect(angle.x.toNumber()).toBeCloseTo(180, 12);

    const conversions: [string, number, number][] = [
      ["1 >kg", 0.45359237, 12],
      ["1 >lb", 2.20462262184878, 12],
      ["32 >c", 0, 12],
      ["100 >f", 212, 12],
      ["1 >cm", 2.54, 12],
      ["2.54 >in", 1, 12],
      ["1 >l", 3.785411784, 12],
      ["3.785411784 >gal", 1, 12],
    ];
    for (const [expression, expected, precision] of conversions) {
      const calc = new RpnCalculator();
      processLine(calc, expression);
      expect(calc.x.toNumber()).toBeCloseTo(expected, precision);
    }
  });

  test("HMS conversion normalizes values at internal calculator precision", () => {
    const calc = new RpnCalculator();
    processLine(calc, "0.9999999999999999 >hms");
    expect(calc.x.toString()).toBe("1");
  });

  test("hours conversion decodes and carries packed minute and second fields", () => {
    const conversions: [string, number][] = [
      ["1.3045 >hr", 1.5125],
      ["1.59 >hr", 1.98333333333333],
      ["1.6 >hr", 2],
      ["1.006 >hr", 1.01666666666667],
      ["1.99 >hr", 2.65],
      ["-1.99 >hr", -2.65],
      ["0.9999 >hr", 1.6775],
    ];
    for (const [expression, expected] of conversions) {
      const calc = new RpnCalculator();
      processLine(calc, expression);
      expect(calc.x.toNumber()).toBeCloseTo(expected, 12);
    }
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
    processLine(calc, "12.345 int 12.345 fpart");
    expectStack(calc, [ZERO, ZERO, d(12), d("0.345")]);
  });

  test("integer and fractional parts preserve sign", () => {
    const calc = new RpnCalculator();
    processLine(calc, "-12.345 int -12.345 fpart");
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

  test("rnd uses fixed decimal places when display falls back to scientific notation", () => {
    const calc = new RpnCalculator();
    processLine(calc, "123456789.012 fix 4 rnd");
    expect(calc.x.toString()).toBe("123456789.012");
    expect(formatStack(calc.stack, calc.display)).toBe("1.2346e+8");
  });

  test("rnd avoids materializing huge fixed-point strings", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1.2345e9000000000000000 fix 2 rnd");
    expect(calc.x.toString()).toBe("1.2345e+9000000000000000");
  });

  test("rnd rounds X internally according to scientific display format", () => {
    const calc = new RpnCalculator();
    processLine(calc, "12.3456 sci 3 rnd");
    expect(calc.x.toString()).toBe("12.35");
  });

  test("rnd rounds X internally according to fraction display format", () => {
    const calc = new RpnCalculator();

    processLine(calc, "1.2 frac 4 rnd");
    expect(calc.x.toString()).toBe("1.25");
    expect(formatStack(calc.stack, calc.display)).toBe("1 1/4");

    processLine(calc, "1.234 frac 100 rnd");
    expect(calc.x.toString()).toBe("1.23404255319149");
    expect(formatStack(calc.stack, calc.display)).toBe("↑ 1 11/47");
  });

  test("rnd saves its input in lastx", () => {
    const calc = new RpnCalculator();

    processLine(calc, "8 2 /");
    expect(calc.lastX.toString()).toBe("2");

    processLine(calc, "1.2 frac 4 rnd");
    expect(calc.x.toString()).toBe("1.25");
    expect(calc.lastX.toString()).toBe("1.2");

    processLine(calc, "1.234 fix 1 round");
    expect(calc.x.toString()).toBe("1.2");
    expect(calc.lastX.toString()).toBe("1.234");
  });

  test("change sign does not update lastx", () => {
    const calc = new RpnCalculator();
    processLine(calc, "8 2 /");

    processLine(calc, "9 chs");
    expect(calc.x.toString()).toBe("-9");
    expect(calc.lastX.toString()).toBe("2");

    processLine(calc, "3 neg");
    expect(calc.x.toString()).toBe("-3");
    expect(calc.lastX.toString()).toBe("2");
  });

  test("round is an alias for rnd", () => {
    const calc = new RpnCalculator();
    processLine(calc, "12.3456 fix 2 round");
    expect(calc.x.toString()).toBe("12.35");
  });

  test("factorial rejects negative-integer gamma poles", () => {
    for (const input of ["-1", "-10"]) {
      const calc = new RpnCalculator();
      processLine(calc, input);
      expect(() => processLine(calc, "!")).toThrow(
        "factorial or gamma is undefined for negative integers",
      );
      expectStack(calc, [ZERO, ZERO, ZERO, d(input)]);
    }
  });

  test("factorial rejects values above the HP 32SII range", () => {
    for (const input of ["253.000000000001", "254"]) {
      const calc = new RpnCalculator();
      processLine(calc, input);
      expect(() => processLine(calc, "!")).toThrow("factorial or gamma input is out of range");
      expectStack(calc, [ZERO, ZERO, ZERO, d(input)]);
    }
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

  test("public math errors preserve calculator state", () => {
    const calc = new RpnCalculator();
    calc.execute("7 8 9 fix 2 rad 42 sto A -1");
    const before = calc.state;
    expect(() => calc.execute("sqrt")).toThrow(RpnError);
    expect(calc.state).toEqual(before);
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

  test("degree quadrant trig values are exact", () => {
    const calc = new RpnCalculator();
    processLine(calc, "180 sin 90 cos 180 tan -90 sin -180 cos");
    expectStack(calc, [ZERO, ZERO, d(-1), d(-1)]);
  });

  test("gradian quadrant trig values are exact", () => {
    const calc = new RpnCalculator();
    processLine(calc, "grad 200 sin 100 cos 200 tan -100 sin -200 cos");
    expectStack(calc, [ZERO, ZERO, d(-1), d(-1)]);
  });

  test("tangent singularities report an error and preserve stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1 2 3 4 rad 42 sto A");
    const stack = [...calc.stack];
    const variables = new Map(calc.variables);

    expect(() => processLine(calc, "deg 90 tan")).toThrow("invalid operation (tangent undefined)");
    expectStack(calc, stack);
    expect(calc.angleMode).toBe(AngleMode.Rad);
    expect([...calc.variables.entries()].map(([name, value]) => [name, value.toString()])).toEqual(
      [...variables.entries()].map(([name, value]) => [name, value.toString()]),
    );
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

  test("display mode digit counts must be plain decimal integers", () => {
    const calc = new RpnCalculator();
    processLine(calc, "10 fix 2");

    expect(() => processLine(calc, "sci 0x3")).toThrow(
      'display digit count must be an integer: "0x3"',
    );
    expect(() => processLine(calc, "sci 2.5")).toThrow(
      'display digit count must be an integer: "2.5"',
    );
    expect(() => processLine(calc, "sci 12")).toThrow("display digit count must be from 0 to 11");
    expect(calc.display.mode).toBe(DisplayMode.Fix);
    expect(calc.display.digits).toBe(2);
    expectStack(calc, [ZERO, ZERO, ZERO, d(10)]);
  });

  test("scientific display mode", () => {
    const calc = new RpnCalculator();
    processLine(calc, "12345 sci 4");
    expect(formatStack(calc.stack, calc.display)).toBe("1.2345e+4");
  });

  test("engineering display mode", () => {
    const calc = new RpnCalculator();
    processLine(calc, "12345 eng 3");
    expect(formatStack(calc.stack, calc.display)).toBe("12.35e+3");
  });

  test("engineering display preserves significant digits when rounding changes the exponent", () => {
    const calc = new RpnCalculator();
    processLine(calc, "999.99 eng 3");
    expect(formatStack(calc.stack, calc.display)).toBe("1.000e+3");
  });

  test("all display mode restores compact display", () => {
    const calc = new RpnCalculator();
    processLine(calc, "5 fix 2 all");
    expect(calc.display.mode).toBe(DisplayMode.All);
    expect(formatStack(calc.stack, calc.display)).toBe("5");
  });

  test("all display uses scientific notation when ordinary notation exceeds 12 digits", () => {
    expect(formatNumber(d("999999999999"))).toBe("999999999999");
    expect(formatNumber(d("1000000000000"))).toBe("1e+12");
    expect(formatNumber(d("-1000000000000"))).toBe("-1e+12");
    expect(formatNumber(d("0.00000000001"))).toBe("0.00000000001");
    expect(formatNumber(d("0.000000000001"))).toBe("1e-12");
    expect(formatNumber(d("-0.000000000001"))).toBe("-1e-12");
    expect(formatNumber(d("0.12345678901"))).toBe("0.12345678901");
    expect(formatNumber(d("0.123456789012"))).toBe("1.23456789012e-1");
    expect(formatNumber(d("1e9000000000000000"))).toBe("1e+9000000000000000");
  });

  test("all display chooses notation after rounding to 12 significant digits", () => {
    expect(formatNumber(d("999999999999.4"))).toBe("999999999999");
    expect(formatNumber(d("999999999999.5"))).toBe("1e+12");
    expect(formatNumber(d("0.000000000009999999999995"))).toBe("0.00000000001");
  });

  test("fraction display toggles decimal values without changing the stack", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1.25 frac");

    expect(calc.x.toString()).toBe("1.25");
    expect(calc.display.fraction.enabled).toBe(true);
    expect(formatStack(calc.stack, calc.display)).toBe("1 1/4");

    processLine(calc, "frac");
    expect(calc.display.fraction.enabled).toBe(false);
    expect(formatStack(calc.stack, calc.display)).toBe("1.25");
  });

  test("fraction display uses a configurable maximum denominator", () => {
    const calc = new RpnCalculator();

    processLine(calc, "1.33333333333333 frac 8");
    expect(calc.display.fraction.maxDenominator).toBe(8);
    expect(formatStack(calc.stack, calc.display)).toBe("↓ 1 1/3");

    processLine(calc, "1.2 frac 4");
    expect(formatStack(calc.stack, calc.display)).toBe("↓ 1 1/4");

    processLine(calc, "frac 0");
    expect(calc.display.fraction.maxDenominator).toBe(4095);
  });

  test("fraction display indicates whether an approximation is above or below the exact value", () => {
    const calc = new RpnCalculator();

    processLine(calc, "1.25 frac 4");
    expect(formatStack(calc.stack, calc.display)).toBe("1 1/4");

    processLine(calc, "1.2");
    expect(formatStack(calc.stack, calc.display)).toBe("↓ 1 1/4");

    processLine(calc, "0.26");
    expect(formatStack(calc.stack, calc.display)).toBe("↑ 1/4");

    processLine(calc, "-0.26");
    expect(formatStack(calc.stack, calc.display)).toBe("↑ -1/4");
  });

  test("fraction display detects approximations hidden by internal decimal precision", () => {
    const calc = new RpnCalculator();

    processLine(calc, "1 3 / frac");
    expect(formatStack(calc.stack, calc.display)).toBe("↓ 1/3");

    processLine(calc, "2 3 /");
    expect(formatStack(calc.stack, calc.display)).toBe("↑ 2/3");
  });

  test("fraction rounding removes the approximation indicator", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1.2 frac 4");
    expect(formatStack(calc.stack, calc.display)).toBe("↓ 1 1/4");

    processLine(calc, "rnd");

    expect(calc.x.toString()).toBe("1.25");
    expect(formatStack(calc.stack, calc.display)).toBe("1 1/4");
  });

  test("fraction display handles negative and improper values", () => {
    const calc = new RpnCalculator();

    processLine(calc, "-1.25 frac");
    expect(formatStack(calc.stack, calc.display)).toBe("-1 1/4");

    processLine(calc, "2.99999999999999");
    expect(formatStack(calc.stack, calc.display)).toBe("↓ 3");

    processLine(calc, "-0.0001 frac 4");
    expect(formatStack(calc.stack, calc.display)).toBe("↑ 0");
  });

  test("decimal display modes turn fraction display off", () => {
    const calc = new RpnCalculator();

    processLine(calc, "1.25 frac fix 2");
    expect(calc.display.fraction.enabled).toBe(false);
    expect(formatStack(calc.stack, calc.display)).toBe("1.25");

    processLine(calc, "frac all");
    expect(calc.display.fraction.enabled).toBe(false);
  });

  test("invalid fraction denominator rolls back display changes", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1.25 frac 8");

    expect(() => processLine(calc, "frac 4096")).toThrow(
      "fraction denominator must be an integer from 0 to 4095",
    );
    expect(calc.display.fraction.enabled).toBe(true);
    expect(calc.display.fraction.maxDenominator).toBe(8);
    expect(formatStack(calc.stack, calc.display)).toBe("1 1/4");
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

  test("fixed display stays fixed when rounding produces a significant digit", () => {
    const calc = new RpnCalculator();
    processLine(calc, "0.000062 fix 4");
    expect(formatStack(calc.stack, calc.display)).toBe("0.0001");

    processLine(calc, "rnd");
    expect(calc.x.toString()).toBe("0.0001");
    expect(calc.lastX.toString()).toBe("0.000062");
  });

  test("fixed display falls back to scientific notation for values too wide for fixed", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1234567890123 fix 2");
    expect(formatStack(calc.stack, calc.display)).toBe("1.23e+12");
  });

  test("fixed display checks width after rounding", () => {
    const calc = new RpnCalculator();
    processLine(calc, "999999999999.9 fix 0");
    expect(formatStack(calc.stack, calc.display)).toBe("1e+12");
  });

  test("fixed display avoids materializing huge fixed-point strings", () => {
    const calc = new RpnCalculator();
    processLine(calc, "1e9000000000000000 fix 2");
    expect(formatStack(calc.stack, calc.display)).toBe("1.00e+9000000000000000");
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
