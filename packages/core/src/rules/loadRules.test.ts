import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { RubricError } from "../errors/RubricError.js";
import { loadRules } from "./loadRules.js";

const fixturesRoot = fileURLToPath(
  new URL("../../../../fixtures/core", import.meta.url)
);

const fixture = (name: string): string => join(fixturesRoot, name);

describe("loadRules", () => {
  it("returns an empty list when .rubric/rules is missing", async () => {
    await expect(loadRules(fixture("missing-config"))).resolves.toEqual([]);
  });

  it("loads yaml and yml rules sorted by id", async () => {
    const rules = await loadRules(fixture("valid-project"));

    expect(rules.map((rule) => rule.id)).toEqual([
      "db.migration-rollback-note",
      "testing.required-for-api-change"
    ]);
  });

  it("throws RubricError with the file path for invalid rules", async () => {
    await expect(loadRules(fixture("invalid-rule"))).rejects.toThrow(
      RubricError
    );
    await expect(loadRules(fixture("invalid-rule"))).rejects.toMatchObject({
      name: "RubricError",
      message: expect.stringContaining(".rubric/rules/broken.yaml")
    });
  });

  it("throws RubricError with both file paths for duplicate ids", async () => {
    await expect(loadRules(fixture("duplicate-rules"))).rejects.toMatchObject({
      name: "RubricError",
      message: expect.stringContaining("duplicate.rule")
    });
    await expect(loadRules(fixture("duplicate-rules"))).rejects.toThrow(
      "one.yaml"
    );
    await expect(loadRules(fixture("duplicate-rules"))).rejects.toThrow(
      "two.yml"
    );
  });

  it("applies rule defaults", async () => {
    const [rule] = await loadRules(fixture("rule-defaults"));

    expect(rule).toMatchObject({
      id: "defaults.rule",
      severity: "warning",
      applies_to: {
        paths: ["**/*"]
      },
      compile: {
        targets: ["agents"]
      },
      evidence: {
        source: "manual",
        confidence: 0.5
      }
    });
  });
});
