import type { ChangeSet, Finding } from "@rubric-dev/core";

export type CheckOutputFormat = "text" | "json" | "markdown";

export interface CheckResult {
  repoRoot: string;
  baseRef: string;
  headRef: string;
  rulesCount: number;
  changeSet: ChangeSet | null;
  findings: Finding[];
  blockingFindings: Finding[];
  message?: string;
}
