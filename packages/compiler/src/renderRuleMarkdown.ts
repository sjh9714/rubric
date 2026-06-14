import type { RubricRule } from "@rubric-dev/core";

export function renderRulesMarkdown(rules: RubricRule[]): string {
  if (rules.length === 0) {
    return "No target-specific Rubric rules are configured yet.\n";
  }

  return `${rules.map(renderRuleMarkdown).join("\n\n")}\n`;
}

function renderRuleMarkdown(rule: RubricRule): string {
  const lines = [
    `### ${rule.title}`,
    "",
    `Rule ID: \`${rule.id}\``,
    `Severity: ${rule.severity}`
  ];

  if (rule.description !== undefined) {
    lines.push("", "Description:", rule.description.trim());
  }

  lines.push("", "Applies to:");
  for (const path of rule.applies_to.paths) {
    lines.push(`- \`${path}\``);
  }

  lines.push("", "Rule:", rule.message.trim());

  if (rule.suggestion !== undefined) {
    lines.push("", "Suggestion:", rule.suggestion.trim());
  }

  return lines.join("\n");
}
