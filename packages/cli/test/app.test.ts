import { describe, expect, test } from "vitest";
import { type CliEnvironment, type CliInput, runCli } from "../src/app.js";

function createHarness(inputChunks: string[] = []): {
  environment: CliEnvironment;
  output: string[];
  error: string[];
  exitCodes: number[];
} {
  const output: string[] = [];
  const error: string[] = [];
  const exitCodes: number[] = [];
  const input: CliInput = {
    isTTY: false,
    setEncoding() {},
    async *[Symbol.asyncIterator]() {
      yield* inputChunks;
    },
  };
  return {
    environment: {
      input,
      output: { write: (text) => output.push(text) },
      error: { write: (text) => error.push(text) },
      version: "test-version",
      setExitCode: (code) => exitCodes.push(code),
    },
    output,
    error,
    exitCodes,
  };
}

describe("CLI application", () => {
  test("evaluates an expression without process-global output", async () => {
    const harness = createHarness();
    await runCli(["3 2 +"], harness.environment);
    expect(harness.output.join("")).toBe("5\n");
    expect(harness.error).toEqual([]);
    expect(harness.exitCodes).toEqual([]);
  });

  test("reads injected piped input", async () => {
    const harness = createHarness(["3 2", " +\n"]);
    await runCli([], harness.environment);
    expect(harness.output.join("")).toBe("5\n");
  });

  test("reports calculator failures without mutating process.exitCode", async () => {
    const harness = createHarness();
    await runCli(["-1 sqrt"], harness.environment);
    expect(harness.output).toEqual([]);
    expect(harness.error.join("")).toContain("error: invalid operation");
    expect(harness.exitCodes).toEqual([1]);
  });
});
