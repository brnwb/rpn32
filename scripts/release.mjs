#!/usr/bin/env node
/**
 * Release script for rpn32
 *
 * Usage:
 *   node scripts/release.mjs <major|minor|patch>
 *   node scripts/release.mjs <x.y.z>
 *
 * Steps:
 * 1. Check for uncommitted changes
 * 2. Bump or set package versions
 * 3. Update CHANGELOG.md: [Unreleased] -> [version] - date
 * 4. Commit and tag
 * 5. Publish to npm
 * 6. Add new [Unreleased] section to CHANGELOG.md
 * 7. Commit
 * 8. Push main and tag
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

const RELEASE_TARGET = process.argv[2];
const BUMP_TYPES = new Set(["major", "minor", "patch"]);
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const PACKAGE_JSONS = ["package.json", "packages/core/package.json", "packages/cli/package.json"];

if (!RELEASE_TARGET || (!BUMP_TYPES.has(RELEASE_TARGET) && !SEMVER_RE.test(RELEASE_TARGET))) {
  console.error("Usage: node scripts/release.mjs <major|minor|patch|x.y.z>");
  process.exit(1);
}

function run(cmd, options = {}) {
  console.log(`$ ${cmd}`);
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      stdio: options.silent ? "pipe" : "inherit",
      ...options,
    });
  } catch {
    if (!options.ignoreError) {
      console.error(`Command failed: ${cmd}`);
      process.exit(1);
    }
    return null;
  }
}

function getVersion() {
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  return pkg.version;
}

function compareVersions(a, b) {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const diff = (aParts[i] || 0) - (bParts[i] || 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function stageChangedFiles() {
  const output = run("git ls-files -m -o -d --exclude-standard", { silent: true });
  const paths = [
    ...new Set(
      (output || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
  if (paths.length === 0) {
    return;
  }

  run(`git add -- ${paths.map(shellQuote).join(" ")}`);
}

function bumpVersion(version, bump) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function bumpOrSetVersion(target) {
  const currentVersion = getVersion();
  const version = BUMP_TYPES.has(target) ? bumpVersion(currentVersion, target) : target;

  if (compareVersions(version, currentVersion) <= 0) {
    console.error(
      `Error: release version ${version} must be greater than current version ${currentVersion}.`,
    );
    process.exit(1);
  }

  for (const path of PACKAGE_JSONS) {
    const pkg = JSON.parse(readFileSync(path, "utf-8"));
    pkg.version = version;
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  return version;
}

function updateChangelogForRelease(version) {
  const date = new Date().toISOString().split("T")[0];
  const content = readFileSync("CHANGELOG.md", "utf-8");
  const match = content.match(/^# Changelog\n\n## Unreleased\n\n([\s\S]*?)(?=\n## )/);

  if (!match) {
    console.error("Error: could not find CHANGELOG.md Unreleased section.");
    process.exit(1);
  }

  const releaseNotes = match[1].trim();
  if (!releaseNotes) {
    console.error(
      "Error: CHANGELOG.md Unreleased section is empty. Add release notes before releasing.",
    );
    process.exit(1);
  }

  const updated = content.replace(
    match[0].trimEnd(),
    `# Changelog\n\n## [${version}] - ${date}\n\n${releaseNotes}`,
  );
  writeFileSync("CHANGELOG.md", updated);
}

function addUnreleasedSection() {
  const content = readFileSync("CHANGELOG.md", "utf-8");
  const updated = content.replace(/^(# Changelog\n\n)/, "$1## Unreleased\n\n");
  writeFileSync("CHANGELOG.md", updated);
}

function updateCliVersionTest(fromVersion, toVersion) {
  const path = "packages/cli/test/cli.test.ts";
  const content = readFileSync(path, "utf-8");
  const previous = `expect(stdout).toBe("${fromVersion}\\n");`;
  const next = `expect(stdout).toBe("${toVersion}\\n");`;

  if (!content.includes(previous)) {
    console.error(`Error: could not find CLI version test expectation for ${fromVersion}.`);
    process.exit(1);
  }

  writeFileSync(path, content.replace(previous, next));
}

// Main flow
console.log("\n=== Release Script ===\n");

// 1. Check for uncommitted changes
console.log("Checking for uncommitted changes...");
const status = run("git status --porcelain", { silent: true });
if (status?.trim()) {
  console.error("Error: Uncommitted changes detected. Commit or stash first.");
  console.error(status);
  process.exit(1);
}
console.log("  Working directory clean\n");

console.log("Checking branch...");
const branch = run("git branch --show-current", { silent: true }).trim();
if (branch !== "main") {
  console.error(`Error: release must run from main. Current branch: ${branch || "detached HEAD"}.`);
  process.exit(1);
}
run("git fetch origin main");
if (
  run("git rev-parse HEAD", { silent: true }).trim() !==
  run("git rev-parse origin/main", { silent: true }).trim()
) {
  console.error("Error: local main is not up to date with origin/main. Run git pull first.");
  process.exit(1);
}
console.log("  main is up to date\n");

console.log("Checking npm authentication...");
run("pnpm whoami");
console.log();

// 2. Bump or set version
const currentVersion = getVersion();
const version = bumpOrSetVersion(RELEASE_TARGET);
const tag = `v${version}`;
if (run(`git tag --list ${shellQuote(tag)}`, { silent: true }).trim()) {
  console.error(`Error: tag ${tag} already exists.`);
  process.exit(1);
}
console.log(`  New version: ${version}\n`);

// 3. Update changelog and version test
console.log("Updating CHANGELOG.md...");
updateChangelogForRelease(version);
console.log();

console.log("Updating CLI version test...");
updateCliVersionTest(currentVersion, version);
console.log();

console.log("Validating release...");
run("pnpm install --lockfile-only");
run("pnpm run check");
run("pnpm publish -r --access public --publish-branch main --dry-run");
console.log();

// 4. Commit and tag
console.log("Committing and tagging...");
stageChangedFiles();
run(`git commit -m ${shellQuote(`Release ${version}`)}`);
run(`git tag ${shellQuote(tag)}`);
console.log();

// 5. Publish
console.log("Publishing to npm...");
run("pnpm publish -r --access public --publish-branch main");
console.log();

// 6. Add new Unreleased section
console.log("Adding Unreleased section for next cycle...");
addUnreleasedSection();
console.log();

// 7. Commit
console.log("Committing changelog updates...");
stageChangedFiles();
run('git commit -m "Add Unreleased section for next cycle"');
console.log();

// 8. Push
console.log("Pushing to remote...");
run("git push origin main");
run(`git push origin ${shellQuote(tag)}`);
console.log();

console.log(`=== Released ${tag} ===`);
