import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import {
  defaultRubricConfig,
  RubricError,
  type RubricConfig,
  type RubricRule
} from "@rubric-dev/core";

import { compileRules, type CompileTarget } from "../src/index.js";

const tempRepos: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRepos
      .splice(0)
      .map((repoPath) => rm(repoPath, { force: true, recursive: true }))
  );
});

describe("compileRules", () => {
  it("compiles AGENTS.md from rules", async () => {
    const repoRoot = await createRepoRoot();

    const result = await compileRules({
      repoRoot,
      rules: [rule()],
      config: config(["agents"])
    });
    const agents = await read(repoRoot, "AGENTS.md");

    expect(result.files).toContainEqual({
      path: "AGENTS.md",
      status: "created"
    });
    expect(agents).toContain("<!-- rubric:begin -->");
    expect(agents).toContain("API changes require tests");
    expect(agents).toContain("Rule ID: `testing.required-for-api-change`");
    expect(agents).toContain("Severity: error");
    expect(agents).toContain("This PR changes API code");
    expect(agents).toContain("Add or update tests");
    expect(agents).toContain("`src/api/**`");
  });

  it("compiles CLAUDE.md with AGENTS.md import", async () => {
    const repoRoot = await createRepoRoot();

    await compileRules({
      repoRoot,
      rules: [rule({ compile: { targets: ["claude"] } })],
      config: config(["claude"])
    });
    const claude = await read(repoRoot, "CLAUDE.md");

    expect(claude.startsWith("@AGENTS.md\n\n")).toBe(true);
    expect(claude).toContain("Claude Code notes");
    expect(claude).toContain("API changes require tests");
  });

  it("compiles Copilot instructions", async () => {
    const repoRoot = await createRepoRoot();

    await compileRules({
      repoRoot,
      rules: [rule({ compile: { targets: ["copilot"] } })],
      config: config(["copilot"])
    });

    await expect(
      read(repoRoot, ".github/copilot-instructions.md")
    ).resolves.toContain("Rubric-generated Copilot instructions");
    await expect(
      read(repoRoot, ".github/instructions/rubric.instructions.md")
    ).resolves.toContain('applyTo: "**"');
  });

  it("compiles Cursor rules", async () => {
    const repoRoot = await createRepoRoot();

    await compileRules({
      repoRoot,
      rules: [rule({ compile: { targets: ["cursor"] } })],
      config: config(["cursor"])
    });
    const cursor = await read(repoRoot, ".cursor/rules/rubric.mdc");

    expect(cursor).toContain("alwaysApply: true");
    expect(cursor).toContain("API changes require tests");
  });

  it("compiles the PR template", async () => {
    const repoRoot = await createRepoRoot();

    await compileRules({
      repoRoot,
      rules: [rule({ compile: { targets: ["pr_template"] } })],
      config: config(["pr_template"])
    });
    const template = await read(repoRoot, ".github/pull_request_template.md");

    expect(template).toContain("## Rubric");
    expect(template).toContain("rubric check --base main");
    expect(template).toContain("API changes require tests");
  });

  it("does not write files during dry runs", async () => {
    const repoRoot = await createRepoRoot();

    const result = await compileRules({
      repoRoot,
      rules: [rule()],
      config: config(["agents"]),
      dryRun: true
    });

    expect(result.files).toContainEqual({
      path: "AGENTS.md",
      status: "would_create"
    });
    await expect(access(join(repoRoot, "AGENTS.md"))).rejects.toThrow();
  });

  it("returns no generated files when no rules exist", async () => {
    const repoRoot = await createRepoRoot();

    const result = await compileRules({
      repoRoot,
      rules: [],
      config: config(["agents"])
    });

    expect(result.files).toEqual([]);
    expect(result.rulesCount).toBe(0);
    await expect(access(join(repoRoot, "AGENTS.md"))).rejects.toThrow();
  });

  it("skips targets without matching rules", async () => {
    const repoRoot = await createRepoRoot();

    const result = await compileRules({
      repoRoot,
      rules: [rule({ compile: { targets: ["agents"] } })],
      config: config(["cursor"])
    });

    expect(result.files).toEqual([]);
    expect(result.rulesCount).toBe(1);
    expect(result.targets).toEqual(["cursor"]);
    await expect(
      access(join(repoRoot, ".cursor/rules/rubric.mdc"))
    ).rejects.toThrow();
  });

  it("preserves existing user content outside managed blocks", async () => {
    const repoRoot = await createRepoRoot();
    await writeFile(join(repoRoot, "AGENTS.md"), "# Existing\n\nKeep me.\n");

    await compileRules({
      repoRoot,
      rules: [rule()],
      config: config(["agents"])
    });
    const agents = await read(repoRoot, "AGENTS.md");

    expect(agents).toContain("# Existing");
    expect(agents).toContain("Keep me.");
    expect(agents).toContain("<!-- rubric:begin -->");
  });

  it("filters rules by target", async () => {
    const repoRoot = await createRepoRoot();

    await compileRules({
      repoRoot,
      rules: [
        rule({
          id: "rule.agents-only",
          title: "Agents only",
          compile: { targets: ["agents"] }
        }),
        rule({
          id: "rule.claude-only",
          title: "Claude only",
          compile: { targets: ["claude"] }
        })
      ],
      config: config(["claude"])
    });
    const claude = await read(repoRoot, "CLAUDE.md");

    expect(claude).toContain("Claude only");
    expect(claude).not.toContain("Agents only");
  });

  it("throws for unsupported config targets", async () => {
    const repoRoot = await createRepoRoot();

    await expect(
      compileRules({
        repoRoot,
        rules: [rule()],
        config: config(["coderabbit" as CompileTarget])
      })
    ).rejects.toThrow(RubricError);
  });

  it("throws when an existing target path cannot be read as a file", async () => {
    const repoRoot = await createRepoRoot();
    await mkdir(join(repoRoot, "AGENTS.md"));

    await expect(
      compileRules({
        repoRoot,
        rules: [rule()],
        config: config(["agents"])
      })
    ).rejects.toThrow(RubricError);
    await expect(
      compileRules({
        repoRoot,
        rules: [rule()],
        config: config(["agents"])
      })
    ).rejects.toThrow("Unable to read");
  });
});

async function createRepoRoot(): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), "rubric-compiler-"));
  tempRepos.push(repoRoot);
  return repoRoot;
}

async function read(repoRoot: string, path: string): Promise<string> {
  return readFile(join(repoRoot, path), "utf8");
}

function config(targets: CompileTarget[]): RubricConfig {
  return {
    ...defaultRubricConfig,
    compile: {
      ...defaultRubricConfig.compile,
      targets
    }
  };
}

function rule(overrides: Partial<RubricRule> = {}): RubricRule {
  return {
    id: "testing.required-for-api-change",
    title: "API changes require tests",
    description: "API behavior changes should include matching tests.",
    severity: "error",
    applies_to: {
      paths: ["src/api/**"]
    },
    checks: {
      required_changed_files: {
        any: ["tests/**/*.test.ts"]
      }
    },
    message: "This PR changes API code but does not modify any test files.",
    suggestion: "Add or update tests covering the changed API behavior.",
    compile: {
      targets: ["agents"]
    },
    evidence: {
      source: "manual",
      confidence: 0.85
    },
    ...overrides
  };
}
