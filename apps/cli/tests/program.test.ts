import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  createCliProgram,
  normalizeCliArgv,
  productDescription
} from "../src/program.js";
import { packageVersion } from "../src/version.js";

const packageJsonPath = fileURLToPath(
  new URL("../package.json", import.meta.url)
);

describe("rubric CLI help", () => {
  it("renders help with the CLI name and product description", () => {
    const help = createCliProgram().helpInformation();

    expect(help).toContain("Usage: rubric");
    expect(help).toContain(productDescription);
  });

  it("prints help when no arguments are provided", async () => {
    const output: string[] = [];
    const program = createCliProgram();

    program.configureOutput({
      writeOut: (text) => output.push(text),
      writeErr: (text) => output.push(text)
    });

    await program.parseAsync(["node", "rubric"], { from: "node" });

    expect(output.join("")).toContain(productDescription);
  });

  it("normalizes package-manager argument separators", () => {
    expect(normalizeCliArgv(["node", "rubric", "--", "check"])).toEqual([
      "node",
      "rubric",
      "check"
    ]);
  });

  it("reports the CLI package version", async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      version: string;
    };

    expect(packageVersion).toBe(packageJson.version);
    expect(createCliProgram().version()).toBe(packageJson.version);
  });
});
