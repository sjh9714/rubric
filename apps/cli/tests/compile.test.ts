import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
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

describe("rubric compile", () => {
  it("creates AGENTS.md and CLAUDE.md", async () => {
    const repo = await createRuleRepo({
      targets: ["agents", "claude"]
    });

    const result = await runRubric(["compile", "--cwd", repo]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("created AGENTS.md");
    expect(result.stdout).toContain("created CLAUDE.md");
    await expect(read(repo, "AGENTS.md")).resolves.toContain(
      "API changes require tests"
    );
    await expect(read(repo, "CLAUDE.md")).resolves.toContain("@AGENTS.md");
  });

  it("creates only AGENTS.md for --target agents", async () => {
    const repo = await createRuleRepo({
      targets: ["agents", "claude"]
    });

    const result = await runRubric([
      "compile",
      "--cwd",
      repo,
      "--target",
      "agents"
    ]);

    expect(result.exitCode).toBe(0);
    await expect(read(repo, "AGENTS.md")).resolves.toContain(
      "API changes require tests"
    );
    await expect(access(join(repo, "CLAUDE.md"))).rejects.toThrow();
  });

  it("creates all target files for --target all", async () => {
    const repo = await createRuleRepo({
      targets: ["agents", "claude", "copilot", "cursor", "pr_template"]
    });

    const result = await runRubric([
      "compile",
      "--cwd",
      repo,
      "--target",
      "all"
    ]);

    expect(result.exitCode).toBe(0);
    await expect(access(join(repo, "AGENTS.md"))).resolves.toBeUndefined();
    await expect(access(join(repo, "CLAUDE.md"))).resolves.toBeUndefined();
    await expect(
      access(join(repo, ".github/copilot-instructions.md"))
    ).resolves.toBeUndefined();
    await expect(
      access(join(repo, ".github/instructions/rubric.instructions.md"))
    ).resolves.toBeUndefined();
    await expect(
      access(join(repo, ".cursor/rules/rubric.mdc"))
    ).resolves.toBeUndefined();
    await expect(
      access(join(repo, ".github/pull_request_template.md"))
    ).resolves.toBeUndefined();
  });

  it("writes nothing during dry runs", async () => {
    const repo = await createRuleRepo({
      targets: ["agents"]
    });

    const result = await runRubric([
      "compile",
      "--cwd",
      repo,
      "--target",
      "agents",
      "--dry-run"
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dry run. No files were written.");
    expect(result.stdout).toContain("would_create AGENTS.md");
    await expect(access(join(repo, "AGENTS.md"))).rejects.toThrow();
  });

  it("exits 0 with a friendly message when no rules exist", async () => {
    const repo = await createGitRepo();

    const result = await runRubric(["compile", "--cwd", repo]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No rubric rules found.");
    await expect(access(join(repo, "AGENTS.md"))).rejects.toThrow();
  });

  it("preserves existing AGENTS.md user content", async () => {
    const repo = await createRuleRepo({
      targets: ["agents"]
    });
    await write(repo, "AGENTS.md", "# Team notes\n\nKeep this.\n");

    const result = await runRubric([
      "compile",
      "--cwd",
      repo,
      "--target",
      "agents"
    ]);
    const agents = await read(repo, "AGENTS.md");

    expect(result.exitCode).toBe(0);
    expect(agents).toContain("# Team notes");
    expect(agents).toContain("Keep this.");
    expect(agents).toContain("<!-- rubric:begin -->");
  });

  it("exits 2 with a helpful message for unknown targets", async () => {
    const repo = await createRuleRepo({
      targets: ["agents"]
    });

    const result = await runRubric([
      "compile",
      "--cwd",
      repo,
      "--target",
      "unknown"
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Unknown compile target");
    expect(result.stderr).toContain("pr-template");
  });

  it("includes default pack rules after init and compile", async () => {
    const repo = await createGitRepo();

    await expect(runRubric(["init", "--cwd", repo])).resolves.toMatchObject({
      exitCode: 0
    });
    const result = await runRubric(["compile", "--cwd", repo]);
    const agents = await read(repo, "AGENTS.md");

    expect(result.exitCode).toBe(0);
    expect(agents).toContain("PR description should list commands run");
    expect(agents).toContain("Secret-like values should not be committed");
  });
});

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
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

async function createRuleRepo({
  targets
}: {
  targets: string[];
}): Promise<string> {
  const repo = await createGitRepo();

  await write(
    repo,
    ".rubric/rules/api-tests.yaml",
    `id: testing.required-for-api-change
title: API changes require tests
description: API behavior changes should include matching tests.
severity: error
applies_to:
  paths:
    - src/api/**
checks:
  required_changed_files:
    any:
      - tests/**/*.test.ts
message: This PR changes API code but does not modify any test files.
suggestion: Add or update tests covering the changed API behavior.
compile:
  targets:
${targets.map((target) => `    - ${target}`).join("\n")}
`
  );

  return repo;
}

async function createGitRepo(): Promise<string> {
  const repo = await realpath(await mkdtemp(join(tmpdir(), "rubric-compile-")));
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

async function read(repo: string, path: string): Promise<string> {
  return readFile(join(repo, path), "utf8");
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}
