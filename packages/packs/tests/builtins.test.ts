import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { parse } from "yaml";
import { afterEach, describe, expect, it } from "vitest";

import { RubricError, rubricRuleSchema } from "@rubric-dev/core";
import {
  copyBuiltInPackRules,
  listBuiltInPacks,
  loadBuiltInPack
} from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

describe("built-in packs", () => {
  it("lists the expected built-in packs", async () => {
    const packs = await listBuiltInPacks();

    expect(packs.map((pack) => pack.name)).toEqual([
      "base",
      "migrations",
      "node",
      "security",
      "testing"
    ]);
    expect(packs.find((pack) => pack.name === "testing")).toMatchObject({
      title: "Testing rules",
      rulesCount: 2
    });
  });

  it("loads pack metadata and rules", async () => {
    const pack = await loadBuiltInPack("testing");

    expect(pack).toMatchObject({
      name: "testing",
      title: "Testing rules"
    });
    expect(pack.rules.map((rule) => rule.id)).toEqual([
      "testing.required-for-api-change",
      "testing.required-for-auth-change"
    ]);
    expect(pack.rules[0]).toMatchObject({
      fileName: "testing.required-for-api-change.yaml"
    });
  });

  it("throws RubricError with available names for unknown packs", async () => {
    await expect(loadBuiltInPack("unknown")).rejects.toThrow(RubricError);
    await expect(loadBuiltInPack("unknown")).rejects.toThrow("unknown");
    await expect(loadBuiltInPack("unknown")).rejects.toThrow("testing");
  });

  it("validates all built-in rule YAML against the core rule schema", async () => {
    const packs = await listBuiltInPacks();

    for (const packSummary of packs) {
      const pack = await loadBuiltInPack(packSummary.name);

      for (const rule of pack.rules) {
        expect(() => rubricRuleSchema.parse(parse(rule.yaml))).not.toThrow();
      }
    }
  });

  it("copies built-in rules into .rubric/rules", async () => {
    const repoRoot = await makeTempDir();

    const result = await copyBuiltInPackRules({
      repoRoot,
      packNames: ["testing"]
    });

    expect(result.copied.map((rule) => rule.status)).toEqual([
      "created",
      "created"
    ]);
    await expect(
      readFile(
        join(repoRoot, ".rubric/rules/testing.required-for-api-change.yaml"),
        "utf8"
      )
    ).resolves.toContain("id: testing.required-for-api-change");
  });

  it("skips existing rule files by default", async () => {
    const repoRoot = await makeTempDir();
    const targetPath = join(
      repoRoot,
      ".rubric/rules/testing.required-for-api-change.yaml"
    );
    await write(targetPath, "custom rule\n");

    const result = await copyBuiltInPackRules({
      repoRoot,
      packNames: ["testing"]
    });

    expect(
      result.copied.find(
        (rule) => rule.ruleId === "testing.required-for-api-change"
      )
    ).toMatchObject({
      status: "skipped"
    });
    await expect(readFile(targetPath, "utf8")).resolves.toBe("custom rule\n");
  });

  it("overwrites existing rule files with force", async () => {
    const repoRoot = await makeTempDir();
    const targetPath = join(
      repoRoot,
      ".rubric/rules/testing.required-for-api-change.yaml"
    );
    await write(targetPath, "custom rule\n");

    const result = await copyBuiltInPackRules({
      repoRoot,
      packNames: ["testing"],
      force: true
    });

    expect(
      result.copied.find(
        (rule) => rule.ruleId === "testing.required-for-api-change"
      )
    ).toMatchObject({
      status: "overwritten"
    });
    await expect(readFile(targetPath, "utf8")).resolves.toContain(
      "id: testing.required-for-api-change"
    );
  });

  it("does not write files during dry runs", async () => {
    const repoRoot = await makeTempDir();

    const result = await copyBuiltInPackRules({
      repoRoot,
      packNames: ["testing"],
      dryRun: true
    });

    expect(result.copied.map((rule) => rule.status)).toEqual([
      "created",
      "created"
    ]);
    await expect(
      readFile(
        join(repoRoot, ".rubric/rules/testing.required-for-api-change.yaml"),
        "utf8"
      )
    ).rejects.toThrow();
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "rubric-packs-"));
  tempDirs.push(dir);
  return dir;
}

async function write(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}
