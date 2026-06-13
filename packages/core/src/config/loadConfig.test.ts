import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { RubricError } from "../errors/RubricError.js";
import { defaultRubricConfig } from "./defaults.js";
import { loadConfig } from "./loadConfig.js";

const fixturesRoot = fileURLToPath(
  new URL("../../../../fixtures/core", import.meta.url)
);

const fixture = (name: string): string => join(fixturesRoot, name);

describe("loadConfig", () => {
  it("returns the default config when .rubric/config.yaml is missing", async () => {
    await expect(loadConfig(fixture("missing-config"))).resolves.toEqual(
      defaultRubricConfig
    );
  });

  it("deep merges a valid config with defaults", async () => {
    const config = await loadConfig(fixture("valid-project"));

    expect(config.project).toEqual({
      name: "rubric-example",
      default_base: "develop",
      package_manager: "pnpm"
    });
    expect(config.paths.tests).toEqual(defaultRubricConfig.paths.tests);
    expect(config.paths.api).toEqual(["server/routes/**"]);
    expect(config.output).toEqual({
      format: "json",
      max_findings: 10
    });
  });

  it("throws RubricError with the file path for invalid YAML", async () => {
    await expect(loadConfig(fixture("invalid-yaml"))).rejects.toMatchObject({
      name: "RubricError",
      message: expect.stringContaining(".rubric/config.yaml")
    });
  });

  it("throws RubricError with schema issue details for invalid config", async () => {
    await expect(loadConfig(fixture("invalid-config"))).rejects.toMatchObject({
      name: "RubricError",
      message: expect.stringContaining("project.default_base")
    });
  });

  it("rejects unsupported output formats", async () => {
    await expect(loadConfig(fixture("invalid-output-format"))).rejects.toThrow(
      RubricError
    );
    await expect(loadConfig(fixture("invalid-output-format"))).rejects.toThrow(
      "output.format"
    );
  });
});
