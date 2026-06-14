import { resolve } from "node:path";

import type { Command } from "commander";
import {
  compileRules,
  type CompiledFileResult,
  type CompileTarget
} from "@rubric-dev/compiler";
import {
  findGitRoot,
  loadConfig,
  loadRules,
  RubricError
} from "@rubric-dev/core";

import { handleCliError } from "../errors/handleCliError.js";

const allTargets = [
  "agents",
  "claude",
  "copilot",
  "cursor",
  "pr_template"
] as const satisfies CompileTarget[];

export interface CompileCommandOptions {
  cwd?: string;
  target?: string[];
  dryRun?: boolean;
  force?: boolean;
  debug?: boolean;
}

export interface CompileCommandContext {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

export function addCompileCommand(program: Command): void {
  program
    .command("compile")
    .description("Compile rubric rules into agent instruction files.")
    .option("--cwd <dir>", "working directory to compile")
    .option("--target <target>", "compile target", collectTargets, [])
    .option("--dry-run", "show what would be generated without writing files")
    .option("--force", "refresh managed blocks in existing files")
    .option("--debug", "print stack traces for unexpected errors")
    .action(async (options: CompileCommandOptions) => {
      const exitCode = await runCompileCommand(options);
      process.exitCode = exitCode;
    });
}

export async function runCompileCommand(
  options: CompileCommandOptions,
  {
    stdout = process.stdout,
    stderr = process.stderr
  }: CompileCommandContext = {}
): Promise<0 | 2 | 3> {
  try {
    const cwd = resolve(options.cwd ?? process.cwd());
    const repoRoot = await findGitRoot(cwd);
    const config = await loadConfig(repoRoot);
    const rules = await loadRules(repoRoot);

    if (rules.length === 0) {
      stdout.write(
        "No rubric rules found. Add rules under `.rubric/rules` or run `rubric init`.\n"
      );
      return 0;
    }

    const targets =
      options.target === undefined || options.target.length === 0
        ? undefined
        : parseTargets(options.target);
    const result = await compileRules({
      repoRoot,
      rules,
      config,
      targets,
      dryRun: options.dryRun === true,
      force: options.force === true
    });

    stdout.write(
      renderCompileResult({
        files: result.files,
        rulesCount: result.rulesCount,
        targets: result.targets,
        dryRun: options.dryRun === true
      })
    );
    stdout.write("\n");
    return 0;
  } catch (error) {
    return handleCliError(error, {
      debug: options.debug,
      stderr
    });
  }
}

function collectTargets(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseTargets(values: string[]): CompileTarget[] {
  const targets: CompileTarget[] = [];

  for (const value of values) {
    const normalizedTargets = normalizeTarget(value);

    for (const target of normalizedTargets) {
      if (!targets.includes(target)) {
        targets.push(target);
      }
    }
  }

  return targets;
}

function normalizeTarget(value: string): CompileTarget[] {
  switch (value) {
    case "agents":
    case "claude":
    case "copilot":
    case "cursor":
      return [value];
    case "pr-template":
      return ["pr_template"];
    case "all":
      return [...allTargets];
    default:
      throw new RubricError(
        `Unknown compile target "${value}". Expected agents, claude, copilot, cursor, pr-template, or all.`
      );
  }
}

function renderCompileResult({
  files,
  rulesCount,
  targets,
  dryRun
}: {
  files: CompiledFileResult[];
  rulesCount: number;
  targets: CompileTarget[];
  dryRun: boolean;
}): string {
  const lines = ["Rubric compile", ""];

  if (dryRun) {
    lines.push("Dry run. No files were written.", "");
  }

  lines.push(dryRun ? "Files:" : "Generated:");

  if (files.length === 0) {
    lines.push("  none");
  } else {
    for (const file of files) {
      lines.push(`  ${file.status} ${file.path}`);
    }
  }

  lines.push(
    "",
    `Rules compiled: ${rulesCount}`,
    `Targets: ${targets.join(", ")}`,
    "",
    "Next:",
    "  rubric check --base main"
  );

  return lines.join("\n");
}
