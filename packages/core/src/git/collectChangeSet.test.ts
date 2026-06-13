import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { RubricError } from "../errors/RubricError.js";
import {
  collectChangeSet,
  collectNameStatus,
  collectNumstat,
  collectPatch,
  findGitRoot,
  getMergeBase
} from "./index.js";

const execFileAsync = promisify(execFile);

const tempRepos: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRepos
      .splice(0)
      .map((repoPath) => rm(repoPath, { force: true, recursive: true }))
  );
});

describe("git diff collection", () => {
  it("throws RubricError with a helpful message outside a git repo", async () => {
    const directory = await makeTempDirectory();

    await expect(findGitRoot(directory)).rejects.toThrow(RubricError);
    await expect(findGitRoot(directory)).rejects.toThrow(
      "Not inside a git repository"
    );
  });

  it("throws RubricError with base/head context when merge-base fails", async () => {
    const repo = await createBaseRepo();

    await expect(
      getMergeBase({
        repoRoot: repo,
        baseRef: "missing-base",
        headRef: "HEAD"
      })
    ).rejects.toThrow(RubricError);
    await expect(
      getMergeBase({
        repoRoot: repo,
        baseRef: "missing-base",
        headRef: "HEAD"
      })
    ).rejects.toThrow("missing-base");
  });

  it("collects changed files, stats, patch, and metadata from a temp repo", async () => {
    const repo = await createChangedRepo();
    const mergeBase = await getMergeBase({
      repoRoot: repo,
      baseRef: "master",
      headRef: "HEAD"
    });

    const nameStatusFiles = await collectNameStatus({
      repoRoot: repo,
      mergeBase,
      headRef: "HEAD"
    });
    const numstat = await collectNumstat({
      repoRoot: repo,
      mergeBase,
      headRef: "HEAD"
    });
    const patch = await collectPatch({
      repoRoot: repo,
      mergeBase,
      headRef: "HEAD"
    });
    const changeSet = await collectChangeSet({
      repoRoot: repo,
      baseRef: "master",
      headRef: "HEAD"
    });

    expect(await findGitRoot(join(repo, "src", "api"))).toBe(repo);
    expect(nameStatusFiles.map((file) => file.path)).toEqual([
      "assets/logo.bin",
      "build/output.js",
      "src/api/posts.ts",
      "src/api/users.ts",
      "src/delete-me.ts",
      "src/new-name.ts",
      "tests/users.test.ts"
    ]);
    expect(
      nameStatusFiles.find((file) => file.path === "src/new-name.ts")
    ).toMatchObject({
      oldPath: "src/old-name.ts",
      status: "renamed"
    });
    expect(
      nameStatusFiles.find((file) => file.path === "src/delete-me.ts")
    ).toMatchObject({
      status: "deleted"
    });

    expect(numstat.get("src/api/users.ts")).toMatchObject({
      additions: 1,
      deletions: 1,
      isBinary: false
    });
    expect(numstat.get("assets/logo.bin")).toMatchObject({
      additions: 0,
      deletions: 0,
      isBinary: true
    });
    expect(patch).toContain("diff --git a/src/api/users.ts b/src/api/users.ts");

    expect(changeSet).toMatchObject({
      baseRef: "master",
      headRef: "HEAD",
      mergeBase
    });
    expect(changeSet.files.map((file) => file.path)).toEqual([
      "assets/logo.bin",
      "build/output.js",
      "src/api/posts.ts",
      "src/api/users.ts",
      "src/delete-me.ts",
      "src/new-name.ts",
      "tests/users.test.ts"
    ]);
    expect(
      changeSet.files.find((file) => file.path === "tests/users.test.ts")
    ).toMatchObject({
      directory: "tests",
      extension: ".ts",
      isTest: true
    });
    expect(
      changeSet.files.find((file) => file.path === "build/output.js")
    ).toMatchObject({
      isGenerated: true
    });
    expect(
      changeSet.files.find((file) => file.path === "assets/logo.bin")
    ).toMatchObject({
      extension: ".bin",
      isBinary: true
    });
    expect(changeSet.stats).toEqual({
      filesChanged: 7,
      additions: 4,
      deletions: 2,
      directoriesChanged: 5
    });
  });
});

async function createBaseRepo(): Promise<string> {
  const repo = await makeTempDirectory();

  await git(repo, ["init", "--initial-branch=master"]);
  await git(repo, ["config", "user.email", "rubric@example.com"]);
  await git(repo, ["config", "user.name", "Rubric Test"]);
  await write(repo, "src/api/users.ts", "export const user = 'old';\n");
  await write(repo, "src/delete-me.ts", "export const deleted = true;\n");
  await write(repo, "src/old-name.ts", "export const renamed = true;\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "initial"]);

  return repo;
}

async function createChangedRepo(): Promise<string> {
  const repo = await createBaseRepo();

  await git(repo, ["checkout", "-b", "feature"]);
  await write(repo, "src/api/users.ts", "export const user = 'new';\n");
  await write(repo, "src/api/posts.ts", "export const post = true;\n");
  await unlink(join(repo, "src", "delete-me.ts"));
  await rename(
    join(repo, "src", "old-name.ts"),
    join(repo, "src", "new-name.ts")
  );
  await write(repo, "tests/users.test.ts", "test('user', () => undefined);\n");
  await write(repo, "build/output.js", "export const generated = true;\n");
  await write(repo, "assets/logo.bin", Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
  await git(repo, ["add", "-A"]);
  await git(repo, ["commit", "-m", "feature changes"]);

  return repo;
}

async function makeTempDirectory(): Promise<string> {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "rubric-git-"))
  );
  tempRepos.push(directory);
  return directory;
}

async function write(
  repo: string,
  path: string,
  contents: string | Buffer
): Promise<void> {
  const filePath = join(repo, path);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}
