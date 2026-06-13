import { extname, posix } from "node:path";

import { RubricError } from "../errors/RubricError.js";
import { runGit } from "./runGit.js";
import type {
  ChangedFile,
  ChangedFileStatus,
  ChangeSet,
  ChangeStats,
  FileStat
} from "./types.js";

export interface FindGitRootOptions {
  startDir: string;
}

export interface MergeBaseOptions {
  repoRoot: string;
  baseRef: string;
  headRef?: string;
}

export interface DiffOptions {
  repoRoot: string;
  mergeBase: string;
  headRef?: string;
}

export interface CollectChangeSetOptions {
  repoRoot: string;
  baseRef: string;
  headRef?: string;
}

export async function findGitRoot(startDir: string): Promise<string> {
  try {
    return normalizePath(
      await runGit({
        cwd: startDir,
        args: ["rev-parse", "--show-toplevel"]
      })
    );
  } catch (error) {
    throw new RubricError(`Not inside a git repository: ${startDir}`, {
      cause: error
    });
  }
}

export async function getMergeBase({
  repoRoot,
  baseRef,
  headRef = "HEAD"
}: MergeBaseOptions): Promise<string> {
  try {
    return await runGit({
      cwd: repoRoot,
      args: ["merge-base", baseRef, headRef]
    });
  } catch (error) {
    throw new RubricError(
      `Unable to find git merge-base for base "${baseRef}" and head "${headRef}" in ${repoRoot}`,
      { cause: error }
    );
  }
}

export async function collectNameStatus({
  repoRoot,
  mergeBase,
  headRef = "HEAD"
}: DiffOptions): Promise<ChangedFile[]> {
  const output = await runGit({
    cwd: repoRoot,
    args: ["diff", "--name-status", `${mergeBase}...${headRef}`]
  });

  return output
    .split("\n")
    .filter(Boolean)
    .map(parseNameStatusLine)
    .sort(compareChangedFiles);
}

export async function collectNumstat({
  repoRoot,
  mergeBase,
  headRef = "HEAD"
}: DiffOptions): Promise<Map<string, FileStat>> {
  const output = await runGit({
    cwd: repoRoot,
    args: ["diff", "--numstat", `${mergeBase}...${headRef}`]
  });
  const stats = new Map<string, FileStat>();

  for (const line of output.split("\n").filter(Boolean)) {
    const [additionsRaw, deletionsRaw, ...pathParts] = line.split("\t");
    const path = normalizeNumstatPath(pathParts.join("\t"));
    const isBinary = additionsRaw === "-" || deletionsRaw === "-";

    stats.set(path, {
      path,
      additions: isBinary ? 0 : Number(additionsRaw),
      deletions: isBinary ? 0 : Number(deletionsRaw),
      isBinary
    });
  }

  return stats;
}

export async function collectPatch({
  repoRoot,
  mergeBase,
  headRef = "HEAD"
}: DiffOptions): Promise<string> {
  return runGit({
    cwd: repoRoot,
    args: ["diff", "--unified=0", `${mergeBase}...${headRef}`]
  });
}

export async function collectChangeSet({
  repoRoot,
  baseRef,
  headRef = "HEAD"
}: CollectChangeSetOptions): Promise<ChangeSet> {
  const mergeBase = await getMergeBase({ repoRoot, baseRef, headRef });
  const [files, numstat, patch] = await Promise.all([
    collectNameStatus({ repoRoot, mergeBase, headRef }),
    collectNumstat({ repoRoot, mergeBase, headRef }),
    collectPatch({ repoRoot, mergeBase, headRef })
  ]);
  const enrichedFiles = files.map((file) => {
    const stat = numstat.get(file.path);

    return {
      ...file,
      additions: stat?.additions ?? 0,
      deletions: stat?.deletions ?? 0,
      isBinary: stat?.isBinary ?? false
    };
  });

  return {
    baseRef,
    headRef,
    mergeBase,
    files: enrichedFiles,
    stats: summarizeChanges(enrichedFiles),
    patch
  };
}

function parseNameStatusLine(line: string): ChangedFile {
  const [statusRaw, firstPath, secondPath] = line.split("\t");
  const status = parseStatus(statusRaw);
  const path = normalizePath(secondPath ?? firstPath ?? "");
  const oldPath =
    status === "renamed" || status === "copied"
      ? normalizePath(firstPath ?? "")
      : undefined;

  return createChangedFile({
    path,
    oldPath,
    status
  });
}

function createChangedFile({
  path,
  oldPath,
  status
}: {
  path: string;
  oldPath?: string;
  status: ChangedFileStatus;
}): ChangedFile {
  const directory = posix.dirname(path);

  return {
    path,
    oldPath,
    status,
    additions: 0,
    deletions: 0,
    extension: extname(path),
    directory: directory === "." ? "" : directory,
    isTest: isTestPath(path),
    isGenerated: isGeneratedPath(path),
    isBinary: false
  };
}

function parseStatus(statusRaw = ""): ChangedFileStatus {
  switch (statusRaw[0]) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    default:
      throw new RubricError(`Unsupported git name-status value: ${statusRaw}`);
  }
}

function summarizeChanges(files: ChangedFile[]): ChangeStats {
  return {
    filesChanged: files.length,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    directoriesChanged: new Set(files.map((file) => file.directory)).size
  };
}

function isTestPath(path: string): boolean {
  const fileName = posix.basename(path);

  return (
    fileName.includes(".test.") ||
    fileName.includes(".spec.") ||
    path.startsWith("test/") ||
    path.startsWith("tests/") ||
    path.includes("/__tests__/") ||
    path.startsWith("__tests__/")
  );
}

function isGeneratedPath(path: string): boolean {
  const fileName = posix.basename(path);

  return (
    path.startsWith("dist/") ||
    path.startsWith("build/") ||
    path.startsWith("coverage/") ||
    fileName.endsWith(".lock")
  );
}

function normalizeNumstatPath(path: string): string {
  const normalizedPath = normalizePath(path);
  const braceRename = /^(.*)\{(.+) => (.+)\}(.*)$/.exec(normalizedPath);

  if (braceRename !== null) {
    return `${braceRename[1]}${braceRename[3]}${braceRename[4]}`;
  }

  const plainRename = /^(.*) => (.*)$/.exec(normalizedPath);

  if (plainRename !== null) {
    return plainRename[2] ?? normalizedPath;
  }

  return normalizedPath;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function compareChangedFiles(left: ChangedFile, right: ChangedFile): number {
  return left.path.localeCompare(right.path);
}
