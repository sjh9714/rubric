import { describe, expect, it } from "vitest";

import { createCliProgram, productDescription } from "../src/program.js";

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
});
