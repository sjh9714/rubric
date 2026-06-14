import { execFile } from "node:child_process";
import { access, readFile, stat as readStat } from "node:fs/promises";
import { extname, posix, resolve } from "node:path";
import { promisify } from "node:util";

import type { Command } from "commander";
import {
  evaluateRules,
  findGitRoot,
  loadConfig,
  loadRules,
  RubricError,
  type ChangedFile,
  type ChangeSet,
  type RubricConfig,
  type RubricRule
} from "@rubric-dev/core";

import { handleCliError } from "../errors/handleCliError.js";

const execFileAsync = promisify(execFile);
const managedBlockBegin = "<!-- rubric:begin -->";
const managedBlockEnd = "<!-- rubric:end -->";
const supportedCompileTargets = [
  "agents",
  "claude",
  "copilot",
  "cursor",
  "pr_template"
] as const;
const suggestedFixOrder = [
  "rubric init",
  "rubric add-pack base security",
  "rubric add-pack testing migrations",
  "rubric compile"
];

export type DoctorStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  id: string;
  title: string;
  status: DoctorStatus;
  message: string;
  suggestion?: string;
  weight: number;
}

export interface DoctorReport {
  score: number;
  checks: DoctorCheck[];
  suggestedFixes: string[];
}

export interface DoctorCommandOptions {
  cwd?: string;
  format?: string;
  debug?: boolean;
}

export interface DoctorCommandContext {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

interface RepoFile {
  path: string;
  contents: string;
}

interface PackageJsonSummary {
  exists: boolean;
  scripts: string[];
  invalid: boolean;
}

export function addDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Inspect Rubric setup and AI-agent readiness.")
    .option("--cwd <dir>", "working directory to inspect")
    .option("--format <format>", "output format: text or json", "text")
    .option("--debug", "print stack traces for unexpected errors")
    .action(async (options: DoctorCommandOptions) => {
      const exitCode = await runDoctorCommand(options);
      process.exitCode = exitCode;
    });
}

export async function runDoctorCommand(
  options: DoctorCommandOptions,
  {
    stdout = process.stdout,
    stderr = process.stderr
  }: DoctorCommandContext = {}
): Promise<0 | 2 | 3> {
  try {
    const format = resolveDoctorFormat(options.format);
    const cwd = resolve(options.cwd ?? process.cwd());
    const repoRoot = await findGitRoot(cwd);
    const report = await collectDoctorReport(repoRoot);

    stdout.write(renderDoctorReport(report, format));
    stdout.write("\n");
    return 0;
  } catch (error) {
    return handleCliError(error, {
      debug: options.debug,
      stderr
    });
  }
}

async function collectDoctorReport(repoRoot: string): Promise<DoctorReport> {
  const configPath = ".rubric/config.yaml";
  const configExists = await fileExists(repoRoot, configPath);
  const config = await loadConfig(repoRoot);
  const rules = await loadRules(repoRoot);
  const packageManager = await detectPackageManager(repoRoot);
  const packageJson = await readPackageJsonSummary(repoRoot);
  const instructionFiles = await readInstructionFiles(repoRoot);
  const checks: DoctorCheck[] = [];

  checks.push(await checkGitStatus(repoRoot));
  checks.push({
    id: "config.exists",
    title: ".rubric/config.yaml found",
    status: configExists ? "pass" : "fail",
    message: configExists
      ? ".rubric/config.yaml exists and validates."
      : ".rubric/config.yaml is missing; defaults will be used.",
    suggestion: configExists ? undefined : "rubric init",
    weight: 10
  });
  checks.push({
    id: "rules.exists",
    title: "Rubric rules found",
    status: rules.length > 0 ? "pass" : "fail",
    message:
      rules.length > 0
        ? `${rules.length} rubric rule${rules.length === 1 ? "" : "s"} found.`
        : "No rubric rules found under .rubric/rules.",
    suggestion: rules.length > 0 ? undefined : "rubric init",
    weight: 15
  });
  checks.push(checkBaseSecurityCoverage(rules));
  checks.push(await checkRulesEvaluate(rules, config));
  checks.push(checkManagedFile("agents.managed", "AGENTS.md", 10));
  checks.push(checkClaude(instructionFiles.get("CLAUDE.md")));
  checks.push(
    checkManagedFile("copilot.managed", ".github/copilot-instructions.md", 8)
  );
  checks.push(
    checkManagedFile(
      "github-instructions.managed",
      ".github/instructions/rubric.instructions.md",
      0
    )
  );
  checks.push(
    checkManagedFile("cursor.managed", ".cursor/rules/rubric.mdc", 5)
  );
  checks.push(await checkWorkflow(repoRoot));
  checks.push(
    checkPullRequestTemplate(
      instructionFiles.get(".github/pull_request_template.md")
    )
  );
  checks.push(await checkGitignore(repoRoot));
  checks.push(checkPackageManager(packageManager));
  checks.push(checkPackageScripts(packageJson));
  checks.push(
    checkPackageManagerInstructionConflicts(packageManager, instructionFiles)
  );
  checks.push(checkRulesCompileToTargets(rules));

  return {
    score: calculateScore(checks),
    checks,
    suggestedFixes: collectSuggestedFixes(checks)
  };

  function checkManagedFile(
    id: string,
    path: string,
    weight: number
  ): DoctorCheck {
    const file = instructionFiles.get(path);
    const hasBlock = hasManagedBlock(file?.contents ?? "");

    return {
      id,
      title: `${path} contains Rubric managed block`,
      status: hasBlock ? "pass" : "warn",
      message:
        file === undefined
          ? `${path} is missing.`
          : hasBlock
            ? `${path} contains a Rubric managed block.`
            : `${path} exists but does not contain a Rubric managed block.`,
      suggestion: hasBlock ? undefined : "rubric compile",
      weight
    };
  }
}

