import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  RubricError,
  type RubricConfig,
  type RubricRule
} from "@rubric-dev/core";

import { upsertManagedBlock } from "./managedBlock.js";
import { renderRulesMarkdown } from "./renderRuleMarkdown.js";

export type CompileTarget =
  | "agents"
  | "claude"
  | "copilot"
  | "cursor"
  | "pr_template";

export interface CompileRulesOptions {
  repoRoot: string;
  rules: RubricRule[];
  config: RubricConfig;
  targets?: CompileTarget[];
  dryRun?: boolean;
}

export type CompiledFileStatus =
  | "created"
  | "updated"
  | "unchanged"
  | "would_create"
  | "would_update";

export interface CompiledFileResult {
  path: string;
  status: CompiledFileStatus;
}

export interface CompileResult {
  files: CompiledFileResult[];
  rulesCount: number;
  targets: CompileTarget[];
}

const supportedTargets = [
  "agents",
  "claude",
  "copilot",
  "cursor",
  "pr_template"
] as const satisfies CompileTarget[];

type ConfigCompileTarget = RubricConfig["compile"]["targets"][number];

interface TargetFile {
  path: string;
  managedContents: string;
  baseContents?: string;
}

export async function compileRules({
  repoRoot,
  rules,
  config,
  targets,
  dryRun = false
}: CompileRulesOptions): Promise<CompileResult> {
  const resolvedTargets = resolveTargets(targets ?? config.compile.targets);

  if (rules.length === 0) {
    return {
      files: [],
      rulesCount: 0,
      targets: resolvedTargets
    };
  }

  const sortedRules = [...rules].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  const files: CompiledFileResult[] = [];

  for (const target of resolvedTargets) {
    const targetRules = sortedRules.filter((rule) => ruleTargets(rule, target));

    if (targetRules.length === 0) {
      continue;
    }

    for (const targetFile of renderTargetFiles(target, targetRules)) {
      files.push(
        await compileTargetFile({
          repoRoot,
          targetFile,
          dryRun
        })
      );
    }
  }

  return {
    files,
    rulesCount: rules.length,
    targets: resolvedTargets
  };
}

function resolveTargets(
  requestedTargets: readonly (CompileTarget | ConfigCompileTarget)[]
): CompileTarget[] {
  const rawTargets =
    requestedTargets.length === 0 ? supportedTargets : requestedTargets;
  const targets: CompileTarget[] = [];

  for (const target of rawTargets) {
    if (!isCompileTarget(target)) {
      throw new RubricError(
        `Unsupported compile target "${target}". Supported targets: ${supportedTargets.join(", ")}`
      );
    }

    if (!targets.includes(target)) {
      targets.push(target);
    }
  }

  return targets;
}

function isCompileTarget(target: string): target is CompileTarget {
  return supportedTargets.includes(target as CompileTarget);
}

function ruleTargets(rule: RubricRule, target: CompileTarget): boolean {
  const targets =
    rule.compile.targets.length > 0 ? rule.compile.targets : ["agents"];
  return targets.includes(target);
}

function renderTargetFiles(
  target: CompileTarget,
  rules: RubricRule[]
): TargetFile[] {
  switch (target) {
    case "agents":
      return [
        {
          path: "AGENTS.md",
          managedContents: renderAgents(rules)
        }
      ];
    case "claude":
      return [
        {
          path: "CLAUDE.md",
          baseContents: "@AGENTS.md\n\n",
          managedContents: renderClaude(rules)
        }
      ];
    case "copilot":
      return [
        {
          path: ".github/copilot-instructions.md",
          managedContents: renderCopilot(rules)
        },
        {
          path: ".github/instructions/rubric.instructions.md",
          baseContents: '---\napplyTo: "**"\n---\n\n',
          managedContents: renderGitHubInstructions(rules)
        }
      ];
    case "cursor":
      return [
        {
          path: ".cursor/rules/rubric.mdc",
          baseContents:
            "---\ndescription: Rubric-generated team review rules\nalwaysApply: true\n---\n\n",
          managedContents: renderCursor(rules)
        }
      ];
    case "pr_template":
      return [
        {
          path: ".github/pull_request_template.md",
          managedContents: renderPullRequestTemplate(rules)
        }
      ];
  }
}

