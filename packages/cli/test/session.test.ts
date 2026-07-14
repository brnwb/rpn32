import { describe, expect, test } from "vitest";
import { RpnCalculator, processLine } from "@brnwb/rpn32-core";
import { formatEvent } from "../src/rendering.js";
import { parseReplInput } from "../src/session.js";

describe("CLI session", () => {
  test("parses terminal-local commands separately from calculator expressions", () => {
    expect(parseReplInput("stack")).toEqual({ type: "stack", full: true });
    expect(parseReplInput("STACK OFF")).toEqual({ type: "stack", full: false });
    expect(parseReplInput("  ")).toEqual({ type: "empty" });
    expect(parseReplInput("3 2 +")).toEqual({ type: "expression", source: "3 2 +" });
  });

  test("renders variable events with active calculator formatting", () => {
    const calc = new RpnCalculator();
    const result = processLine(calc, "1.5 sto A frac view A all");
    const event = result.events[0];
    expect(event).toBeDefined();
    expect(formatEvent(event!)).toBe("A: 1 1/2");
  });
});
