import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

describe("README CLI status", () => {
  it("lists current commands as implemented instead of planned", async () => {
    const readme = await readFile(`${workspaceRoot}/README.md`, "utf8");
    const [, afterImplemented = ""] = readme.split("Implemented:");
    const [implementedSection = "", afterPlanned = ""] =
      afterImplemented.split("Planned:");
    const [plannedSection = ""] = afterPlanned.split("## Quick local usage");

    expect(implementedSection).toContain("`rubric demo`");
    expect(implementedSection).toContain("`rubric compile`");
    expect(implementedSection).toContain("`rubric doctor`");
    expect(plannedSection).not.toContain("`rubric demo`");
    expect(plannedSection).not.toContain("`rubric compile`");
    expect(plannedSection).not.toContain("`rubric doctor`");
  });
});
