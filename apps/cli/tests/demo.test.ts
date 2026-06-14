import { execFile } from "node:child_process";
import { access, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const cliEntry = join(workspaceRoot, "apps/cli/src/index.ts");
const tsxBin = join(workspaceRoot, "node_modules/.bin/tsx");
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dirPath) => rm(dirPath, { force: true, recursive: true }))
  );
});

describe("rubric demo", () => {
  it("exits 0 outside a git repo and prints the sample report", async () => {
    const cwd = await createTempDir("rubric-demo-no-git-");

    const result = await runRubric(["demo"], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Rubric demo");
    expect(result.stdout).toContain("Fix billing retry behavior");
    expect(result.stdout).toContain("Rules checked: 5");
    expect(result.stdout).toContain("Findings: 3");
    expect(result.stdout).toContain("testing.required-for-api-change");
    expect(result.stdout).toContain("db.destructive-migration-warning");
    expect(result.stdout).toContain("pr.too-broad");
    expect(result.stdout).toContain("Try it in your repo");
  });

  it("returns stable JSON for --format json", async () => {
    const cwd = await createTempDir("rubric-demo-json-");

    const result = await runRubric(["demo", "--format", "json"], cwd);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report).toMatchObject({
      samplePr: {
        title: "Fix billing retry behavior"
      },
      rulesCount: 5,
      changedFiles: [
        "app/api/billing/retry/route.ts",
        "src/services/billing/retry.ts",
        "db/migrations/20260614_drop_legacy_retry_table.sql",
        "src/utils/date.ts",
        "src/components/BillingStatus.tsx",
        "docs/billing.md"
      ],
      stats: {
        filesChanged: 6,
        additions: 99,
        deletions: 29,
        directoriesChanged: 6
      }
    });
    expect(report.findings).toHaveLength(3);
    expect(report.blockingFindings.length).toBeGreaterThanOrEqual(1);
  });

  it("renders markdown with a findings table", async () => {
    const cwd = await createTempDir("rubric-demo-markdown-");

    const result = await runRubric(["demo", "--format", "markdown"], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## Rubric demo");
    expect(result.stdout).toContain(
      "**Sample PR:** Fix billing retry behavior"
    );
    expect(result.stdout).toContain("| Severity | Rule | Finding | Blocking |");
    expect(result.stdout).toContain("testing.required-for-api-change");
  });

  it("does not create repository setup files", async () => {
    const cwd = await createTempDir("rubric-demo-no-writes-");

    const result = await runRubric(["demo"], cwd);

    expect(result.exitCode).toBe(0);
    await expect(pathExists(join(cwd, ".rubric"))).resolves.toBe(false);
    await expect(pathExists(join(cwd, "AGENTS.md"))).resolves.toBe(false);
    await expect(pathExists(join(cwd, "CLAUDE.md"))).resolves.toBe(false);
    await expect(pathExists(join(cwd, ".github"))).resolves.toBe(false);
  });

  it("accepts --debug without changing successful behavior", async () => {
    const cwd = await createTempDir("rubric-demo-debug-");

    const result = await runRubric(["demo", "--debug"], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Rubric demo");
  });
});

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runRubric(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      tsxBin,
      ["--conditions=development", cliEntry, ...args],
      {
        cwd,
        env: process.env,
        maxBuffer: 50 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        resolve({
          exitCode:
            error !== null && typeof error.code === "number" ? error.code : 0,
          stdout,
          stderr
        });
      }
    );
  });
}

async function createTempDir(prefix: string): Promise<string> {
  const dirPath = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  tempDirs.push(dirPath);
  return dirPath;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
