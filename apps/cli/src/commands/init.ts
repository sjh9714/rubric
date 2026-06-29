import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import type { Command } from "commander";
import { findGitRoot, RubricError } from "@rubric-dev/core";
import {
  copyBuiltInPackRules,
  listBuiltInPacks,
  type CopiedRule
} from "@rubric-dev/packs";

import { handleCliError } from "../errors/handleCliError.js";

const defaultPacks = ["base", "security"];

const starterConfig = template([
  "version: 1",
  "",
  "project:",
  "  name: null",
  "  default_base: main",
  "  package_manager: null",
  "",
  "modes:",
  "  check:",
  "    fail_on:",
  "      - error",
  "    warn_on:",
  "      - warning",
  "      - info",
  "",
  "compile:",
  "  targets:",
  "    - agents",
  "    - claude",
  "    - copilot",
  "    - cursor",
  "    - pr_template",
  "  managed_header: true",
  "",
  "privacy:",
  "  send_code_to_llm: false",
  "  send_review_comments_to_llm: false",
  "  redact_secrets: true",
  "",
  "output:",
  "  format: text",
  "  max_findings: 20"
]);

const starterWorkflow = template([
  "name: Rubric",
  "",
  "on:",
  "  pull_request:",
  "    types: [opened, synchronize, reopened, edited]",
  "",
  "permissions:",
  "  contents: read",
  "  pull-requests: read",
  "",
  "jobs:",
  "  rubric:",
  "    runs-on: ubuntu-24.04",
  "    steps:",
  "      - uses: actions/checkout@v6",
  "        with:",
  "          fetch-depth: 0",
  "",
  "      - uses: actions/setup-node@v6",
  "        with:",
  "          node-version: 20",
  "",
  "      - run: npx --yes --package @rubric-dev/cli rubric check --base origin/${{ github.base_ref }} --format markdown",
  "        env:",
  "          RUBRIC_PR_TITLE: ${{ github.event.pull_request.title }}",
  "          RUBRIC_PR_BODY: ${{ github.event.pull_request.body }}"
]);

const starterCommentWorkflow = template([
  "name: Rubric",
  "",
  "on:",
  "  pull_request:",
  "    types: [opened, synchronize, reopened, edited]",
  "",
  "permissions:",
  "  contents: read",
  "  pull-requests: write",
  "  issues: write",
  "",
  "jobs:",
  "  rubric:",
  "    runs-on: ubuntu-24.04",
  "    steps:",
  "      - uses: actions/checkout@v6",
  "        with:",
  "          fetch-depth: 0",
  "",
  "      - uses: sjh9714/rubric/packages/action@v0.3.1",
  "        with:",
  "          base: origin/${{ github.base_ref }}",
  "          github-token: ${{ secrets.GITHUB_TOKEN }}"
]);

const starterPullRequestTemplate = template([
  "## Summary",
  "",
  "## Verification",
  "",
  "Commands run:",
  "",
  "```text",
  "```",
  "",
  "## Rubric exceptions",
  "",
  "List any intentional rubric rule exceptions and why."
]);

const rubricGitignoreBlock = template([
  "# Rubric local cache",
  ".rubric/cache/"
]);

export interface InitCommandOptions {
  cwd?: string;
  packs?: string[];
  githubComment?: boolean;
  force?: boolean;
  dryRun?: boolean;
  debug?: boolean;
}

export interface InitCommandContext {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

interface InitFileAction {
  path: string;
  status: "created" | "updated" | "overwritten" | "skipped";
}

interface InitResult {
  dryRun: boolean;
  files: InitFileAction[];
  githubComment: boolean;
  rules: CopiedRule[];
  repoRoot: string;
}

export function addInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create a starter Rubric setup in this repository.")
    .option("--cwd <dir>", "working directory to initialize")
    .option("--packs <packs...>", "built-in packs to install")
    .option(
      "--github-comment",
      "generate a GitHub Action workflow that comments on pull requests"
    )
    .option("--force", "overwrite existing Rubric target files")
    .option("--dry-run", "show what would be created without writing files")
    .option("--debug", "print stack traces for unexpected errors")
    .action(async (options: InitCommandOptions) => {
      const exitCode = await runInitCommand(options);
      process.exitCode = exitCode;
    });
}

export async function runInitCommand(
  options: InitCommandOptions,
  { stdout = process.stdout, stderr = process.stderr }: InitCommandContext = {}
): Promise<0 | 2 | 3> {
  try {
    const cwd = resolve(options.cwd ?? process.cwd());
    const repoRoot = await findGitRoot(cwd);
    const packNames = normalizePackNames(options.packs);

    await assertKnownPacks(packNames);

    const result = await initRubric({
      repoRoot,
      packNames,
      githubComment: options.githubComment === true,
      force: options.force === true,
      dryRun: options.dryRun === true
    });

    stdout.write(renderInitResult(result));
    stdout.write("\n");
    return 0;
  } catch (error) {
    return handleCliError(error, {
      debug: options.debug,
      stderr
    });
  }
}

