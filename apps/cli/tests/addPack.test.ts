import { execFile } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
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

describe("rubric add-pack", () => {
  it("lists built-in packs", async () => {
    const result = await runRubric(["add-pack", "--list"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Built-in packs");
    expect(result.stdout).toContain("testing");
    expect(result.stdout).toContain("migrations");
  });

  it("creates rule files for a requested pack", async () => {
    const repo = await createGitRepo();

    const result = await runRubric(["add-pack", "testing", "--cwd", repo]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "created .rubric/rules/testing.required-for-api-change.yaml"
    );
    await expect(
      access(join(repo, ".rubric/rules/testing.required-for-api-change.yaml"))
    ).resolves.toBeUndefined();
    await expect(
      access(join(repo, ".rubric/rules/testing.required-for-auth-change.yaml"))
    ).resolves.toBeUndefined();
  });

  it("exits 2 with a helpful error for unknown packs", async () => {
    const repo = await createGitRepo();

    const result = await runRubric(["add-pack", "unknown", "--cwd", repo]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Unknown built-in pack");
    expect(result.stderr).toContain("testing");
  });

  it("does not write files during dry runs", async () => {
    const repo = await createGitRepo();

    const result = await runRubric([
      "add-pack",
      "testing",
      "--cwd",
      repo,
      "--dry-run"
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dry run. No files were written.");
    await expect(
      access(join(repo, ".rubric/rules/testing.required-for-api-change.yaml"))
    ).rejects.toThrow();
  });

  it("makes rubric check fail for an API change without tests", async () => {
    const repo = await createApiChangeRepo({ includeTest: false });

    await expect(
      runRubric(["add-pack", "testing", "--cwd", repo])
    ).resolves.toMatchObject({ exitCode: 0 });

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

  it("lets rubric check pass when an API change includes tests", async () => {
    const repo = await createApiChangeRepo({ includeTest: true });

    await expect(
      runRubric(["add-pack", "testing", "--cwd", repo])
    ).resolves.toMatchObject({ exitCode: 0 });

    const result = await runRubric([
      "check",
      "--cwd",
      repo,
      "--base",
      "master"
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Findings: 0");
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

async function createApiChangeRepo({
  includeTest
}: {
  includeTest: boolean;
}): Promise<string> {
  const repo = await createGitRepo();

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

async function createGitRepo(): Promise<string> {
  const repo = await realpath(
    await mkdtemp(join(tmpdir(), "rubric-add-pack-"))
  );
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