function resolveDoctorFormat(format: string | undefined): "text" | "json" {
  if (format === undefined || format === "text") {
    return "text";
  }

  if (format === "json") {
    return "json";
  }

  throw new RubricError(
    `Invalid doctor output format "${format}". Expected text or json.`
  );
}

async function checkGitStatus(repoRoot: string): Promise<DoctorCheck> {
  const status = await git(repoRoot, ["status", "--short"]);

  return {
    id: "git.status",
    title: "Git repository found",
    status: status.length === 0 ? "pass" : "warn",
    message:
      status.length === 0
        ? "Repository is clean."
        : "Repository has uncommitted changes.",
    weight: 0
  };
}

function checkBaseSecurityCoverage(rules: RubricRule[]): DoctorCheck {
  const hasBase = rules.some(
    (rule) => rule.id.startsWith("pr.") || rule.id.startsWith("agent.")
  );
  const hasSecurity = rules.some((rule) => rule.id.startsWith("security."));
  const status = hasBase && hasSecurity ? "pass" : "warn";

  return {
    id: "packs.base-security",
    title: "Base and security rules present",
    status,
    message:
      status === "pass"
        ? "Base-like and security-like rules are present."
        : "Base-like or security-like rules are missing.",
    suggestion: status === "pass" ? undefined : "rubric add-pack base security",
    weight: 10
  };
}

async function checkRulesEvaluate(
  rules: RubricRule[],
  config: RubricConfig
): Promise<DoctorCheck> {
  if (rules.length === 0) {
    return {
      id: "check.evaluates",
      title: "rubric check can evaluate rules",
      status: "fail",
      message: "No rules are available to evaluate.",
      suggestion: "rubric init",
      weight: 10
    };
  }

  try {
    await evaluateRules({
      rules,
      config,
      changeSet: createSyntheticChangeSet(rules),
      pr: {
        title: "Rubric doctor",
        body: "## Summary\n\nRubric doctor synthetic check.\n"
      }
    });

    return {
      id: "check.evaluates",
      title: "rubric check can evaluate rules",
      status: "pass",
      message: "Rules can be evaluated by the deterministic checker.",
      weight: 10
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      id: "check.evaluates",
      title: "rubric check can evaluate rules",
      status: "fail",
      message: `Rule evaluation failed: ${message}`,
      weight: 10
    };
  }
}

function checkClaude(file: RepoFile | undefined): DoctorCheck {
  const contents = file?.contents ?? "";
  const referencesAgents =
    contents.includes("@AGENTS.md") || /\bAGENTS\.md\b/.test(contents);

  return {
    id: "claude.references-agents",
    title: "CLAUDE.md references AGENTS.md",
    status: referencesAgents ? "pass" : "warn",
    message:
      file === undefined
        ? "CLAUDE.md is missing."
        : referencesAgents
          ? "CLAUDE.md references AGENTS.md."
          : "CLAUDE.md exists but does not reference AGENTS.md.",
    suggestion: referencesAgents ? undefined : "rubric compile",
    weight: 10
  };
}