async function initRubric({
  repoRoot,
  packNames,
  githubComment,
  force,
  dryRun
}: {
  repoRoot: string;
  packNames: string[];
  githubComment: boolean;
  force: boolean;
  dryRun: boolean;
}): Promise<InitResult> {
  const files: InitFileAction[] = [];

  files.push(
    await writeTargetFile({
      repoRoot,
      path: ".rubric/config.yaml",
      contents: starterConfig,
      force,
      dryRun
    })
  );

  const rules = await copyBuiltInPackRules({
    repoRoot,
    packNames,
    force,
    dryRun
  });

  files.push(await ensureRubricGitignoreEntry({ repoRoot, dryRun }));

  files.push(
    await writeTargetFile({
      repoRoot,
      path: ".github/workflows/rubric.yml",
      contents: githubComment ? starterCommentWorkflow : starterWorkflow,
      force,
      dryRun
    })
  );

  files.push(
    await writeTargetFile({
      repoRoot,
      path: ".github/pull_request_template.md",
      contents: starterPullRequestTemplate,
      force,
      dryRun
    })
  );

  return {
    dryRun,
    files,
    githubComment,
    rules: rules.copied,
    repoRoot
  };
}

async function writeTargetFile({
  repoRoot,
  path,
  contents,
  force,
  dryRun
}: {
  repoRoot: string;
  path: string;
  contents: string;
  force: boolean;
  dryRun: boolean;
}): Promise<InitFileAction> {
  const targetPath = join(repoRoot, path);
  const targetExists = await pathExists(targetPath);
  const status = targetExists ? (force ? "overwritten" : "skipped") : "created";

  if (!dryRun && status !== "skipped") {
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, contents);
  }

  return { path, status };
}

async function ensureRubricGitignoreEntry({
  repoRoot,
  dryRun
}: {
  repoRoot: string;
  dryRun: boolean;
}): Promise<InitFileAction> {
  const path = ".gitignore";
  const targetPath = join(repoRoot, path);
  const current = (await pathExists(targetPath))
    ? await readFile(targetPath, "utf8")
    : "";

  if (hasRubricCacheEntry(current)) {
    return { path, status: "skipped" };
  }

  if (!dryRun) {
    await writeFile(targetPath, appendGitignoreBlock(current));
  }

  return { path, status: "updated" };
}

function appendGitignoreBlock(contents: string): string {
  if (contents.length === 0) {
    return rubricGitignoreBlock;
  }

  const separator = contents.endsWith("\n")
    ? contents.endsWith("\n\n")
      ? ""
      : "\n"
    : "\n\n";

  return `${contents}${separator}${rubricGitignoreBlock}`;
}

function hasRubricCacheEntry(contents: string): boolean {
  return contents
    .split(/\r?\n/)
    .some((line) => line.trim() === ".rubric/cache/");
}

async function assertKnownPacks(packNames: string[]): Promise<void> {
  const availablePacks = await listBuiltInPacks();
  const availableNames = availablePacks.map((pack) => pack.name);
  const availableNameSet = new Set(availableNames);
  const unknownPack = packNames.find(
    (packName) => !availableNameSet.has(packName)
  );

  if (unknownPack !== undefined) {
    throw new RubricError(
      `Unknown built-in pack "${unknownPack}". Available packs: ${availableNames.join(", ")}`
    );
  }
}

function normalizePackNames(packNames: string[] | undefined): string[] {
  return [...new Set(packNames === undefined ? defaultPacks : packNames)];
}

function renderInitResult({
  dryRun,
  files,
  githubComment,
  rules,
  repoRoot
}: InitResult): string {
  const entries = [
    ...files,
    ...rules.map((rule) => ({
      path: relative(repoRoot, rule.targetPath).replaceAll("\\", "/"),
      status: rule.status
    }))
  ];
  const lines = ["Rubric init", ""];

  if (dryRun) {
    lines.push("Dry run. No files were written.", "");
  }

  lines.push(
    `GitHub Action comment mode: ${githubComment ? "enabled" : "disabled"}`,
    ""
  );

  pushGroup(
    lines,
    "Created",
    entries.filter((entry) => entry.status === "created")
  );
  pushGroup(
    lines,
    "Updated",
    entries.filter(
      (entry) => entry.status === "updated" || entry.status === "overwritten"
    )
  );
  pushGroup(
    lines,
    "Skipped",
    entries.filter((entry) => entry.status === "skipped")
  );

  lines.push(
    "",
    "Next:",
    "  1. Edit .rubric/rules to capture one repeated team review comment.",
    "  2. Run rubric compile to publish it to agent and PR instructions.",
    "  3. Run rubric check --base main before your next PR."
  );

  return lines.join("\n");
}

function pushGroup(
  lines: string[],
  label: string,
  entries: InitFileAction[]
): void {
  lines.push(`${label}:`);

  if (entries.length === 0) {
    lines.push("  none");
    return;
  }

  for (const entry of entries) {
    lines.push(`  ${entry.status} ${entry.path}`);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function template(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}
