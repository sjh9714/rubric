import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { loadBuiltInPack } from "./loadBuiltInPacks.js";

export interface CopyPackRulesOptions {
  repoRoot: string;
  packNames: string[];
  force?: boolean;
  dryRun?: boolean;
}

export interface CopiedRule {
  packName: string;
  ruleId: string;
  targetPath: string;
  status: "created" | "overwritten" | "skipped";
}

export interface CopyPackResult {
  copied: CopiedRule[];
}

export async function copyBuiltInPackRules({
  repoRoot,
  packNames,
  force = false,
  dryRun = false
}: CopyPackRulesOptions): Promise<CopyPackResult> {
  const copied: CopiedRule[] = [];
  const rulesDir = join(repoRoot, ".rubric", "rules");

  if (!dryRun) {
    await mkdir(rulesDir, { recursive: true });
  }

  for (const packName of packNames) {
    const pack = await loadBuiltInPack(packName);

    for (const rule of pack.rules) {
      const targetPath = join(rulesDir, rule.fileName);
      const targetExists = await pathExists(targetPath);
      const status = targetExists
        ? force
          ? "overwritten"
          : "skipped"
        : "created";

      copied.push({
        packName: pack.name,
        ruleId: rule.id,
        targetPath,
        status
      });

      if (!dryRun && status !== "skipped") {
        await writeFile(targetPath, rule.yaml);
      }
    }
  }

  return { copied };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
