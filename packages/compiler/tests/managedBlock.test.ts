import { describe, expect, it } from "vitest";

import { upsertManagedBlock } from "../src/managedBlock.js";

describe("managed blocks", () => {
  it("inserts a managed block into an empty file", () => {
    expect(upsertManagedBlock("", "Generated content\n")).toBe(
      "<!-- rubric:begin -->\nGenerated content\n<!-- rubric:end -->\n"
    );
  });

  it("appends a managed block to user content", () => {
    expect(upsertManagedBlock("# Existing\n", "Generated content\n")).toBe(
      "# Existing\n\n<!-- rubric:begin -->\nGenerated content\n<!-- rubric:end -->\n"
    );
  });

  it("replaces an existing managed block", () => {
    const existing =
      "# Existing\n\n<!-- rubric:begin -->\nOld\n<!-- rubric:end -->\n";

    expect(upsertManagedBlock(existing, "New\n")).toBe(
      "# Existing\n\n<!-- rubric:begin -->\nNew\n<!-- rubric:end -->\n"
    );
  });

  it("preserves content before and after a managed block", () => {
    const existing =
      "# Before\n\n<!-- rubric:begin -->\nOld\n<!-- rubric:end -->\n\nAfter\n";

    expect(upsertManagedBlock(existing, "New\n")).toBe(
      "# Before\n\n<!-- rubric:begin -->\nNew\n<!-- rubric:end -->\n\nAfter\n"
    );
  });

  it("ensures output ends with a newline", () => {
    expect(upsertManagedBlock("# Existing", "Generated content")).toMatch(
      /\n$/
    );
  });
});
