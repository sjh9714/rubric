import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import type { Command } from "commander";
import {
  collectChangeSet,
  evaluateRules,
  findGitRoot,
  loadConfig,
  loadRules,
  RubricError,
  type RubricConfig
} from "@rubric-dev/core";

import { handleCliError } from "../errors/handleCliError.js";
import { renderJsonReport } from "../reports/jsonReport.js";
import { renderMarkdownReport } from "../reports/markdownReport.js";
import { renderTextReport } from "../reports/textReport.js";
import type { CheckOutputFormat, CheckResult } from "../reports/types.js";

export interface CheckCommandOptions {
  cwd?: string;
  base?: string;
  head?: string;
  format?: string;
  prTitle?: string;
  prBodyFile?: string;
  debug?: boolean;
}

export interface CheckCommandContext {
  env?: NodeJS.ProcessEnv;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

export function addCheckCommand(program: Command): void {
  program
    .command("check")
    .description("Run deterministic rubric checks against the current diff.")
    .option("--cwd <dir>", "working directory to inspect")
    .option("--base <ref>", "base git ref")
    .option("--head <ref>", "head git ref", "HEAD")
    .option("--format <format>", "output format: text, json, or markdown")
    .option("--pr-title <title>", "pull request title metadata")
    .option(
      "--pr-body-file <path>",
      "read pull request body metadata from a file"
    )
    .option("--debug", "print stack traces for unexpected errors")
    .action(async (options: CheckCommandOptions) => {
      const exitCode = await runCheckCommand(options);
      process.exitCode = exitCode;
    });
}

export async function runCheckCommand(
  options: CheckCommandOptions,
  {
    env = process.env,
    stdout = process.stdout,
    stderr = process.stderr
  }: CheckCommandContext = {}
): Promise<0 | 1 | 2 | 3> {
  try {
    const result = await collectCheckResult(options, env);
    const format = resolveOutputFormat(options.format, result.configFormat);

    stdout.write(renderReport(result, format));
    stdout.write("\n");

    return result.blockingFindings.length > 0 ? 1 : 0;
  } catch (error) {
    return handleCliError(error, {
      debug: options.debug,
      stderr
    });
  }
}

async function collectCheckResult(
  options: CheckCommandOptions,
  env: NodeJS.ProcessEnv
): Promise<CheckResult & { configFormat: RubricConfig["output"]["format"] }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const repoRoot = await findGitRoot(cwd);
  const config = await loadConfig(repoRoot);
  const rules = await loadRules(repoRoot);
  const baseRef = options.base ?? (config.project.default_base || "main");
  const headRef = options.head ?? "HEAD";
  const message =
    "No rubric rules found. Add rules under `.rubric/rules` or run `rubric init` once it is available.";

  if (rules.length === 0) {
    return {
      repoRoot,
      baseRef,
      headRef,
      rulesCount: 0,
      changeSet: null,
      findings: [],
      blockingFindings: [],
      message,
      configFormat: config.output.format
    };
  }

  const changeSet = await collectChangeSet({
    repoRoot,
    baseRef,
    headRef
  });
  const pr = {
    title: options.prTitle ?? env.RUBRIC_PR_TITLE,
    body: await readPrBody(options, env, cwd)
  };
  const findings = await evaluateRules({
    rules,
    changeSet,
    config,
    pr
  });
  const blockingFindings = findings.filter((finding) => finding.blocking);

  return {
    repoRoot,
    baseRef,
    headRef,
    rulesCount: rules.length,
    changeSet,
    findings,
    blockingFindings,
    configFormat: config.output.format
  };
}

async function readPrBody(
  options: CheckCommandOptions,
  env: NodeJS.ProcessEnv,
  cwd: string
): Promise<string | undefined> {
  if (options.prBodyFile === undefined) {
    return env.RUBRIC_PR_BODY;
  }

  const filePath = isAbsolute(options.prBodyFile)
    ? options.prBodyFile
    : resolve(cwd, options.prBodyFile);

  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    throw new RubricError(`Unable to read PR body file: ${filePath}`, {
      cause: error
    });
  }
}

function resolveOutputFormat(
  requestedFormat: string | undefined,
  configFormat: RubricConfig["output"]["format"]
): CheckOutputFormat {
  if (requestedFormat !== undefined) {
    if (isCheckOutputFormat(requestedFormat)) {
      return requestedFormat;
    }

    throw new RubricError(
      `Invalid check output format "${requestedFormat}". Expected text, json, or markdown.`
    );
  }

  return configFormat === "github" ? "markdown" : configFormat;
}

function isCheckOutputFormat(format: string): format is CheckOutputFormat {
  return format === "text" || format === "json" || format === "markdown";
}

function renderReport(result: CheckResult, format: CheckOutputFormat): string {
  switch (format) {
    case "json":
      return renderJsonReport(result).trimEnd();
    case "markdown":
      return renderMarkdownReport(result);
    case "text":
      return renderTextReport(result);
  }
}
