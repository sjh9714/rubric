import type { FindingSeverity } from "@rubric-dev/core";

import type { CheckResult } from "./types.js";

const severities: FindingSeverity[] = ["error", "warning", "info"];

export function renderTextReport(result: CheckResult): string {
  if (result.rulesCount === 0) {
    return [
      "Rubric preflight",
      "",
      "No rubric rules found.",
      "",
      "Add rules under `.rubric/rules` or run `rubric init` once it is available."
    ].join("\n");
  }

  const lines = [
    "Rubric preflight",
    "",
    `Base: ${result.baseRef}`,
    `Head: ${result.headRef}`,
    ""
  ];

  if (result.findings.length === 0) {
    lines.push(
      `Changed files: ${result.changeSet?.stats.filesChanged ?? 0}`,
      `Rules checked: ${result.rulesCount}`,
      "Findings: 0",
      "",
      "No rubric findings."
    );

    return lines.join("\n");
  }

  lines.push("Changed files:");
  for (const file of result.changeSet?.files ?? []) {
    lines.push(`  ${file.path}`);
  }

  lines.push("", `Findings: ${result.findings.length}`, "");

  for (const finding of result.findings) {
    lines.push(
      `- ${finding.severity} ${finding.ruleId}`,
      `  ${finding.title}`,
      "",
      `  ${finding.message}`
    );

    if (finding.suggestion !== undefined) {
      lines.push("", "  Suggestion:", `  ${finding.suggestion}`);
    }

    lines.push("");
  }

  lines.push("Result:");
  for (const severity of severities) {
    const count = result.findings.filter(
      (finding) => finding.severity === severity
    ).length;
    lines.push(`  ${count} ${severity}${count === 1 ? "" : "s"}`);
  }

  return lines.join("\n").trimEnd();
}
