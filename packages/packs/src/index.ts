export type BootstrapStatus = "bootstrap";

export interface PackageInfo {
  readonly name: string;
  readonly status: BootstrapStatus;
}

export const packageInfo = {
  name: "@rubric-dev/packs",
  status: "bootstrap"
} as const satisfies PackageInfo;

export {
  listBuiltInPacks,
  loadBuiltInPack,
  type BuiltInPack,
  type BuiltInPackRule,
  type BuiltInPackSummary
} from "./loadBuiltInPacks.js";

export {
  copyBuiltInPackRules,
  type CopiedRule,
  type CopyPackResult,
  type CopyPackRulesOptions
} from "./copyPackRules.js";

export {
  builtInPackMetadataSchema,
  type BuiltInPackMetadata
} from "./packSchema.js";
