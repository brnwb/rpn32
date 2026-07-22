import { describe, expect, test } from "vitest";
import { CalculatorSession, HELP } from "../src/session.js";

describe("CalculatorSession", () => {
  test("derives prompts from angle and base modes", () => {
    const session = new CalculatorSession();
    expect(session.prompt).toBe("rpn> ");
    session.handleLine("rad");
    expect(session.prompt).toBe("rpn(rad)> ");
    session.handleLine("hex");
    expect(session.prompt).toBe("rpn(rad/hex)> ");
    session.handleLine("grad");
    expect(session.prompt).toBe("rpn(grad/hex)> ");
    session.handleLine("deg");
    expect(session.prompt).toBe("rpn(hex)> ");
  });

  test("handles empty, help, and quit meta commands", () => {
    const session = new CalculatorSession();
    expect(session.handleLine("")).toEqual({ quit: false, lines: ["0"] });
    expect(session.handleLine("help")).toEqual({ quit: false, lines: [HELP] });
    expect(HELP).toContain("% %chg");
    expect(HELP).toContain("sto + A");
    expect(HELP).toContain("rdown / rup");
    expect(HELP).toContain("show");
    expect(session.handleLine("quit")).toEqual({ quit: true, lines: [] });
  });

  test("stack toggles take effect and print immediately", () => {
    const session = new CalculatorSession();
    session.handleLine("1 2");
    expect(session.handleLine("stack").lines).toEqual(["T: 0  Z: 0  Y: 1  X: 2"]);
    expect(session.handleLine("stack off").lines).toEqual(["2"]);
  });

  test("evaluates ordinary expressions and suppresses stack for one-shot messages", () => {
    const session = new CalculatorSession();
    expect(session.evaluate("3 2 +").lines).toEqual(["5"]);
    expect(session.evaluate("42 sto A 123 view A").lines).toEqual(["A: 42"]);
    expect(session.evaluate("10 3 / fix 2 show").lines).toEqual(["3.33333333333"]);
  });

  test("prints SHOW before the normally formatted stack in the REPL", () => {
    const session = new CalculatorSession();
    expect(session.handleLine("10 3 / fix 2 show").lines).toEqual(["3.33333333333", "3.33"]);
    expect(session.handleLine("255 enter hex show 1").lines).toEqual(["FF", "1"]);
  });

  test("orders REPL errors and messages before the stack", () => {
    const session = new CalculatorSession();
    expect(session.handleLine("42 sto A view A").lines).toEqual(["A: 42", "42"]);
    expect(session.handleLine("0 /").lines).toEqual([
      "error: invalid operation (divide by zero)",
      "42",
    ]);
  });
});
