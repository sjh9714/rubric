import { describe, expect, it } from "vitest";

import { packageInfo } from "../src/index.js";

describe("@rubric-dev/action", () => {
  it("exports bootstrap package info", () => {
    expect(packageInfo).toEqual({
      name: "@rubric-dev/action",
      status: "bootstrap"
    });
  });
});
