import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

const hiddenCodePoints = [
  0x2028, 0x2029, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x061c, 0x202a,
  0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff
];

async function expectLfTextFile(path: string, minimumLfCount: number) {
  const bytes = await readFile(`${workspaceRoot}/${path}`);
  const lfCount = Array.from(bytes).filter((byte) => byte === 0x0a).length;

  expect(lfCount).toBeGreaterThanOrEqual(minimumLfCount);
  expect(bytes.includes(0x0d)).toBe(false);
  expect(bytes.at(-1)).toBe(0x0a);
  expect(bytes.at(-2)).not.toBe(0x0a);

  for (const codePoint of hiddenCodePoints) {
    expect(bytes.includes(Buffer.from(String.fromCodePoint(codePoint)))).toBe(
      false
    );
  }
}

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

  it("shows a concise demo output example", async () => {
    const readme = await readFile(`${workspaceRoot}/README.md`, "utf8");

    expect(readme).toContain("## Example output");
    expect(readme).toContain("Rubric demo");
    expect(readme).toContain("Rules checked: 5");
    expect(readme).toContain("Findings: 3");
    expect(readme).toContain("testing.required-for-api-change");
    expect(readme).toContain("db.destructive-migration-warning");
    expect(readme).toContain("pr.too-broad");
  });

  it("keeps launch markdown and tests encoded with real LF bytes", async () => {
    await expectLfTextFile("README.md", 70);
    await expectLfTextFile("apps/cli/tests/readme.test.ts", 20);
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
    expect(implementedSection).toContain("GitHub Action comment mode");
    expect(plannedSection).not.toContain("`rubric demo`");
    expect(plannedSection).not.toContain("`rubric compile`");
    expect(plannedSection).not.toContain("`rubric doctor`");
    expect(plannedSection).not.toContain("GitHub Action comment mode");
  });

  it("documents the GitHub Action comment workflow", async () => {
    const readme = await readFile(`${workspaceRoot}/README.md`, "utf8");

    expect(readme).toContain("sjh9714/rubric/packages/action@v0.2.0");
    expect(readme).toContain("rubric init --github-comment");
    expect(readme).toContain("github-token: ${{ secrets.GITHUB_TOKEN }}");
    expect(readme).toContain("pull-requests: write");
    expect(readme).toContain("issues: write");
  });

  it("documents scoped npx usage and installed binary", async () => {
    const readme = await readFile(`${workspaceRoot}/README.md`, "utf8");

    expect(readme).toContain("npx @rubric-dev/cli demo");
    expect(readme).toContain("installs the `rubric` binary");
    expect(readme).toContain("pnpm --filter @rubric-dev/cli dev -- demo");
    expect(readme).not.toContain("npx rubric demo");
  });
});
