import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { ZodError } from "zod";

import { RubricError } from "../errors/RubricError.js";
import { pathExists } from "../fs/pathExists.js";
import { readYamlFile } from "../fs/readYamlFile.js";
import { rubricRuleSchema, type RubricRule } from "./ruleSchema.js";

interface LoadedRule {
  filePath: string;
  rule: RubricRule;
}

export async function loadRules(repoRoot: string): Promise<RubricRule[]> {
  const rulesDir = join(repoRoot, ".rubric", "rules");

  if (!(await pathExists(rulesDir))) {
    return [];
  }

  const entries = await readdir(rulesDir, { withFileTypes: true });
  const ruleFiles = entries
    .filter((entry) => entry.isFile() && isYamlFile(entry.name))
    .map((entry) => join(rulesDir, entry.name))
    .sort();

  const loadedRules = await Promise.all(ruleFiles.map(loadRuleFile));
  assertUniqueRuleIds(loadedRules);

  return loadedRules
    .map((loadedRule) => loadedRule.rule)
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function loadRuleFile(filePath: string): Promise<LoadedRule> {
  const contents = await readYamlFile(filePath);

  try {
    return {
      filePath,
      rule: rubricRuleSchema.parse(contents)
    };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new RubricError(
        `Invalid rubric rule: ${filePath}\n\n${formatZodIssues(error)}`,
        { cause: error }
      );
    }

    throw error;
  }
}

function assertUniqueRuleIds(loadedRules: LoadedRule[]): void {
  const seen = new Map<string, string>();

  for (const { filePath, rule } of loadedRules) {
    const previousPath = seen.get(rule.id);

    if (previousPath !== undefined) {
      throw new RubricError(
        `Duplicate rubric rule id "${rule.id}" found in:\n- ${previousPath}\n- ${filePath}`
      );
    }

    seen.set(rule.id, filePath);
  }
}

function isYamlFile(fileName: string): boolean {
  return fileName.endsWith(".yaml") || fileName.endsWith(".yml");
}

function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
}
