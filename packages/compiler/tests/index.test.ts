import { describe, expect, it } from "vitest";

import { packageInfo } from "../src/index.js";

describe("@rubric-dev/compiler", () => {
  it("exports bootstrap package info", () => {
    expect(packageInfo).toEqual({
      name: "@rubric-dev/compiler",
      status: "bootstrap"
    });
  });
});
