import { describe, expect, it } from "vitest";

import { rubricRuleSchema } from "./ruleSchema.js";

describe("rubricRuleSchema", () => {
  it("accepts evidence quotes", () => {
    const result = rubricRuleSchema.safeParse({
      id: "rule.with-evidence-quote",
      title: "Rule with evidence quote",
      message: "Rule with evidence quote should pass validation.",
      evidence: {
        source: "manual",
        confidence: 0.5,
        quote: "API changes need tests"
      }
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected rule schema parse to succeed.");
    }
    expect(result.data.evidence.quote).toBe("API changes need tests");
  });

  it("rejects empty evidence quotes", () => {
    const result = rubricRuleSchema.safeParse({
      id: "rule.empty-evidence-quote",
      title: "Rule with empty evidence quote",
      message: "Rule with empty evidence quote should fail validation.",
      evidence: {
        source: "manual",
        confidence: 0.5,
        quote: ""
      }
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["evidence", "quote"]);
  });

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
