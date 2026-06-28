import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { packageInfo } from "../src/index.js";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

describe("@rubric-dev/action", () => {
  it("exports bootstrap package info", () => {
    expect(packageInfo).toEqual({
      name: "@rubric-dev/action",
      status: "bootstrap"
    });
  });

  it("defines a composite action that runs the published CLI", async () => {
    const action = await readFile(
      `${workspaceRoot}/packages/action/action.yml`,
      "utf8"
    );

    expect(action).toContain("runs:");
    expect(action).toContain("using: composite");
    expect(action).toContain("uses: actions/setup-node@v6");
    expect(action).toContain("node-version: 20");
    expect(action).toContain(
      'npx --yes --package "@rubric-dev/cli@${RUBRIC_CLI_VERSION}" rubric check'
    );
    expect(action).toContain('default: "0.2.0"');
  });

  it("posts or updates one sticky PR comment", async () => {
    const action = await readFile(
      `${workspaceRoot}/packages/action/action.yml`,
      "utf8"
    );

    expect(action).toContain("<!-- rubric:preflight -->");
    expect(action).toContain("uses: actions/github-script@v8");
    expect(action).toContain("github.rest.issues.listComments");
    expect(action).toContain("github.rest.issues.updateComment");
    expect(action).toContain("github.rest.issues.createComment");
  });

  it("requires a token only when pull request comments are enabled", async () => {
    const action = await readFile(
      `${workspaceRoot}/packages/action/action.yml`,
      "utf8"
    );

    expect(action).toContain("Validate GitHub comment token");
    expect(action).toContain("COMMENT_ENABLED: ${{ inputs.comment }}");
    expect(action).toContain("GITHUB_TOKEN_INPUT: ${{ inputs.github-token }}");
    expect(action).toContain(
      'if [ "$COMMENT_ENABLED" = "true" ] && [ "$GITHUB_EVENT_NAME" = "pull_request" ] && [ -z "$GITHUB_TOKEN_INPUT" ]; then'
    );
    expect(action).toContain(
      "Set the github-token input or set comment: false."
    );
  });

  it("fails after commenting when blocking findings are configured to fail", async () => {
    const action = await readFile(
      `${workspaceRoot}/packages/action/action.yml`,
      "utf8"
    );

    expect(action).toContain("RUBRIC_EXIT_CODE");
    expect(action).toContain("FAIL_ON_BLOCKING");
    expect(action).toContain('if [ "$RUBRIC_EXIT_CODE" = "1" ]');
    expect(action).toContain("exit 1");
  });
});
