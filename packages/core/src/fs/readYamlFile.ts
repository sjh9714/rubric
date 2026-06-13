import { readFile } from "node:fs/promises";

import { parse } from "yaml";

import { RubricError } from "../errors/RubricError.js";

export async function readYamlFile(filePath: string): Promise<unknown> {
  try {
    const source = await readFile(filePath, "utf8");
    return parse(source) ?? {};
  } catch (error) {
    throw new RubricError(
      `Invalid YAML: ${filePath}\n\n${formatError(error)}`,
      {
        cause: error
      }
    );
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
