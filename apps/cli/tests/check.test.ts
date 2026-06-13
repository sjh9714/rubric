import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const tempRepos: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRepos
      .splice(0)
      .map((repoPath) => rm(repoPath, { force: true, recursive: true }))
  );
});

describe("rubric check", () => {
  it("exits 0 with no rules and prints guidance", async () => {
    const repo = await createGitRepo();

    const result = await runRubric(["check", "--cwd", repo]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No rubric rules found.");
    expect(result.stdout).toContain("Add rules under `.rubric/rules`");
  });

  it("returns valid JSON for --format json", async () => {
    const repo = await createApiRepo({
      includeTest: true,
      severity: "error"
    });

    const result = await runRubric([
      "check",
      "--cwd",
      repo,
      "--base",
      "master",
      "--format",
      "json"
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report).toMatchObject({
      baseRef: "master",
      headRef: "HEAD",
      rulesCount: 1,
      stats: {
        filesChanged: 2
      },
      findings: [],
      blockingFindings: []
    });
  });

  it("exits 1 when an error severity finding blocks", async () => {
    const repo = await createApiRepo({
      includeTest: false,
      severity: "error"
    });

    const result = await runRubric([
      "check",
      "--cwd",
      repo,
      "--base",
      "master"
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("testing.required-for-api-change");
  });

  it("exits 0 when only warning findings exist by default", async () => {
    const repo = await createApiRepo({
      includeTest: false,
      severity: "warning"
    });

    const result = await runRubric([
      "check",
      "--cwd",
      repo,
      "--base",
      "master"
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("warning");
    expect(result.stdout).toContain("testing.required-for-api-change");
  });

  it("uses --pr-body-file to satisfy migration rollback rules", async () => {
    const repo = await createMigrationRepo();
    const bodyFile = join(repo, "pr-body.md");
    await writeFile(
      bodyFile,
      "## Summary\n\nAdds a migration.\n\n## Rollback plan\n\nRevert the migration.\n"
    );

    const result = await runRubric([
      "check",
      "--cwd",
      repo,
      "--base",
      "master",
      "--pr-body-file",
      bodyFile
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Findings: 0");
  });

  it("exits 2 with a helpful message for an invalid base ref", async () => {
    const repo = await createApiRepo({
      includeTest: true,
      severity: "error"
    });

    const result = await runRubric([
      "check",
      "--cwd",
      repo,
      "--base",
      "missing-base"
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Unable to find git merge-base");
    expect(result.stderr).toContain("missing-base");
  });

  it("includes rule id, severity, and suggestion in text output", async () => {
    const repo = await createApiRepo({
      includeTest: false,
      severity: "warning"
    });

    const result = await runRubric([
      "check",
      "--cwd",
      repo,
      "--base",
      "master"
    ]);

    expect(result.stdout).toContain("testing.required-for-api-change");
    expect(result.stdout).toContain("warning");
    expect(result.stdout).toContain("Suggestion:");
    expect(result.stdout).toContain("Add a test file under tests/.");
  });

  it("includes a findings table in markdown output", async () => {
    const repo = await createApiRepo({
      includeTest: false,
      severity: "warning"
    });

    const result = await runRubric([
      "check",
      "--cwd",
      repo,
      "--base",
      "master",
      "--format",
      "markdown"
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("| Severity | Rule | Message |");
    expect(result.stdout).toContain(
      "| warning | testing.required-for-api-change |"
    );
  });

  it("respects RUBRIC_PR_BODY", async () => {
    const repo = await createMigrationRepo();

    const result = await runRubric(
      ["check", "--cwd", repo, "--base", "master"],
      {
        RUBRIC_PR_BODY:
          "## Summary\n\nAdds a migration.\n\n## Rollback plan\n\nRevert it.\n"
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Findings: 0");
  });

  it("lets --base override config default_base", async () => {
    const repo = await createApiRepo({
      configDefaultBase: "missing-base",
      includeTest: true,
      severity: "error"
    });

    const result = await runRubric([
      "check",
      "--cwd",
      repo,
      "--base",
      "master",
      "--format",
      "json"
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.baseRef).toBe("master");
  });
});

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runRubric(
  args: string[],
  env: Record<string, string> = {}
): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      "pnpm",
      [
        "exec",
        "tsx",
        "--conditions=development",
        "apps/cli/src/index.ts",
        ...args
      ],
      {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          ...env
        },
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

async function createApiRepo({
  configDefaultBase = "master",
  includeTest,
  severity
}: {
  configDefaultBase?: string;
  includeTest: boolean;
  severity: "error" | "warning";
}): Promise<string> {
  const repo = await createGitRepo();

  await write(
    repo,
    ".rubric/config.yaml",
    `version: 1

project:
  default_base: ${configDefaultBase}
`
  );
  await write(
    repo,
    ".rubric/rules/api-tests.yaml",
    `id: testing.required-for-api-change
title: Tests required for API changes
severity: ${severity}
applies_to:
  paths:
    - src/api/**
checks:
  required_changed_files:
    any:
      - tests/**/*.test.ts
message: API changes need tests.
suggestion: Add a test file under tests/.
`
  );
  await git(repo, ["add", ".rubric"]);
  await git(repo, ["commit", "-m", "add rubric rules"]);
  await git(repo, ["checkout", "-b", "feature"]);
  await write(repo, "src/api/users.ts", "export const user = 'new';\n");

  if (includeTest) {
    await write(
      repo,
      "tests/users.test.ts",
      "test('user', () => undefined);\n"
    );
  }

  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "feature changes"]);

  return repo;
}

async function createMigrationRepo(): Promise<string> {
  const repo = await createGitRepo();

  await write(
    repo,
    ".rubric/rules/migration.yaml",
    `id: db.migration-rollback-note
title: Migration rollback plan required
severity: error
applies_to:
  paths:
    - db/migrations/**
checks:
  required_pr_body_sections:
    any:
      - Rollback plan
message: Database migrations require rollback notes.
suggestion: Add a "Rollback plan" section to the PR description.
`
  );
  await git(repo, ["add", ".rubric"]);
  await git(repo, ["commit", "-m", "add rubric rules"]);
  await git(repo, ["checkout", "-b", "feature"]);
  await write(
    repo,
    "db/migrations/001_add_users.sql",
    "create table users (id integer primary key);\n"
  );
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "add migration"]);

  return repo;
}

async function createGitRepo(): Promise<string> {
  const repo = await realpath(await mkdtemp(join(tmpdir(), "rubric-cli-")));
  tempRepos.push(repo);

  await git(repo, ["init", "--initial-branch=master"]);
  await git(repo, ["config", "user.email", "rubric@example.com"]);
  await git(repo, ["config", "user.name", "Rubric Test"]);
  await write(repo, "README.md", "# Test repo\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "initial"]);

  return repo;
}

async function write(
  repo: string,
  path: string,
  contents: string
): Promise<void> {
  const filePath = join(repo, path);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}
