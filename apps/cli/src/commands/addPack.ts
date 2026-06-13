import { relative, resolve } from "node:path";

import type { Command } from "commander";
import { findGitRoot, RubricError } from "@rubric-dev/core";
import {
  copyBuiltInPackRules,
  listBuiltInPacks,
  type CopiedRule
} from "@rubric-dev/packs";

import { handleCliError } from "../errors/handleCliError.js";

export interface AddPackCommandOptions {
  cwd?: string;
  list?: boolean;
  force?: boolean;
  dryRun?: boolean;
  debug?: boolean;
}

export interface AddPackCommandContext {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

export function addAddPackCommand(program: Command): void {
  program
    .command("add-pack")
    .description("Copy built-in rubric rule packs into this repository.")
    .argument("[packs...]", "built-in pack names to add")
    .option("--list", "list available built-in packs")
    .option("--cwd <dir>", "working directory to inspect")
    .option("--force", "overwrite existing rule files")
    .option("--dry-run", "show what would be copied without writing files")
    .option("--debug", "print stack traces for unexpected errors")
    .action(async (packNames: string[], options: AddPackCommandOptions) => {
      const exitCode = await runAddPackCommand(packNames, options);
      process.exitCode = exitCode;
    });
}

export async function runAddPackCommand(
  packNames: string[],
  options: AddPackCommandOptions,
  {
    stdout = process.stdout,
    stderr = process.stderr
  }: AddPackCommandContext = {}
): Promise<0 | 2 | 3> {
  try {
    if (options.list === true) {
      stdout.write(await renderPackList());
      stdout.write("\n");
      return 0;
    }

    if (packNames.length === 0) {
      throw new RubricError(
        "Specify at least one built-in pack, or use --list to see available packs."
      );
    }

    const cwd = resolve(options.cwd ?? process.cwd());
    const repoRoot = await findGitRoot(cwd);
    const result = await copyBuiltInPackRules({
      repoRoot,
      packNames,
      force: options.force,
      dryRun: options.dryRun
    });

    stdout.write(
      renderAddPackResult({
        copied: result.copied,
        dryRun: options.dryRun === true,
        repoRoot
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

async function renderPackList(): Promise<string> {
  const packs = await listBuiltInPacks();
  const lines = ["Built-in packs", ""];

  for (const pack of packs) {
    const description =
      pack.description === undefined ? "" : ` - ${pack.description}`;
    lines.push(
      `  ${pack.name} (${pack.rulesCount} rules): ${pack.title}${description}`
    );
  }

  return lines.join("\n");
}

function renderAddPackResult({
  copied,
  dryRun,
  repoRoot
}: {
  copied: CopiedRule[];
  dryRun: boolean;
  repoRoot: string;
}): string {
  const packNames = [...new Set(copied.map((rule) => rule.packName))];
  const lines = ["Rubric add-pack", ""];

  if (dryRun) {
    lines.push("Dry run. No files were written.", "");
  }

  lines.push(dryRun ? "Packs:" : "Added packs:");
  for (const packName of packNames) {
    lines.push(`  ${packName}`);
  }

  lines.push("", "Rules:");
  for (const rule of copied) {
    lines.push(
      `  ${rule.status} ${relative(repoRoot, rule.targetPath).replaceAll("\\", "/")}`
    );
  }

  lines.push("", "Next:", "  rubric check --base main");

  return lines.join("\n");
}
