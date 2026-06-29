import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import type { Command } from "commander";
import {
  RubricError,
  rubricRuleSchema,
  type RubricRule
} from "@rubric-dev/core";
import { stringify } from "yaml";

import { handleCliError } from "../errors/handleCliError.js";

export interface ProposeCommandOptions {
  fromText?: string;
  cwd?: string;
  write?: boolean;
  force?: boolean;
  debug?: boolean;
}

export interface ProposeCommandContext {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

interface Proposal {
  fileName: string;
  id: string;
  rule: RubricRule;
  yaml: string;
}

export function addProposeCommand(program: Command): void {
  program
    .command("propose")
    .description("Draft a rubric rule from repeated review feedback.")
    .option("--from-text <text>", "review feedback text to draft from")
    .option("--cwd <dir>", "directory to write rules into")
    .option("--write", "write the proposed rule under .rubric/rules")
    .option("--force", "overwrite an existing proposed rule file")
    .option("--debug", "print stack traces for unexpected errors")
    .action(async (options: ProposeCommandOptions) => {
      const exitCode = await runProposeCommand(options);
      process.exitCode = exitCode;
    });
}

export async function runProposeCommand(
  options: ProposeCommandOptions,
  {
    stdout = process.stdout,
    stderr = process.stderr
  }: ProposeCommandContext = {}
): Promise<0 | 2 | 3> {
  try {
    const proposal = createProposalFromText(options.fromText);

    if (options.write === true) {
      const cwd = resolve(options.cwd ?? process.cwd());
      const targetPath = await writeProposal({
        cwd,
        proposal,
        force: options.force === true
      });

      stdout.write(
        renderWriteResult({ cwd, targetPath, force: options.force })
      );
      stdout.write("\n");
      return 0;
    }

    stdout.write(proposal.yaml);
    return 0;
  } catch (error) {
    return handleCliError(error, {
      debug: options.debug,
      stderr
    });
  }
}

function createProposalFromText(fromText: string | undefined): Proposal {
  const text = normalizeInputText(fromText);
  const slug = slugify(text);

  if (slug.length === 0) {
    throw new RubricError(
      "Unable to derive a rule id from --from-text. Include at least one ASCII letter or number."
    );
  }

  const id = `proposed.${slug}`;
  const parsedRule = rubricRuleSchema.safeParse({
    id,
    title: text,
    description: `Drafted from repeated review feedback: "${text}"`,
    severity: "warning",
    applies_to: {
      paths: ["**/*"]
    },
    checks: {},
    message: ensureSentence(text),
    suggestion:
      "Review the matching paths, severity, and checks before committing this rule.",
    compile: {
      targets: ["agents"]
    },
    evidence: {
      source: "manual",
      confidence: 0.5
    }
  });
  if (!parsedRule.success) {
    const issueSummary = parsedRule.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new RubricError(
      `Generated proposal did not match the rule schema: ${issueSummary}`
    );
  }

  const rule = parsedRule.data;
  const yaml = renderRuleYaml(rule);

  return {
    fileName: `${id}.yaml`,
    id,
    rule,
    yaml
  };
}

function normalizeInputText(fromText: string | undefined): string {
  const text = fromText?.trim().replace(/\s+/g, " ") ?? "";

  if (text.length === 0) {
    throw new RubricError(
      "Specify non-empty review feedback with --from-text."
    );
  }

  return text;
}

function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function ensureSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function renderRuleYaml(rule: RubricRule): string {
  const yaml = stringify(rule, {
    lineWidth: 0
  });

  return yaml.endsWith("\n") ? yaml : `${yaml}\n`;
}

async function writeProposal({
  cwd,
  proposal,
  force
}: {
  cwd: string;
  proposal: Proposal;
  force: boolean;
}): Promise<string> {
  const targetPath = join(cwd, ".rubric/rules", proposal.fileName);
  const targetExists = await pathExists(targetPath);

  if (targetExists && !force) {
    throw new RubricError(
      `Proposed rule already exists: ${targetPath}. Use --force to overwrite it.`
    );
  }

  try {
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, proposal.yaml);
  } catch (error) {
    throw new RubricError(`Unable to write proposed rule: ${targetPath}`, {
      cause: error
    });
  }

  return targetPath;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw new RubricError(`Unable to access proposed rule path: ${path}`, {
      cause: error
    });
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function renderWriteResult({
  cwd,
  targetPath,
  force
}: {
  cwd: string;
  targetPath: string;
  force: boolean | undefined;
}): string {
  const relativePath = relative(cwd, targetPath).replaceAll("\\", "/");
  const status = force === true ? "Overwritten" : "Created";

  return [
    "Rubric propose",
    "",
    `${status}:`,
    `  ${relativePath}`,
    "",
    "Next:",
    "  1. Review the draft paths, severity, and checks.",
    "  2. Run rubric compile to share the rule with agents and humans.",
    "  3. Run rubric check --base main before your next PR."
  ].join("\n");
}
