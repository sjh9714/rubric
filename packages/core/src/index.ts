export type BootstrapStatus = "bootstrap";

export interface PackageInfo {
  readonly name: string;
  readonly status: BootstrapStatus;
}

export const packageInfo = {
  name: "@rubric-dev/core",
  status: "bootstrap"
} as const satisfies PackageInfo;

export { RubricError } from "./errors/RubricError.js";

export {
  compileTargetSchema,
  rubricConfigSchema,
  severitySchema,
  type RubricConfig
} from "./config/configSchema.js";
export { defaultRubricConfig } from "./config/defaults.js";
export { loadConfig } from "./config/loadConfig.js";

export { rubricRuleSchema, type RubricRule } from "./rules/ruleSchema.js";
export { loadRules } from "./rules/loadRules.js";

export {
  collectChangeSet,
  collectNameStatus,
  collectNumstat,
  collectPatch,
  findGitRoot,
  getMergeBase,
  type ChangedFile,
  type ChangedFileStatus,
  type ChangeSet,
  type ChangeStats,
  type CollectChangeSetOptions,
  type DiffOptions,
  type FileStat,
  type FindGitRootOptions,
  type MergeBaseOptions
} from "./git/index.js";

export {
  evaluateRules,
  type PullRequestMetadata,
  type RuleEvaluationInput
} from "./evaluator/index.js";

export {
  type Finding,
  type FindingEvidence,
  type FindingSeverity
} from "./findings/index.js";
