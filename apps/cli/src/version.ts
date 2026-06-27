import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface PackageMetadata {
  version?: string;
}

const packageJsonPath = fileURLToPath(
  new URL("../package.json", import.meta.url)
);
const packageJson = JSON.parse(
  readFileSync(packageJsonPath, "utf8")
) as PackageMetadata;

export const packageVersion = packageJson.version ?? "0.0.0";
