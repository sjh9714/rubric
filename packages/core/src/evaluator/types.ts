import type { RubricConfig } from "../config/configSchema.js";
import type { ChangeSet } from "../git/types.js";
import type { RubricRule } from "../rules/ruleSchema.js";

export interface PullRequestMetadata {
  title?: string;
  body?: string;
}

export interface RuleEvaluationInput {
  rules: RubricRule[];
  changeSet: ChangeSet;
  config: RubricConfig;
  pr?: PullRequestMetadata;
}
