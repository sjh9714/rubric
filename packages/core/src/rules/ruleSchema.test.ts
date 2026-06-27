import { describe, expect, it } from "vitest";

import { rubricRuleSchema } from "./ruleSchema.js";

describe("rubricRuleSchema", () => {
  it("rejects unsupported compile targets", () => {
    const result = rubricRuleSchema.safeParse({
      id: "rule.unsupported-target",
      title: "Unsupported target",
      message: "Unsupported target should fail validation.",
      compile: {
        targets: ["coderabbit"]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["compile", "targets", 0]);
  });
});