async function checkWorkflow(repoRoot: string): Promise<DoctorCheck> {
  const workflowPath = ".github/workflows/rubric.yml";
  const workflow = await readRepoFile(repoRoot, workflowPath);
  const runsCheck = /\brubric\s+check\b/.test(workflow?.contents ?? "");

  return {
    id: "workflow.rubric-check",
    title: "GitHub workflow runs rubric check",
    status: runsCheck ? "pass" : "warn",
    message:
      workflow === undefined
        ? "Rubric GitHub workflow is missing."
        : runsCheck
          ? "Rubric GitHub workflow calls rubric check."
          : "Rubric GitHub workflow does not call rubric check.",
    suggestion: runsCheck ? undefined : "rubric init",
    weight: 10
  };
}

function checkPullRequestTemplate(file: RepoFile | undefined): DoctorCheck {
  const contents = file?.contents ?? "";
  const hasRubricSection =
    hasManagedBlock(contents) ||
    /^##+\s+Rubric\b/im.test(contents) ||
    /\bRubric exceptions\b/i.test(contents);

  return {
    id: "pr-template.rubric",
    title: "PR template contains Rubric section",
    status: hasRubricSection ? "pass" : "warn",
    message:
      file === undefined
        ? "Pull request template is missing."
        : hasRubricSection
          ? "Pull request template contains a Rubric section."
          : "Pull request template exists but has no Rubric section.",
    suggestion: hasRubricSection ? undefined : "rubric compile",
    weight: 7
  };
}

async function checkGitignore(repoRoot: string): Promise<DoctorCheck> {
  const gitignore = await readRepoFile(repoRoot, ".gitignore");
  const ignoresCache = (gitignore?.contents ?? "")
    .split(/\r?\n/)
    .some((line) => line.trim() === ".rubric/cache/");

  return {
    id: "gitignore.cache",
    title: ".gitignore ignores .rubric/cache/",
    status: ignoresCache ? "pass" : "warn",
    message: ignoresCache
      ? ".gitignore contains .rubric/cache/."
      : ".gitignore does not ignore .rubric/cache/.",
    suggestion: ignoresCache ? undefined : "rubric init",
    weight: 5
  };
}

function checkPackageManager(packageManager: string | undefined): DoctorCheck {
  return {
    id: "package-manager.detected",
    title: "Package manager detected",
    status: packageManager === undefined ? "warn" : "pass",
    message:
      packageManager === undefined
        ? "No package manager lockfile detected."
        : `Detected package manager: ${packageManager}.`,
    weight: 0
  };
}

function checkPackageScripts(packageJson: PackageJsonSummary): DoctorCheck {
  if (!packageJson.exists) {
    return {
      id: "package-scripts.detected",
      title: "Package scripts detected",
      status: "warn",
      message: "No root package.json found.",
      weight: 0
    };
  }

  if (packageJson.invalid) {
    return {
      id: "package-scripts.detected",
      title: "Package scripts detected",
      status: "warn",
      message: "Root package.json could not be parsed.",
      weight: 0
    };
  }

  const expectedScripts = ["test", "lint", "typecheck"];
  const presentScripts = expectedScripts.filter((script) =>
    packageJson.scripts.includes(script)
  );

  return {
    id: "package-scripts.detected",
    title: "Package scripts detected",
    status: presentScripts.length > 0 ? "pass" : "warn",
    message:
      presentScripts.length > 0
        ? `Detected scripts: ${presentScripts.join(", ")}.`
        : "No test, lint, or typecheck scripts detected.",
    weight: 0
  };
}

