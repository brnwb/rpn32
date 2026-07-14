import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const packageVersion = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;
const cliPath = "packages/cli/dist/bin.js";

function runWithInput(input: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error(`CLI exited with code ${code}`), { stdout, stderr }));
    });
    child.stdin.end(input);
  });
}

describe("rpn32 CLI", () => {
  test("prints help", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, "--help"]);

    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("rpn32 '3 2 +'");
    expect(stdout).toContain("deg rad grad");
    expect(stdout).toContain("dec hex oct bin");
    expect(stderr).toBe("");
  });

  test("prints version", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, "--version"]);

    expect(stdout).toBe(`${packageVersion}\n`);
    expect(stderr).toBe("");
  });

  test("evaluates a single quoted command-line expression", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, "3 2 +"]);

    expect(stdout).toBe("5\n");
    expect(stderr).toBe("");
  });

  test("evaluates base-mode expressions", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, "hex ff a +"]);

    expect(stdout).toBe("109\n");
    expect(stderr).toBe("");
  });

  test("rejects multiple command-line expression arguments", async () => {
    await expect(execFileAsync(process.execPath, [cliPath, "3", "2", "+"])).rejects.toMatchObject({
      stdout: "",
      stderr:
        "error: expression must be provided as a single quoted argument\nusage: rpn32 '3 2 +'\n",
    });
  });

  test("evaluates piped stdin", async () => {
    const { stdout, stderr } = await runWithInput("3 2 +\n");

    expect(stdout).toBe("5\n");
    expect(stderr).toBe("");
  });

  test("one-shot expression with display messages prints messages without final stack", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      cliPath,
      "42 sto A 123 view A",
    ]);

    expect(stdout).toBe("A: 42\n");
    expect(stderr).toBe("");
  });

  test("piped input with display messages prints messages without final stack", async () => {
    const { stdout, stderr } = await runWithInput("42 sto A 99 sto B vars\n");

    expect(stdout).toBe("A: 42\nB: 99\n");
    expect(stderr).toBe("");
  });
});