async function compileTargetFile({
  repoRoot,
  targetFile,
  dryRun
}: {
  repoRoot: string;
  targetFile: TargetFile;
  dryRun: boolean;
}): Promise<CompiledFileResult> {
  const filePath = join(repoRoot, ...targetFile.path.split("/"));
  const existingContents = await readFileIfExists(filePath);
  const currentContents = existingContents ?? targetFile.baseContents ?? "";
  const nextContents = upsertManagedBlock(
    currentContents,
    targetFile.managedContents,
    {
      path: targetFile.path
    }
  );

  if (existingContents === nextContents) {
    return {
      path: targetFile.path,
      status: "unchanged"
    };
  }

  const status =
    existingContents === undefined
      ? dryRun
        ? "would_create"
        : "created"
      : dryRun
        ? "would_update"
        : "updated";

  if (!dryRun) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, nextContents);
  }

  return {
    path: targetFile.path,
    status
  };
}

async function readFileIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new RubricError(`Unable to read ${path}: ${message}`);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function renderAgents(rules: RubricRule[]): string {
  return [
    "## Rubric-generated team review rules",
    "",
    "This section is generated from `.rubric/rules`.",
    "Run `rubric compile` to update it.",
    "",
    "Before opening a PR, run:",
    "",
    "```bash",
    "rubric check --base main",
    "```",
    "",
    renderRulesMarkdown(rules).trimEnd()
  ].join("\n");
}

function renderClaude(rules: RubricRule[]): string {
  return [
    "## Claude Code notes",
    "",
    "Follow the Rubric-generated team review rules in `AGENTS.md`.",
    "",
    "Before finalizing a change:",
    "1. Run `rubric check --base main` when available.",
    "2. If a rule is intentionally violated, explain why in the PR notes.",
    "3. For auth, billing, permissions, migrations, or secrets, summarize risks before final response.",
    "",
    renderRulesMarkdown(rules).trimEnd()
  ].join("\n");
}

function renderCopilot(rules: RubricRule[]): string {
  return [
    "# Rubric-generated Copilot instructions",
    "",
    "Follow the rules generated from `.rubric/rules`.",
    "",
    "Before suggesting code:",
    "- Keep PRs focused.",
    "- Add tests when changing API, auth, permissions, or domain behavior.",
    "- Document verification commands in the PR description.",
    "- Run `rubric check --base main` when available.",
    "",
    "See `AGENTS.md` for the full team review rubric.",
    "",
    renderRulesMarkdown(rules).trimEnd()
  ].join("\n");
}

function renderGitHubInstructions(rules: RubricRule[]): string {
  return [
    "# Rubric-generated path instructions",
    "",
    "Apply these Rubric rules while reviewing or generating code.",
    "",
    renderRulesMarkdown(rules).trimEnd()
  ].join("\n");
}

function renderCursor(rules: RubricRule[]): string {
  return [
    "# Rubric-generated team review rules",
    "",
    "Follow these rules before finalizing code changes.",
    "",
    renderRulesMarkdown(rules).trimEnd()
  ].join("\n");
}

function renderPullRequestTemplate(rules: RubricRule[]): string {
  return [
    "## Rubric",
    "",
    "Before requesting review:",
    "",
    "- [ ] I ran `rubric check --base main`",
    "- [ ] I documented commands run under Verification",
    "- [ ] I listed intentional Rubric exceptions, if any",
    "",
    "### Commands run",
    "",
    "```text",
    "```",
    "",
    "### Rubric exceptions",
    "",
    "None.",
    "",
    "### Rubric rules to consider",
    "",
    renderRulesMarkdown(rules).trimEnd()
  ].join("\n");
}
