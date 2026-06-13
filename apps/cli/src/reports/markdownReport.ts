import type { CheckResult } from "./types.js";

export function renderMarkdownReport(result: CheckResult): string {
  if (result.rulesCount === 0) {
    return [
      "## Rubric preflight",
      "",
      "No rubric rules found.",
      "",
      "Add rules under `.rubric/rules` or run `rubric init` once it is available."
    ].join("\n");
  }

  const lines = [
    "## Rubric preflight",
    "",
    `**Base:** \`${result.baseRef}\`  `,
    `**Head:** \`${result.headRef}\``,
    "",
    `**Changed files:** ${result.changeSet?.stats.filesChanged ?? 0}  `,
    `**Rules checked:** ${result.rulesCount}  `,
    `**Findings:** ${result.findings.length}`,
    ""
  ];

  if (result.findings.length === 0) {
    lines.push("No rubric findings.");
    return lines.join("\n");
  }

  lines.push(
    "| Severity | Rule | Message |",
    "|---|---|---|",
    ...result.findings.map(
      (finding) =>
        `| ${escapeTableCell(finding.severity)} | ${escapeTableCell(
          finding.ruleId
        )} | ${escapeTableCell(finding.message)} |`
    )
  );

  return lines.join("\n");
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