function checkPackageManagerInstructionConflicts(
  packageManager: string | undefined,
  files: Map<string, RepoFile>
): DoctorCheck {
  if (packageManager === undefined) {
    return {
      id: "instructions.package-manager-conflicts",
      title: "Instruction package manager consistency",
      status: "warn",
      message: "No package manager lockfile detected.",
      weight: 0
    };
  }

  const conflictingManagers = ["pnpm", "yarn", "npm", "bun"].filter(
    (candidate) => candidate !== packageManager
  );
  const conflicts = [...files.values()].flatMap((file) =>
    conflictingManagers
      .filter((manager) => mentionsPackageManager(file.contents, manager))
      .map((manager) => `${file.path}: ${manager}`)
  );

  return {
    id: "instructions.package-manager-conflicts",
    title: "Instruction package manager consistency",
    status: conflicts.length === 0 ? "pass" : "warn",
    message:
      conflicts.length === 0
        ? "No conflicting package manager instructions detected."
        : `Potential package manager conflicts: ${conflicts.join(", ")}.`,
    weight: 0
  };
}

function checkRulesCompileToTargets(rules: RubricRule[]): DoctorCheck {
  if (rules.length === 0) {
    return {
      id: "rules.compile-targets",
      title: "Rules compile to supported targets",
      status: "fail",
      message: "No rules are available to compile.",
      suggestion: "rubric init",
      weight: 0
    };
  }

  const hasSupportedTarget = rules.some((rule) =>
    rule.compile.targets.some((target) =>
      supportedCompileTargets.includes(
        target as (typeof supportedCompileTargets)[number]
      )
    )
  );

  return {
    id: "rules.compile-targets",
    title: "Rules compile to supported targets",
    status: hasSupportedTarget ? "pass" : "warn",
    message: hasSupportedTarget
      ? "At least one rule targets a supported compile output."
      : "No rules target agents, claude, copilot, cursor, or pr_template.",
    suggestion: hasSupportedTarget ? undefined : "rubric compile",
    weight: 0
  };
}

function calculateScore(checks: DoctorCheck[]): number {
  const score = checks
    .filter((check) => check.status === "pass")
    .reduce((sum, check) => sum + check.weight, 0);

  return Math.min(100, score);
}

function collectSuggestedFixes(checks: DoctorCheck[]): string[] {
  const suggestions = new Set(
    checks.flatMap((check) =>
      check.suggestion === undefined ? [] : [check.suggestion]
    )
  );

  if (
    checks.some(
      (check) => check.id === "rules.exists" && check.status !== "pass"
    )
  ) {
    suggestions.add("rubric add-pack testing migrations");
    suggestions.add("rubric compile");
  }

  if (
    checks.some(
      (check) =>
        [
          "agents.managed",
          "claude.references-agents",
          "copilot.managed",
          "github-instructions.managed",
          "cursor.managed",
          "pr-template.rubric"
        ].includes(check.id) && check.status !== "pass"
    )
  ) {
    suggestions.add("rubric compile");
  }

  return suggestedFixOrder.filter((suggestion) => suggestions.has(suggestion));
}

function renderDoctorReport(
  report: DoctorReport,
  format: "text" | "json"
): string {
  switch (format) {
    case "json":
      return `${JSON.stringify(report, null, 2)}\n`;
    case "text":
      return renderTextDoctorReport(report);
  }
}

function renderTextDoctorReport(report: DoctorReport): string {
  const lines = [
    "Rubric doctor",
    "",
    `AI Agent Readiness: ${report.score} / 100`,
    ""
  ];

  for (const check of report.checks) {
    lines.push(`[${check.status}] ${check.title}`);
    lines.push(`  ${check.message}`);
  }

  lines.push("", "Suggested fixes:");

  if (report.suggestedFixes.length === 0) {
    lines.push("  none");
  } else {
    for (const fix of report.suggestedFixes) {
      lines.push(`  ${fix}`);
    }
  }

  return lines.join("\n");
}

async function readInstructionFiles(
  repoRoot: string
): Promise<Map<string, RepoFile>> {
  const paths = [
    "AGENTS.md",
    "CLAUDE.md",
    ".github/copilot-instructions.md",
    ".github/instructions/rubric.instructions.md",
    ".cursor/rules/rubric.mdc",
    ".github/pull_request_template.md"
  ];
  const files = new Map<string, RepoFile>();

  for (const path of paths) {
    const file = await readRepoFile(repoRoot, path);

    if (file !== undefined) {
      files.set(path, file);
    }
  }

  return files;
}

async function detectPackageManager(
  repoRoot: string
): Promise<string | undefined> {
  const candidates = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"]
  ] as const;

  for (const [path, packageManager] of candidates) {
    if (await fileExists(repoRoot, path)) {
      return packageManager;
    }
  }

  return undefined;
}

