import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const repository = {
  type: "git",
  url: "git+https://github.com/sjh9714/rubric.git"
};
const patchReleaseVersion = "0.1.1";
const initialReleaseVersion = "0.1.0";
const commonPackageFields = {
  license: "MIT",
  repository,
  bugs: {
    url: "https://github.com/sjh9714/rubric/issues"
  },
  homepage: "https://github.com/sjh9714/rubric#readme",
  publishConfig: {
    access: "public"
  }
};

interface PackageJson {
  [key: string]: unknown;
  dependencies?: Record<string, string>;
  files?: string[];
  keywords?: string[];
  private?: boolean;
  scripts?: Record<string, string>;
  version?: string;
}

describe("publish package metadata", () => {
  it("keeps the root private while defining release scripts", async () => {
    const pkg = await readJson("package.json");

    expect(pkg).toMatchObject({
      name: "rubric",
      version: patchReleaseVersion,
      private: true,
      license: "MIT",
      repository,
      bugs: {
        url: "https://github.com/sjh9714/rubric/issues"
      },
      homepage: "https://github.com/sjh9714/rubric#readme"
    });
    expect(pkg.scripts).toMatchObject({
      "pack:cli":
        "pnpm --filter @rubric-dev/cli pack --pack-destination .artifacts",
      "release:dry-run":
        "pnpm -r --filter @rubric-dev/core --filter @rubric-dev/compiler --filter @rubric-dev/packs --filter @rubric-dev/cli publish --dry-run --no-git-checks",
      "release:dry-run:patch":
        "pnpm -r --filter @rubric-dev/core --filter @rubric-dev/cli publish --dry-run --no-git-checks",
      "smoke:package": "node scripts/smoke-package.mjs"
    });

    expect(pkg.scripts?.["release:dry-run:patch"]).toContain(
      "--filter @rubric-dev/core"
    );
    expect(pkg.scripts?.["release:dry-run:patch"]).toContain(
      "--filter @rubric-dev/cli"
    );
    expect(pkg.scripts?.["release:dry-run:patch"]).not.toContain(
      "--filter @rubric-dev/compiler"
    );
    expect(pkg.scripts?.["release:dry-run:patch"]).not.toContain(
      "--filter @rubric-dev/packs"
    );
  });

  it("makes the CLI package publishable with the rubric binary", async () => {
    const pkg = await readJson("apps/cli/package.json");

    expect(pkg.private).toBeUndefined();
    expect(pkg).toMatchObject({
      name: "@rubric-dev/cli",
      version: patchReleaseVersion,
      description: "CLI for rubric preflight checks.",
      ...commonPackageFields,
      repository: {
        ...repository,
        directory: "apps/cli"
      },
      bin: {
        rubric: "dist/index.js"
      },
      files: ["dist"]
    });
    expect(pkg.keywords).toEqual(
      expect.arrayContaining(["rubric", "cli", "pull-request", "ai"])
    );
    expect(pkg.dependencies).toMatchObject({
      "@rubric-dev/compiler": "workspace:^",
      "@rubric-dev/core": "workspace:^",
      "@rubric-dev/packs": "workspace:^"
    });
  });

  it("makes runtime workspace packages publishable from dist", async () => {
    const packagePaths = [
      {
        path: "packages/core/package.json",
        name: "@rubric-dev/core",
        directory: "packages/core",
        files: ["dist"]
      },
      {
        path: "packages/compiler/package.json",
        name: "@rubric-dev/compiler",
        directory: "packages/compiler",
        files: ["dist"],
        dependency: "@rubric-dev/core"
      },
      {
        path: "packages/packs/package.json",
        name: "@rubric-dev/packs",
        directory: "packages/packs",
        files: ["dist", "builtins"],
        dependency: "@rubric-dev/core"
      }
    ];

    for (const packagePath of packagePaths) {
      const pkg = await readJson(packagePath.path);

      expect(pkg.private).toBeUndefined();
      expect(pkg).toMatchObject({
        name: packagePath.name,
        version:
          packagePath.name === "@rubric-dev/core"
            ? patchReleaseVersion
            : initialReleaseVersion,
        ...commonPackageFields,
        repository: {
          ...repository,
          directory: packagePath.directory
        },
        files: packagePath.files,
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            development: "./src/index.ts",
            import: "./dist/index.js"
          }
        }
      });
      expect(pkg.keywords).toEqual(
        expect.arrayContaining(["rubric", "pull-request", "ai"])
      );

      if (packagePath.dependency !== undefined) {
        expect(pkg.dependencies?.[packagePath.dependency]).toBe("workspace:^");
      }
    }
  });

  it("keeps future integration packages private", async () => {
    for (const path of [
      "packages/action/package.json",
      "packages/github/package.json",
      "packages/llm/package.json"
    ]) {
      const pkg = await readJson(path);

      expect(pkg.private).toBe(true);
      expect(pkg.version).toBe("0.1.0");
    }
  });

  it("runs package smoke testing in CI", async () => {
    const workflow = await readFile(
      `${workspaceRoot}/.github/workflows/ci.yml`,
      "utf8"
    );

    expect(workflow).toContain("Package smoke test");
    expect(workflow).toContain("pnpm smoke:package");
  });
});

async function readJson(path: string): Promise<PackageJson> {
  return JSON.parse(await readFile(`${workspaceRoot}/${path}`, "utf8"));
}
