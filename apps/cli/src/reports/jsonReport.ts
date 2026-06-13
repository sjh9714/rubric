import type { CheckResult } from "./types.js";

export function renderJsonReport(result: CheckResult): string {
  return `${JSON.stringify(
    {
      repoRoot: result.repoRoot,
      baseRef: result.baseRef,
      headRef: result.headRef,
      rulesCount: result.rulesCount,
      stats: result.changeSet?.stats ?? null,
      findings: result.findings,
      blockingFindings: result.blockingFindings,
      message: result.message
    },
    null,
    2
  )}\n`;
}
