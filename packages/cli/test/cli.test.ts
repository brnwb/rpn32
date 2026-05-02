import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);

describe("rpn32 CLI", () => {
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
