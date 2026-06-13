export type BootstrapStatus = "bootstrap";

export interface PackageInfo {
  readonly name: string;
  readonly status: BootstrapStatus;
}

export const packageInfo = {
  name: "@rubric-dev/action",
  status: "bootstrap"
} as const satisfies PackageInfo;
