import picomatch from "picomatch";

import type { RubricConfig } from "../config/configSchema.js";
import { RubricError } from "../errors/RubricError.js";
import type { Finding, FindingEvidence } from "../findings/types.js";
import type { ChangedFile, ChangeSet } from "../git/types.js";
import type { RubricRule } from "../rules/ruleSchema.js";
import type { RuleEvaluationInput } from "./types.js";

const severityRank = {
  error: 0,
  warning: 1,
  info: 2
} as const;

export async function evaluateRules(
  input: RuleEvaluationInput
): Promise<Finding[]> {
  const findings = input.rules.flatMap((rule) =>
    evaluateRule(rule, input.changeSet, input.config, input.pr?.body ?? "")
  );

  return findings.sort(compareFindings);
}

function evaluateRule(
  rule: RubricRule,
  changeSet: ChangeSet,
  config: RubricConfig,
  prBody: string
): Finding[] {
  if (!ruleApplies(rule, changeSet.files)) {
    return [];
  }

  const findings: Finding[] = [];
  const checks = rule.checks;

  const requiredAny = checks.required_changed_files?.any ?? [];
  if (
    requiredAny.length > 0 &&
    !changeSet.files.some((file) => matchesAny(file.path, requiredAny))
  ) {
    findings.push(
      createFinding({
        rule,
        config,
        id: `${rule.id}:required_changed_files:any`,
        files: [],
        evidence: requiredAny.map((pattern) => ({
          kind: "missing_changed_file",
          text: pattern
        }))
      })
    );
  }

  const requiredAll = checks.required_changed_files?.all ?? [];
  const missingRequired = requiredAll.filter(
    (pattern) =>
      !changeSet.files.some((file) => matchesPattern(file.path, pattern))
  );
  if (missingRequired.length > 0) {
    findings.push(
      createFinding({
        rule,
        config,
        id: `${rule.id}:required_changed_files:all`,
        files: [],
        evidence: missingRequired.map((pattern) => ({
          kind: "missing_changed_file",
          text: pattern
        }))
      })
    );
  }

  const forbiddenAny = checks.forbidden_changed_files?.any ?? [];
  const forbiddenFiles = sortedPaths(
    changeSet.files.filter((file) => matchesAny(file.path, forbiddenAny))
  );
  if (forbiddenFiles.length > 0) {
    findings.push(
      createFinding({
        rule,
        config,
        id: `${rule.id}:forbidden_changed_files:any`,
        files: forbiddenFiles,
        evidence: forbiddenFiles.map((path) => ({
          kind: "forbidden_changed_file",
          path
        }))
      })
    );
  }

  const requiredSections = checks.required_pr_body_sections?.any ?? [];
  if (
    requiredSections.length > 0 &&
    !requiredSections.some((section) => includesSection(prBody, section))
  ) {
    findings.push(
      createFinding({
        rule,
        config,
        id: `${rule.id}:required_pr_body_sections:any`,
        files: [],
        evidence: requiredSections.map((section) => ({
          kind: "missing_pr_body_section",
          text: section
        }))
      })
    );
  }

  const directoryThreshold = checks.changed_directories_greater_than;
  if (
    directoryThreshold !== undefined &&
    changeSet.stats.directoriesChanged > directoryThreshold
  ) {
    findings.push(
      createFinding({
        rule,
        config,
        id: `${rule.id}:changed_directories_greater_than`,
        files: sortedPaths(changeSet.files),
        evidence: [
          {
            kind: "changed_directories",
            text: `${changeSet.stats.directoriesChanged} > ${directoryThreshold}`
          }
        ]
      })
    );
  }

  const matchedAddedPatterns = (checks.added_patterns ?? []).filter((pattern) =>
    matchesPatch(rule.id, pattern, changeSet.patch)
  );
  if (matchedAddedPatterns.length > 0) {
    findings.push(
      createFinding({
        rule,
        config,
        id: `${rule.id}:added_patterns`,
        files: sortedPaths(changeSet.files),
        evidence: matchedAddedPatterns.map((pattern) => ({
          kind: "added_pattern",
          text: pattern
        }))
      })
    );
  }

  return findings;
}

function ruleApplies(rule: RubricRule, files: ChangedFile[]): boolean {
  return files.some((file) => matchesAny(file.path, rule.applies_to.paths));
}

function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(path, pattern));
}

function matchesPattern(path: string, pattern: string): boolean {
  return picomatch.isMatch(normalizePath(path), pattern, { dot: true });
}

function matchesPatch(ruleId: string, pattern: string, patch: string): boolean {
  try {
    return new RegExp(pattern, "m").test(patch);
  } catch (error) {
    throw new RubricError(
      `Invalid added_patterns regex for rule ${ruleId}: ${pattern}`,
      { cause: error }
    );
  }
}

function includesSection(body: string, section: string): boolean {
  return body.toLowerCase().includes(section.toLowerCase());
}

function sortedPaths(files: ChangedFile[]): string[] {
  return files
    .map((file) => normalizePath(file.path))
    .sort((a, b) => a.localeCompare(b));
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function createFinding({
  rule,
  config,
  id,
  files,
  evidence
}: {
  rule: RubricRule;
  config: RubricConfig;
  id: string;
  files: string[];
  evidence: FindingEvidence[];
}): Finding {
  return {
    id,
    ruleId: rule.id,
    title: rule.title,
    severity: rule.severity,
    message: rule.message,
    suggestion: rule.suggestion,
    files,
    evidence,
    deterministic: true,
    blocking: config.modes.check.fail_on.includes(rule.severity)
  };
}

function compareFindings(a: Finding, b: Finding): number {
  return (
    severityRank[a.severity] - severityRank[b.severity] ||
    a.ruleId.localeCompare(b.ruleId) ||
    a.id.localeCompare(b.id)
  );
}
