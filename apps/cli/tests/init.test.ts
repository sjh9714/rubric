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
import { loadConfig } from "@rubric-dev/core";

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

describe("rubric init", () => {
  it("creates a starter config", async () => {
    const repo = await createGitRepo();

    const result = await runRubric(["init", "--cwd", repo]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Created:");
    await expect(
      access(join(repo, ".rubric/config.yaml"))
    ).resolves.toBeUndefined();
    const configYaml = await read(repo, ".rubric/config.yaml");
    const config = await loadConfig(repo);

    expect(configYaml).toContain("project:\n  name: null");
    expect(configYaml).toContain("modes:\n  check:");
    expect(configYaml).toContain("fail_on:\n      - error");
    expect(config.project.default_base).toBe("main");
    expect(config.output.format).toBe("text");
    expect(config.compile.targets).toContain("agents");
  });

  it("installs base and security packs by default", async () => {
    const repo = await createGitRepo();

    const result = await runRubric(["init", "--cwd", repo]);

    expect(result.exitCode).toBe(0);
    await expect(
      access(join(repo, ".rubric/rules/pr.too-broad.yaml"))
    ).resolves.toBeUndefined();
    await expect(
      access(join(repo, ".rubric/rules/security.no-secret-like-patterns.yaml"))
    ).resolves.toBeUndefined();
    await expect(
      access(join(repo, ".rubric/rules/testing.required-for-api-change.yaml"))
    ).rejects.toThrow();
  });

  it("installs only selected packs when --packs is provided", async () => {
    const repo = await createGitRepo();

    const result = await runRubric([
      "init",
      "--packs",
      "testing",
      "migrations",
      "--cwd",
      repo
    ]);

    expect(result.exitCode).toBe(0);
    await expect(
      access(join(repo, ".rubric/rules/testing.required-for-api-change.yaml"))
    ).resolves.toBeUndefined();
    await expect(
      access(join(repo, ".rubric/rules/db.migration-rollback-note.yaml"))
    ).resolves.toBeUndefined();
    await expect(
      access(join(repo, ".rubric/rules/security.no-secret-like-patterns.yaml"))
    ).rejects.toThrow();
  });

  it("writes nothing during dry runs", async () => {
    const repo = await createGitRepo();

    const result = await runRubric(["init", "--cwd", repo, "--dry-run"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dry run. No files were written.");
    await expect(access(join(repo, ".rubric"))).rejects.toThrow();
    await expect(access(join(repo, ".github"))).rejects.toThrow();
    await expect(access(join(repo, ".gitignore"))).rejects.toThrow();
  });

  it("reports the GitHub comment workflow during dry runs", async () => {
    const repo = await createGitRepo();

    const result = await runRubric([
      "init",
      "--cwd",
      repo,
      "--github-comment",
      "--dry-run"
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dry run. No files were written.");
    expect(result.stdout).toContain("GitHub Action comment mode: enabled");
    expect(result.stdout).toContain("created .github/workflows/rubric.yml");
    await expect(access(join(repo, ".github"))).rejects.toThrow();
  });

  it("skips existing config, workflow, and PR template by default", async () => {
    const repo = await createGitRepo();
    await write(repo, ".rubric/config.yaml", "version: old\n");
    await write(repo, ".github/workflows/rubric.yml", "name: Existing\n");
    await write(
      repo,
      ".github/pull_request_template.md",
      "Existing template\n"
    );

    const result = await runRubric(["init", "--cwd", repo]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("skipped .rubric/config.yaml");
    await expect(read(repo, ".rubric/config.yaml")).resolves.toBe(
      "version: old\n"
    );
    await expect(read(repo, ".github/workflows/rubric.yml")).resolves.toBe(
      "name: Existing\n"
    );
    await expect(read(repo, ".github/pull_request_template.md")).resolves.toBe(
      "Existing template\n"
    );
  });

  it("overwrites Rubric target files with --force", async () => {
    const repo = await createGitRepo();
    await write(repo, ".rubric/config.yaml", "version: old\n");
    await write(repo, ".github/workflows/rubric.yml", "name: Existing\n");
    await write(
      repo,
      ".github/pull_request_template.md",
      "Existing template\n"
    );
    await write(
      repo,
      ".rubric/rules/security.no-secret-like-patterns.yaml",
      "stale rule\n"
    );

    const result = await runRubric(["init", "--cwd", repo, "--force"]);

    expect(result.exitCode).toBe(0);
    await expect(read(repo, ".rubric/config.yaml")).resolves.toContain(
      "version: 1"
    );
    await expect(read(repo, ".github/workflows/rubric.yml")).resolves.toContain(
      "npx --yes --package @rubric-dev/cli rubric check"
    );
    await expect(
      read(repo, ".github/pull_request_template.md")
    ).resolves.toContain("Rubric exceptions");
    await expect(
      read(repo, ".rubric/rules/security.no-secret-like-patterns.yaml")
    ).resolves.toContain("security.no-secret-like-patterns");
  });

  it("adds the Rubric cache gitignore entry exactly once", async () => {
    const repo = await createGitRepo();

    await expect(runRubric(["init", "--cwd", repo])).resolves.toMatchObject({
      exitCode: 0
    });
    await expect(runRubric(["init", "--cwd", repo])).resolves.toMatchObject({
      exitCode: 0
    });
    const gitignore = await read(repo, ".gitignore");

    expect(countOccurrences(gitignore, ".rubric/cache/")).toBe(1);
    expect(countOccurrences(gitignore, "# Rubric local cache")).toBe(1);
  });

  it("creates a GitHub workflow", async () => {
    const repo = await createGitRepo();

    await expect(runRubric(["init", "--cwd", repo])).resolves.toMatchObject({
      exitCode: 0
    });

    const workflow = await read(repo, ".github/workflows/rubric.yml");

    expect(workflow).toContain("on:\n  pull_request:");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("jobs:\n  rubric:");
    expect(workflow).toContain("steps:\n      - uses: actions/checkout@v6");
    expect(workflow).toContain("env:\n          RUBRIC_PR_TITLE:");
    expect(workflow).toContain(
      "npx --yes --package @rubric-dev/cli rubric check --base origin/${{ github.base_ref }} --format markdown"
    );
    expect(workflow).not.toContain("pull-requests: write");
    expect(workflow).not.toContain("issues: write");
    expect(workflow).not.toContain("sjh9714/rubric/packages/action@v0.2.0");
  });

  it("creates an opt-in GitHub Action comment workflow", async () => {
    const repo = await createGitRepo();

    await expect(
      runRubric(["init", "--cwd", repo, "--github-comment"])
    ).resolves.toMatchObject({
      exitCode: 0
    });

    const workflow = await read(repo, ".github/workflows/rubric.yml");

    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("pull-requests: write");
    expect(workflow).toContain("issues: write");
    expect(workflow).toContain("uses: sjh9714/rubric/packages/action@v0.2.0");
    expect(workflow).toContain("base: origin/${{ github.base_ref }}");
    expect(workflow).toContain("github-token: ${{ secrets.GITHUB_TOKEN }}");
  });

  it("overwrites the workflow with comment mode when forced", async () => {
    const repo = await createGitRepo();
    await write(repo, ".github/workflows/rubric.yml", "name: Existing\n");

    const result = await runRubric([
      "init",
      "--cwd",
      repo,
      "--github-comment",
      "--force"
    ]);

    expect(result.exitCode).toBe(0);
    await expect(read(repo, ".github/workflows/rubric.yml")).resolves.toContain(
      "uses: sjh9714/rubric/packages/action@v0.2.0"
    );
  });

  it("creates a PR template", async () => {
    const repo = await createGitRepo();

    await expect(runRubric(["init", "--cwd", repo])).resolves.toMatchObject({
      exitCode: 0
    });

    const template = await read(repo, ".github/pull_request_template.md");

    expect(template).toContain("## Summary\n\n## Verification");
    expect(template).toContain("Commands run:\n\n```text\n```");
    expect(template).toContain("## Rubric exceptions");
  });

  it("makes rubric check fail for an API change without tests after init installs testing", async () => {
    const repo = await createGitRepo();

    await expect(
      runRubric(["init", "--packs", "testing", "--cwd", repo])
    ).resolves.toMatchObject({ exitCode: 0 });
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "add rubric"]);
    await git(repo, ["checkout", "-b", "feature"]);
    await write(repo, "src/api/users.ts", "export const user = 'new';\n");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "feature changes"]);

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

async function createGitRepo(): Promise<string> {
  const repo = await realpath(await mkdtemp(join(tmpdir(), "rubric-init-")));
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

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}