async function readPackageJsonSummary(
  repoRoot: string
): Promise<PackageJsonSummary> {
  const packageJson = await readRepoFile(repoRoot, "package.json");

  if (packageJson === undefined) {
    return {
      exists: false,
      invalid: false,
      scripts: []
    };
  }

  try {
    const parsed = JSON.parse(packageJson.contents) as {
      scripts?: Record<string, unknown>;
    };

    return {
      exists: true,
      invalid: false,
      scripts: Object.entries(parsed.scripts ?? {})
        .filter(([, value]) => typeof value === "string")
        .map(([name]) => name)
        .sort((left, right) => left.localeCompare(right))
    };
  } catch {
    return {
      exists: true,
      invalid: true,
      scripts: []
    };
  }
}

async function readRepoFile(
  repoRoot: string,
  path: string
): Promise<RepoFile | undefined> {
  const filePath = resolve(repoRoot, ...path.split("/"));

  try {
    const stats = await readStat(filePath);

    if (!stats.isFile()) {
      return undefined;
    }

    return {
      path,
      contents: await readFile(filePath, "utf8")
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new RubricError(`Unable to read ${path}: ${message}`, {
      cause: error
    });
  }
}

async function fileExists(repoRoot: string, path: string): Promise<boolean> {
  try {
    await access(resolve(repoRoot, ...path.split("/")));
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new RubricError(`Unable to access ${path}: ${message}`, {
      cause: error
    });
  }
}

function hasManagedBlock(contents: string): boolean {
  return (
    contents.includes(managedBlockBegin) && contents.includes(managedBlockEnd)
  );
}

function mentionsPackageManager(
  contents: string,
  packageManager: string
): boolean {
  return new RegExp(
    `\\b${packageManager}\\s+(?:install|add|test|run|exec|dlx)\\b`
  ).test(contents);
}

function createSyntheticChangeSet(rules: RubricRule[]): ChangeSet {
  const paths = [
    ...new Set(
      rules.flatMap((rule) => rule.applies_to.paths.map(samplePathFromPattern))
    )
  ].sort((left, right) => left.localeCompare(right));
  const files = paths.map(createChangedFile);

  return {
    baseRef: "rubric-doctor-base",
    headRef: "rubric-doctor-head",
    mergeBase: "rubric-doctor-merge-base",
    files,
    stats: {
      filesChanged: files.length,
      additions: files.length,
      deletions: 0,
      directoriesChanged: new Set(files.map((file) => file.directory)).size
    },
    patch: [
      "diff --git a/rubric-doctor-sample.ts b/rubric-doctor-sample.ts",
      "+++ b/rubric-doctor-sample.ts",
      "+const RUBRIC_DOCTOR_SAMPLE = true;"
    ].join("\n")
  };
}

function createChangedFile(path: string): ChangedFile {
  const directory = posix.dirname(path);

  return {
    path,
    status: "modified",
    additions: 1,
    deletions: 0,
    extension: extname(path).replace(/^\./, ""),
    directory: directory === "." ? "" : directory,
    isTest: /\btest\b|\.test\.|\.spec\./.test(path),
    isGenerated: false,
    isBinary: false
  };
}

function samplePathFromPattern(pattern: string): string {
  const cleanedPattern = pattern.replaceAll("\\", "/").replace(/^!/, "");
  const segments = cleanedPattern
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment, index, allSegments) =>
      sampleSegmentFromPattern(segment, index === allSegments.length - 1)
    );
  const samplePath = segments.join("/");

  return samplePath.length === 0 ? "rubric-doctor-sample.ts" : samplePath;
}

function sampleSegmentFromPattern(
  segment: string,
  isLastSegment: boolean
): string {
  if (segment === "**") {
    return isLastSegment ? "rubric-doctor-sample.ts" : "sample";
  }

  const sample = segment
    .replace(/\{[^}]+\}/g, "sample")
    .replace(/\[[^\]]+\]/g, "s")
    .replace(/\*/g, "sample")
    .replace(/\?/g, "s");

  return sample.length === 0 ? "rubric-doctor-sample.ts" : sample;
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trim();
  } catch (error) {
    throw new RubricError(`Git command failed: git ${args.join(" ")}`, {
      cause: error
    });
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
