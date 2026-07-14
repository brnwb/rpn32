import { describe, expect, test } from "vitest";
import {
  BaseMode,
  DisplayMode,
  RpnCalculator,
  RpnError,
  formatStack,
  numberValue,
  processLine,
} from "../src/index.js";

describe("public core API", () => {
  test("constructs exact finite calculator values", () => {
    const calc = new RpnCalculator();
    calc.pushNumber(numberValue("0.1"));
    calc.pushNumber(numberValue("0.2"));
    processLine(calc, "+");
    expect(calc.x.toString()).toBe("0.3");
  });

  test("rejects invalid values at construction time", () => {
    try {
      numberValue("Infinity");
      throw new Error("expected numberValue to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RpnError);
      expect((error as RpnError).code).toBe("invalid_argument");
    }

    const calc = new RpnCalculator();
    expect(() => calc.pushNumber(42 as never)).toThrow(
      "pushNumber requires a value created by numberValue",
    );
  });

  test("returns defensive calculator views", () => {
    const calc = new RpnCalculator();
    processLine(calc, "42 sto A fix 2");
    const view = calc.view();

    (view.stack as Array<ReturnType<typeof numberValue>>)[3] = numberValue(99);
    (view.display as { digits: number }).digits = 10;
    (view.variables as Map<string, ReturnType<typeof numberValue>>).clear();

    expect(calc.x.toString()).toBe("42");
    expect(calc.display.digits).toBe(2);
    expect(calc.variables.get("a")?.toString()).toBe("42");
  });

  test("rolls every calculator state field back transactionally", () => {
    const calc = new RpnCalculator();
    processLine(calc, "7 sto A 8 fix 2 rad hex");
    const before = calc.view();

    expect(() => processLine(calc, "dec 9 sto B frac 8 deg unknown")).toThrow(RpnError);

    const after = calc.view();
    expect(after.angleMode).toBe(before.angleMode);
    expect(after.baseMode).toBe(before.baseMode);
    expect(after.display).toEqual(before.display);
    expect(after.stack.map(String)).toEqual(before.stack.map(String));
    expect([...after.variables].map(([name, value]) => [name, value.toString()])).toEqual(
      [...before.variables].map(([name, value]) => [name, value.toString()]),
    );
  });

  test("provides stable error categories and context", () => {
    const calc = new RpnCalculator();
    for (const [source, code] of [
      ["wat", "unknown_token"],
      ["sto", "missing_argument"],
      ["0 1/x", "divide_by_zero"],
      ["-1 sqrt", "domain"],
    ] as const) {
      try {
        processLine(calc, source);
        throw new Error(`expected ${source} to fail`);
      } catch (error) {
        expect(error).toBeInstanceOf(RpnError);
        expect((error as RpnError).code).toBe(code);
      }
    }
  });

  test("accepts leading zeroes in in-range base input", () => {
    const calc = new RpnCalculator();
    processLine(calc, "hex 0000000001");
    expect(calc.baseMode).toBe(BaseMode.Hex);
    expect(formatStack(calc.stack, calc.display, { baseMode: calc.baseMode })).toBe("1");
  });

  test("validates direct display configuration", () => {
    const calc = new RpnCalculator();
    expect(() => calc.setDisplayMode(DisplayMode.Fix, 12)).toThrow(RpnError);
    expect(calc.display.mode).toBe(DisplayMode.All);
  });

  test("returns typed events without retaining them in calculator state", () => {
    const calc = new RpnCalculator();
    const result = processLine(calc, "1.5 sto A frac view A");
    expect(result.events).toHaveLength(1);
    expect(processLine(calc, "").events).toEqual([]);
  });
});
