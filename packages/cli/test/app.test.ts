import { PassThrough, Readable, Writable } from "node:stream";
import { describe, expect, test } from "vitest";
import { type CliEnvironment, type CliInput, runCli } from "../src/app.js";

class CaptureOutput extends Writable {
  constructor(private readonly chunks: string[]) {
    super();
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(chunk.toString());
    callback();
  }
}

function createHarness(inputChunks: string[] = []): {
  environment: CliEnvironment;
  output: string[];
  error: string[];
  exitCodes: number[];
} {
  const output: string[] = [];
  const error: string[] = [];
  const exitCodes: number[] = [];
  const input = Object.assign(Readable.from(inputChunks), { isTTY: false }) as CliInput;
  return {
    environment: {
      input,
      output: new CaptureOutput(output),
      error: new CaptureOutput(error),
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

  test("runs an injected interactive readline session", async () => {
    const input = Object.assign(new PassThrough(), { isTTY: true }) as CliInput;
    const output: string[] = [];
    const error: string[] = [];
    const environment: CliEnvironment = {
      input,
      output: new CaptureOutput(output),
      error: new CaptureOutput(error),
      version: "test-version",
      setExitCode() {},
    };

    input.end("3 2 +\nstack\nstack off\n-1 sqrt\nquit\n");
    await runCli([], environment);

    const rendered = output.join("");
    expect(rendered).toContain("rpn32 — type 'help' for commands, 'quit' to exit");
    expect(rendered).toContain("5");
    expect(rendered).toContain("T: 0");
    expect(rendered).toContain("error: invalid operation");
    expect(error).toEqual([]);
  });

  test("renders command events using the active calculator display", async () => {
    const harness = createHarness();
    await runCli(["1.5 sto A frac view A all"], harness.environment);
    expect(harness.output.join("")).toBe("A: 1 1/2\n");
  });
});
