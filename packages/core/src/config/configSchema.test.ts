import { describe, expect, it } from "vitest";

import { defaultRubricConfig } from "./defaults.js";
import { rubricConfigSchema } from "./configSchema.js";

describe("rubricConfigSchema", () => {
  it("rejects unsupported compile targets", () => {
    const result = rubricConfigSchema.safeParse({
      ...defaultRubricConfig,
      compile: {
        ...defaultRubricConfig.compile,
        targets: ["coderabbit"]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["compile", "targets", 0]);
  });
});
