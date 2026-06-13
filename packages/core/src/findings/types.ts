export type FindingSeverity = "error" | "warning" | "info";

export interface FindingEvidence {
  kind:
    | "changed_file"
    | "missing_changed_file"
    | "forbidden_changed_file"
    | "missing_pr_body_section"
    | "changed_directories"
    | "added_pattern"
    | "rule_config";
  path?: string;
  line?: number;
  text?: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  title: string;
  severity: FindingSeverity;
  message: string;
  suggestion?: string;
  files: string[];
  evidence: FindingEvidence[];
  deterministic: true;
  blocking: boolean;
}
