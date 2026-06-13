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
