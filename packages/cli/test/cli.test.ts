import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);

describe("rpn32 CLI", () => {
  test.each(["--help", "-h"])("prints help for %s", async (flag) => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "packages/cli/dist/cli.js",
      flag,
    ]);

    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("rpn32 '3 2 +'");
    expect(stdout).toContain("deg rad grad");
    expect(stdout).toContain("dec hex oct bin");
    expect(stdout).toContain("% %chg");
    expect(stdout).toContain("sto + A");
    expect(stderr).toBe("");
  });

  test.each(["--version", "-v"])("prints version for %s", async (flag) => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "packages/cli/dist/cli.js",
      flag,
    ]);

    expect(stdout).toBe("0.5.0\n");
    expect(stderr).toBe("");
  });

  test("does not expose compiled session modules as package APIs", async () => {
    await expect(
      execFileAsync(
        process.execPath,
        ["--input-type=module", "--eval", 'import("@brnwb/rpn32-cli/dist/session.js")'],
        { cwd: "packages/cli" },
      ),
    ).rejects.toMatchObject({ stderr: expect.stringContaining("ERR_PACKAGE_PATH_NOT_EXPORTED") });
  });

  test("evaluates a single quoted command-line expression", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "packages/cli/dist/cli.js",
      "3 2 +",
    ]);

    expect(stdout).toBe("5\n");
    expect(stderr).toBe("");
  });

  test("evaluates base-mode expressions", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "packages/cli/dist/cli.js",
      "hex ff a +",
    ]);

    expect(stdout).toBe("109\n");
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

  test.each(
    ["--help", "-h", "--version", "-v"].flatMap((flag) => [
      [flag, "3"],
      ["3", flag],
    ]),
  )("recognizes %s only when it is the sole argument", async (...args) => {
    await expect(
      execFileAsync(process.execPath, ["packages/cli/dist/cli.js", ...args]),
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

  test("one-shot expression with display messages prints messages without final stack", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "packages/cli/dist/cli.js",
      "42 sto A 123 view A",
    ]);

    expect(stdout).toBe("A: 42\n");
    expect(stderr).toBe("");
  });

  test("SHOW prints full precision without changing the selected display format", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "packages/cli/dist/cli.js",
      "10 3 / fix 2 show",
    ]);

    expect(stdout).toBe("3.33333333333\n");
    expect(stderr).toBe("");
  });

  test("piped input with display messages prints messages without final stack", async () => {
    const { stdout, stderr } = await execFileAsync("bash", [
      "-lc",
      `printf '42 sto A 99 sto B vars\\n' | ${JSON.stringify(process.execPath)} packages/cli/dist/cli.js`,
    ]);

    expect(stdout).toBe("A: 42\nB: 99\n");
    expect(stderr).toBe("");
  });
});
