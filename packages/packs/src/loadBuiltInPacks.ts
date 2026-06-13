import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RubricError, rubricRuleSchema } from "@rubric-dev/core";
import { parse } from "yaml";
import { ZodError } from "zod";

import {
  builtInPackMetadataSchema,
  type BuiltInPackMetadata
} from "./packSchema.js";

export interface BuiltInPackSummary {
  name: string;
  title: string;
  description?: string;
  rulesCount: number;
}

export interface BuiltInPack {
  name: string;
  title: string;
  description?: string;
  rules: BuiltInPackRule[];
}

export interface BuiltInPackRule {
  id: string;
  sourcePath: string;
  fileName: string;
  yaml: string;
}

export async function listBuiltInPacks(): Promise<BuiltInPackSummary[]> {
  const packNames = await listPackNames();
  const packs = await Promise.all(packNames.map(loadBuiltInPack));

  return packs.map((pack) => ({
    name: pack.name,
    title: pack.title,
    description: pack.description,
    rulesCount: pack.rules.length
  }));
}

export async function loadBuiltInPack(name: string): Promise<BuiltInPack> {
  const packNames = await listPackNames();

  if (!packNames.includes(name)) {
    throw new RubricError(
      `Unknown built-in pack "${name}". Available packs: ${packNames.join(", ")}`
    );
  }

  const packDir = join(builtinsRoot(), name);
  const metadata = await loadPackMetadata(join(packDir, "pack.yaml"));
  const rulesDir = join(packDir, "rules");
  const ruleFiles = (await readdir(rulesDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && isYamlFile(entry.name))
    .map((entry) => join(rulesDir, entry.name))
    .sort();
  const rules = await Promise.all(ruleFiles.map(loadBuiltInRule));

  return {
    name: metadata.name,
    title: metadata.title,
    description: metadata.description,
    rules
  };
}

async function listPackNames(): Promise<string[]> {
  const entries = await readdir(builtinsRoot(), { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function loadPackMetadata(
  filePath: string
): Promise<BuiltInPackMetadata> {
  const yaml = await readFile(filePath, "utf8");

  try {
    return builtInPackMetadataSchema.parse(parse(yaml));
  } catch (error) {
    if (error instanceof ZodError) {
      throw new RubricError(
        `Invalid built-in pack metadata: ${filePath}\n\n${formatZodIssues(error)}`,
        { cause: error }
      );
    }

    throw error;
  }
}

async function loadBuiltInRule(sourcePath: string): Promise<BuiltInPackRule> {
  const yaml = await readFile(sourcePath, "utf8");

  try {
    const rule = rubricRuleSchema.parse(parse(yaml));

    return {
      id: rule.id,
      sourcePath,
      fileName: basename(sourcePath),
      yaml
    };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new RubricError(
        `Invalid built-in rubric rule: ${sourcePath}\n\n${formatZodIssues(error)}`,
        { cause: error }
      );
    }

    throw error;
  }
}

function builtinsRoot(): string {
  return fileURLToPath(new URL("../builtins", import.meta.url));
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
