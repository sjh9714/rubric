import { extname, posix } from "node:path";

import type { Command } from "commander";
import {
  defaultRubricConfig,
  evaluateRules,
  RubricError,
  type ChangedFile,
  type ChangeSet,
  type Finding,
  type RubricRule
} from "@rubric-dev/core";

import { handleCliError } from "../errors/handleCliError.js";

type DemoOutputFormat = "text" | "json" | "markdown";

export interface DemoCommandOptions {
  format?: string;
  debug?: boolean;
}

export interface DemoCommandContext {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

interface DemoResult {
  samplePr: {
    title: string;
  };
  rulesCount: number;
  changedFiles: string[];
  stats: ChangeSet["stats"];
  findings: Finding[];
  blockingFindings: Finding[];
}

const samplePullRequest = {
  title: "Fix billing retry behavior",
  body: [
    "## Summary",
    "",
    "Fixes retry behavior for failed billing webhooks.",
    "",
    "## Verification",
    "",
    "Commands run:",
    "",
    "```text",
    "pnpm test",
    "```"
  ].join("\n")
};

export function addDemoCommand(program: Command): void {
  program
    .command("demo")
    .description("Show a zero-setup sample Rubric report.")
    .option(
      "--format <format>",
      "output format: text, json, or markdown",
      "text"
    )
    .option("--debug", "print stack traces for unexpected errors")
    .action(async (options: DemoCommandOptions) => {
      const exitCode = await runDemoCommand(options);
      process.exitCode = exitCode;
    });
}

export async function runDemoCommand(
  options: DemoCommandOptions,
  { stdout = process.stdout, stderr = process.stderr }: DemoCommandContext = {}
): Promise<0 | 2 | 3> {
  try {
    const format = resolveDemoFormat(options.format);
    const result = await collectDemoResult();

    stdout.write(renderDemoReport(result, format));
    stdout.write("\n");

    return 0;
  } catch (error) {
    return handleCliError(error, {
      debug: options.debug,
      stderr
    });
  }
}

async function collectDemoResult(): Promise<DemoResult> {
  const changeSet = createDemoChangeSet();
  const rules = createDemoRules();
  const findings = await evaluateRules({
    rules,
    changeSet,
    config: defaultRubricConfig,
    pr: samplePullRequest
  });
  const blockingFindings = findings.filter((finding) => finding.blocking);

  return {
    samplePr: {
      title: samplePullRequest.title
    },
    rulesCount: rules.length,
    changedFiles: changeSet.files.map((file) => file.path),
    stats: changeSet.stats,
    findings,
    blockingFindings
  };
}

function createDemoChangeSet(): ChangeSet {
  const files = [
    changedFile("app/api/billing/retry/route.ts", "modified", 18, 4),
    changedFile("src/services/billing/retry.ts", "modified", 34, 9),
    changedFile(
      "db/migrations/20260614_drop_legacy_retry_table.sql",
      "added",
      3,
      0
    ),
    changedFile("src/utils/date.ts", "modified", 10, 6),
    changedFile("src/components/BillingStatus.tsx", "modified", 22, 7),
    changedFile("docs/billing.md", "modified", 12, 3)
  ];

  return {
    baseRef: "main",
    headRef: "HEAD",
    mergeBase: "demo-merge-base",
    files,
    stats: {
      filesChanged: 6,
      additions: 99,
      deletions: 29,
      directoriesChanged: 6
    },
    patch: [
      "diff --git a/db/migrations/20260614_drop_legacy_retry_table.sql b/db/migrations/20260614_drop_legacy_retry_table.sql",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/db/migrations/20260614_drop_legacy_retry_table.sql",
      "@@ -0,0 +1,3 @@",
      "+-- Remove legacy retry state after webhook retry rewrite",
      "+DROP TABLE legacy_retry_jobs;",
      "+-- Recreated from billing webhook events if needed"
    ].join("\n")
  };
}

function changedFile(
  path: string,
  status: ChangedFile["status"],
  additions: number,
  deletions: number
): ChangedFile {
  const directory = posix.dirname(path);

  return {
    path,
    status,
    additions,
    deletions,
    extension: extname(path),
    directory: directory === "." ? "" : directory,
    isTest: isTestPath(path),
    isGenerated: isGeneratedPath(path),
    isBinary: false
  };
}

function createDemoRules(): RubricRule[] {
  return [
    demoRule({
      id: "testing.required-for-api-change",
      title: "API changes require tests",
      severity: "error",
      applies_to: {
        paths: ["app/api/**", "src/api/**", "src/controllers/**"]
      },
      checks: {
        required_changed_files: {
          any: ["**/*.test.ts", "**/*.spec.ts", "tests/**", "__tests__/**"]
        }
      },
      message: "This PR changes API code but does not modify any test files.",
      suggestion: "Add or update tests covering the changed API behavior."
    }),
    demoRule({
      id: "db.destructive-migration-warning",
      title: "Destructive database migration",
      severity: "warning",
      applies_to: {
        paths: ["db/migrations/**", "prisma/migrations/**", "migrations/**"]
      },
      checks: {
        added_patterns: ["\\bDROP\\s+TABLE\\b", "\\bTRUNCATE\\b"]
      },
      message:
        "This migration appears to contain a potentially destructive database operation.",
      suggestion:
        "Call out the destructive operation, data safety plan, and rollback approach in the PR description."
    }),
    demoRule({
      id: "pr.too-broad",
      title: "PR touches many directories",
      severity: "warning",
      applies_to: {
        paths: ["**/*"]
      },
      checks: {
        changed_directories_greater_than: 4
      },
      message: "This PR changes files across many directories.",
      suggestion:
        "Consider splitting unrelated cleanup or refactoring into a separate PR."
    }),
    demoRule({
      id: "agent.commands-run-required",
      title: "Verification commands are documented",
      severity: "warning",
      applies_to: {
        paths: ["**/*"]
      },
      checks: {
        required_pr_body_sections: {
          any: ["Verification", "Commands run"]
        }
      },
      message: "The PR description should include verification commands.",
      suggestion: "Add a Verification section with the commands you ran."
    }),
    demoRule({
      id: "security.no-secret-like-patterns",
      title: "Secret-like values are not added",
      severity: "error",
      applies_to: {
        paths: ["**/*"]
      },
      checks: {
        added_patterns: [
          "\\bAWS_SECRET_ACCESS_KEY\\b",
          "\\bsk-[A-Za-z0-9]{20,}\\b"
        ]
      },
      message: "This PR appears to add a secret-like value.",
      suggestion: "Remove the secret and rotate it if it was committed."
    })
  ];
}

function demoRule(rule: {
  id: string;
  title: string;
  severity: RubricRule["severity"];
  applies_to: RubricRule["applies_to"];
  checks: RubricRule["checks"];
  message: string;
  suggestion: string;
}): RubricRule {
  return {
    ...rule,
    compile: {
      targets: ["agents"]
    },
    evidence: {
      source: "manual",
      confidence: 1
    }
  };
}

function resolveDemoFormat(format: string | undefined): DemoOutputFormat {
  if (format === undefined || format === "text") {
    return "text";
  }

  if (format === "json" || format === "markdown") {
    return format;
  }

  throw new RubricError(
    `Invalid demo output format "${format}". Expected text, json, or markdown.`
  );
}

function renderDemoReport(
  result: DemoResult,
  format: DemoOutputFormat
): string {
  switch (format) {
    case "json":
      return renderDemoJson(result);
    case "markdown":
      return renderDemoMarkdown(result);
    case "text":
      return renderDemoText(result);
  }
}

function renderDemoText(result: DemoResult): string {
  return [
    "Rubric demo",
    "",
    `Sample PR: ${result.samplePr.title}`,
    "",
    "What this demonstrates:",
    "- this is review feedback your team would otherwise repeat by hand",
    "- Rubric catches it before review and shares the same rules with agents and CI",
    "- error findings can block while warnings stay advisory",
    "- no git repo, config, rules, token, network, or LLM is required for this demo",
    "",
    "Changed files:",
    ...result.changedFiles.map((path) => `- ${path}`),
    "",
    `Rules checked: ${result.rulesCount}`,
    `Findings: ${result.findings.length}`,
    "",
    ...result.findings.flatMap((finding) => [
      `[${finding.severity}] ${finding.ruleId} - ${finding.title}`,
      `  ${finding.message}`,
      ...(finding.suggestion === undefined
        ? []
        : [`  Suggestion: ${finding.suggestion}`]),
      ""
    ]),
    "Try it in your repo:",
    "- rubric doctor",
    "- rubric init",
    "- rubric compile",
    "- rubric check --base main"
  ]
    .join("\n")
    .trimEnd();
}

function renderDemoJson(result: DemoResult): string {
  return JSON.stringify(result, null, 2);
}

function renderDemoMarkdown(result: DemoResult): string {
  return [
    "## Rubric demo",
    "",
    `**Sample PR:** ${result.samplePr.title}`,
    "",
    `Rules checked: ${result.rulesCount}`,
    `Findings: ${result.findings.length}`,
    "",
    "| Severity | Rule | Finding | Blocking |",
    "| --- | --- | --- | --- |",
    ...result.findings.map(
      (finding) =>
        `| ${finding.severity} | \`${finding.ruleId}\` | ${escapeMarkdownTableCell(
          finding.message
        )} | ${finding.blocking ? "yes" : "no"} |`
    )
  ].join("\n");
}

function escapeMarkdownTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
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
