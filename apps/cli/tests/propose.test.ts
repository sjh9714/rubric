import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { rubricRuleSchema } from "@rubric-dev/core";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dirPath) => rm(dirPath, { force: true, recursive: true }))
  );
});

describe("rubric propose", () => {
  it("prints a valid YAML draft from review feedback text", async () => {
    const result = await runRubric([
      "propose",
      "--from-text",
      "API changes need tests"
    ]);
    const parsed = parse(result.stdout);
    const rule = rubricRuleSchema.parse(parsed);

    expect(result.exitCode).toBe(0);
    expect(rule).toMatchObject({
      id: "proposed.api-changes-need-tests",
      title: "API changes need tests",
      description:
        'Drafted from repeated review feedback: "API changes need tests"',
      severity: "warning",
      applies_to: {
        paths: ["**/*"]
      },
      checks: {},
      message: "API changes need tests.",
      suggestion:
        "Review the matching paths, severity, and checks before committing this rule.",
      compile: {
        targets: ["agents"]
      },
      evidence: {
        source: "manual",
        confidence: 0.5
      }
    });
  });

  it("generates deterministic slugged ids", async () => {
    const result = await runRubric([
      "propose",
      "--from-text",
      "  API   changes need tests!!! "
    ]);
    const rule = rubricRuleSchema.parse(parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(rule.id).toBe("proposed.api-changes-need-tests");
    expect(rule.title).toBe("API changes need tests!!!");
  });

  it("writes a proposal file without requiring a git repository", async () => {
    const dir = await createTempDir();

    const result = await runRubric([
      "propose",
      "--from-text",
      "API changes need tests",
      "--write",
      "--cwd",
      dir
    ]);
    const targetPath = join(
      dir,
      ".rubric/rules/proposed.api-changes-need-tests.yaml"
    );
    const rule = rubricRuleSchema.parse(
      parse(await readFile(targetPath, "utf8"))
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Rubric propose");
    expect(result.stdout).toContain(
      "Created:\n  .rubric/rules/proposed.api-changes-need-tests.yaml"
    );
    expect(rule.id).toBe("proposed.api-changes-need-tests");
  });

  it("fails safely when the proposal file already exists", async () => {
    const dir = await createTempDir();
    const targetPath = join(
      dir,
      ".rubric/rules/proposed.api-changes-need-tests.yaml"
    );
    await mkdir(join(dir, ".rubric/rules"), { recursive: true });
    await writeFile(targetPath, "existing rule\n");

    const result = await runRubric([
      "propose",
      "--from-text",
      "API changes need tests",
      "--write",
      "--cwd",
      dir
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Proposed rule already exists");
    expect(result.stderr).toContain("Use --force to overwrite it.");
    await expect(readFile(targetPath, "utf8")).resolves.toBe("existing rule\n");
  });

  it("overwrites an existing proposal file with --force", async () => {
    const dir = await createTempDir();
    const targetPath = join(
      dir,
      ".rubric/rules/proposed.api-changes-need-tests.yaml"
    );
    await mkdir(join(dir, ".rubric/rules"), { recursive: true });
    await writeFile(targetPath, "existing rule\n");

    const result = await runRubric([
      "propose",
      "--from-text",
      "API changes need tests",
      "--write",
      "--force",
      "--cwd",
      dir
    ]);
    const rule = rubricRuleSchema.parse(
      parse(await readFile(targetPath, "utf8"))
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Overwritten:");
    expect(rule.id).toBe("proposed.api-changes-need-tests");
  });

  it("exits 2 for missing, empty, or unsluggable text", async () => {
    await expect(runRubric(["propose"])).resolves.toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("--from-text")
    });
    await expect(
      runRubric(["propose", "--from-text", "   "])
    ).resolves.toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("--from-text")
    });
    await expect(
      runRubric(["propose", "--from-text", "!!!"])
    ).resolves.toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("Unable to derive a rule id")
    });
  });

  it("lists the command and options in help output", async () => {
    const rootHelp = await runRubric(["--help"]);
    const proposeHelp = await runRubric(["propose", "--help"]);

    expect(rootHelp.exitCode).toBe(0);
    expect(rootHelp.stdout).toContain("propose");
    expect(proposeHelp.exitCode).toBe(0);
    expect(proposeHelp.stdout).toContain("Usage: rubric propose");
    expect(proposeHelp.stdout).toContain("--from-text <text>");
    expect(proposeHelp.stdout).toContain("--write");
    expect(proposeHelp.stdout).toContain("--force");
  });
});

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runRubric(args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      "pnpm",
      [
        "exec",
        "tsx",
        "--conditions=development",
        "apps/cli/src/index.ts",
        ...args
      ],
      {
        cwd: workspaceRoot,
        env: process.env,
        maxBuffer: 50 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        resolve({
          exitCode:
            error !== null && typeof error.code === "number" ? error.code : 0,
          stdout,
          stderr
        });
      }
    );
  });
}

async function createTempDir(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "rubric-propose-")));
  tempDirs.push(dir);
  return dir;
}
