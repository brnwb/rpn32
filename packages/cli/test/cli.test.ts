import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);

describe("rpn32 CLI", () => {
  test("prints help", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "packages/cli/dist/cli.js",
      "--help",
    ]);

    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("rpn32 '3 2 +'");
    expect(stderr).toBe("");
  });

  test("prints version", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "packages/cli/dist/cli.js",
      "--version",
    ]);

    expect(stdout).toBe("0.1.1\n");
    expect(stderr).toBe("");
  });

  test("evaluates a single quoted command-line expression", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "packages/cli/dist/cli.js",
      "3 2 +",
    ]);

    expect(stdout).toBe("5\n");
    expect(stderr).toBe("");
  });

  test("rejects multiple command-line expression arguments", async () => {
    await expect(
      execFileAsync(process.execPath, ["packages/cli/dist/cli.js", "3", "2", "+"]),
    ).rejects.toMatchObject({
      stdout: "",
      stderr:
        "error: expression must be provided as a single quoted argument\nusage: rpn32 '3 2 +'\n",
    });
  });

  test("evaluates piped stdin", async () => {
    const { stdout, stderr } = await execFileAsync("bash", [
      "-lc",
      `printf '3 2 +\\n' | ${JSON.stringify(process.execPath)} packages/cli/dist/cli.js`,
    ]);

    expect(stdout).toBe("5\n");
    expect(stderr).toBe("");
  });
});
