import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
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

describe("rubric doctor", () => {
  it("exits 0 for an empty git repo and suggests init", async () => {
    const repo = await createGitRepo();

    const result = await runRubric(["doctor", "--cwd", repo]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Rubric doctor");
    expect(result.stdout).toContain("AI Agent Readiness: 0 / 100");
    expect(result.stdout).toContain("[fail] .rubric/config.yaml found");
    expect(result.stdout).toContain("rubric init");
  });

  it("returns valid JSON for --format json", async () => {
    const repo = await createGitRepo();

    const result = await runRubric([
      "doctor",
      "--cwd",
      repo,
      "--format",
      "json"
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report).toMatchObject({
      score: 0,
      suggestedFixes: [
        "rubric init",
        "rubric add-pack base security",
        "rubric add-pack testing migrations",
        "rubric compile"
      ]
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "config.exists",
          status: "fail"
        })
      ])
    );
  });

  it("reports a positive score after init", async () => {
    const repo = await createGitRepo();

    await expect(runRubric(["init", "--cwd", repo])).resolves.toMatchObject({
      exitCode: 0
    });
    const result = await runRubric([
      "doctor",
      "--cwd",
      repo,
      "--format",
      "json"
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.score).toBeGreaterThan(0);
  });

  it("reports AGENTS.md managed block after init and compile", async () => {
    const repo = await createGitRepo();

    await expect(runRubric(["init", "--cwd", repo])).resolves.toMatchObject({
      exitCode: 0
    });
    await expect(runRubric(["compile", "--cwd", repo])).resolves.toMatchObject({
      exitCode: 0
    });
    const result = await runRubric(["doctor", "--cwd", repo]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "[pass] AGENTS.md contains Rubric managed block"
    );
  });

  it("warns when Copilot instructions are missing", async () => {
    const repo = await createGitRepo();

    await expect(runRubric(["init", "--cwd", repo])).resolves.toMatchObject({
      exitCode: 0
    });
    const result = await runRubric([
      "doctor",
      "--cwd",
      repo,
      "--format",
      "json"
    ]);
    const report = JSON.parse(result.stdout);

    expect(findCheck(report, "copilot.managed")).toMatchObject({
      status: "warn"
    });
  });

  it("detects the Rubric cache gitignore entry", async () => {
    const repo = await createGitRepo();

    await expect(runRubric(["init", "--cwd", repo])).resolves.toMatchObject({
      exitCode: 0
    });
    const result = await runRubric([
      "doctor",
      "--cwd",
      repo,
      "--format",
      "json"
    ]);
    const report = JSON.parse(result.stdout);

    expect(findCheck(report, "gitignore.cache")).toMatchObject({
      status: "pass"
    });
  });

  it("detects a GitHub workflow that calls rubric check", async () => {
    const repo = await createGitRepo();

    await write(
      repo,
      ".github/workflows/rubric.yml",
      "name: Rubric\njobs:\n  rubric:\n    steps:\n      - run: npx --yes --package @rubric-dev/cli rubric check --base main\n"
    );
    const result = await runRubric([
      "doctor",
      "--cwd",
      repo,
      "--format",
      "json"
    ]);
    const report = JSON.parse(result.stdout);

    expect(findCheck(report, "workflow.rubric-check")).toMatchObject({
      status: "pass"
    });
  });

  it("detects a PR template Rubric block", async () => {
    const repo = await createGitRepo();

    await write(
      repo,
      ".github/pull_request_template.md",
      "## Summary\n\n<!-- rubric:begin -->\n## Rubric\n<!-- rubric:end -->\n"
    );
    const result = await runRubric([
      "doctor",
      "--cwd",
      repo,
      "--format",
      "json"
    ]);
    const report = JSON.parse(result.stdout);

    expect(findCheck(report, "pr-template.rubric")).toMatchObject({
      status: "pass"
    });
  });

  it("exits 2 with a helpful message for invalid config", async () => {
    const repo = await createGitRepo();
    await write(repo, ".rubric/config.yaml", "version: nope\n");

    const result = await runRubric(["doctor", "--cwd", repo]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(".rubric/config.yaml");
  });

  it("exits 2 outside a git repo", async () => {
    const repo = await createTempDir("rubric-doctor-no-git-");

    const result = await runRubric(["doctor", "--cwd", repo]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Not inside a git repository");
  });

  it("detects pnpm from pnpm-lock.yaml", async () => {
    const repo = await createGitRepo();
    await write(repo, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");

    const result = await runRubric([
      "doctor",
      "--cwd",
      repo,
      "--format",
      "json"
    ]);
    const report = JSON.parse(result.stdout);

    expect(findCheck(report, "package-manager.detected")).toMatchObject({
      status: "pass",
      message: "Detected package manager: pnpm."
    });
  });

  it("returns stable deduplicated suggested fixes", async () => {
    const repo = await createGitRepo();
    await write(
      repo,
      ".github/pull_request_template.md",
      "## Summary\n\nNo rubric section.\n"
    );

    const result = await runRubric([
      "doctor",
      "--cwd",
      repo,
      "--format",
      "json"
    ]);
    const report = JSON.parse(result.stdout);

    expect(report.suggestedFixes).toEqual([
      "rubric init",
      "rubric add-pack base security",
      "rubric add-pack testing migrations",
      "rubric compile"
    ]);
  });
});

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface JsonDoctorReport {
  score: number;
  checks: Array<{
    id: string;
    title: string;
    status: string;
    message: string;
    suggestion?: string;
    weight: number;
  }>;
  suggestedFixes: string[];
}

async function runRubric(args: string[]): Promise<RunResult> {
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

async function createGitRepo(): Promise<string> {
  const repo = await createTempDir("rubric-doctor-");

  await git(repo, ["init", "--initial-branch=master"]);
  await git(repo, ["config", "user.email", "rubric@example.com"]);
  await git(repo, ["config", "user.name", "Rubric Test"]);
  await write(repo, "README.md", "# Test repo\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "initial"]);

  return repo;
}

async function createTempDir(prefix: string): Promise<string> {
  const repo = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  tempRepos.push(repo);
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

function findCheck(
  report: JsonDoctorReport,
  id: string
): JsonDoctorReport["checks"][number] | undefined {
  return report.checks.find((check) => check.id === id);
}
