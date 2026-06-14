import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

describe("README CLI status", () => {
  it("keeps launch markdown readable with physical line breaks", async () => {
    const readme = await readFile(`${workspaceRoot}/README.md`, "utf8");
    const physicalLines = readme.split(/\r?\n/);

    expect(physicalLines.length).toBeGreaterThanOrEqual(40);
    expect(readme).toContain("# rubric\n\nPreflight checks");
    expect(readme).toContain("```bash\nnpx @rubric-dev/cli demo\n```");
    expect(readme).toMatch(/\| Command\s+\| What it does\s+\|/);
    expect(readme).toContain("## Privacy");
    expect(readme).toContain("## Not yet");
  });

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

  it("documents scoped npx usage and installed binary", async () => {
    const readme = await readFile(`${workspaceRoot}/README.md`, "utf8");

    expect(readme).toContain("npx @rubric-dev/cli demo");
    expect(readme).toContain("installs the `rubric` binary");
    expect(readme).toContain("pnpm --filter @rubric-dev/cli dev -- demo");
    expect(readme).not.toContain("npx rubric demo");
  });
});
