import { join } from "node:path";

import { ZodError } from "zod";

import { RubricError } from "../errors/RubricError.js";
import { pathExists } from "../fs/pathExists.js";
import { readYamlFile } from "../fs/readYamlFile.js";
import { rubricConfigSchema, type RubricConfig } from "./configSchema.js";
import { defaultRubricConfig } from "./defaults.js";

export async function loadConfig(repoRoot: string): Promise<RubricConfig> {
  const configPath = join(repoRoot, ".rubric", "config.yaml");

  if (!(await pathExists(configPath))) {
    return defaultRubricConfig;
  }

  const config = deepMerge(defaultRubricConfig, await readYamlFile(configPath));

  try {
    return rubricConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new RubricError(
        `Invalid rubric config: ${configPath}\n\n${formatZodIssues(error)}`,
        { cause: error }
      );
    }

    throw error;
  }
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : (override as T);
  }

  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const baseValue = result[key];
    result[key] =
      isPlainObject(baseValue) && isPlainObject(value)
        ? deepMerge(baseValue, value)
        : value;
  }

  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
}
