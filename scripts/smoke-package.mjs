#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  "@rubric-dev/core",
  "@rubric-dev/compiler",
  "@rubric-dev/packs",
  "@rubric-dev/cli"
];

const tempRoot = await mkdtemp(join(tmpdir(), "rubric-package-smoke-"));

try {
  const packDir = join(tempRoot, "packs");
  const installDir = join(tempRoot, "install");
  const sampleRepo = join(tempRoot, "sample-repo");

  await mkdir(packDir, { recursive: true });
  await mkdir(installDir, { recursive: true });
  await mkdir(sampleRepo, { recursive: true });

  const tarballs = await packPackages(packDir);
  await assertPackedManifests(tarballs);
  await run("npm", ["init", "-y"], { cwd: installDir });
  await run(
    "npm",
    ["install", "--ignore-scripts", ...tarballs.map((tarball) => tarball.path)],
    { cwd: installDir }
  );
  await run("git", ["init", "--initial-branch=master"], { cwd: sampleRepo });

  const rubricBin = join(installDir, "node_modules/.bin/rubric");

  await run(rubricBin, ["--help"], { cwd: installDir });
  await run(rubricBin, ["demo"], { cwd: installDir });
  await run(rubricBin, ["add-pack", "--list"], { cwd: installDir });
  await run(rubricBin, ["init", "--dry-run", "--cwd", sampleRepo], {
    cwd: installDir
  });

  console.log("Package smoke test passed.");
} finally {
  if (process.env.RUBRIC_KEEP_SMOKE_TEMP === "1") {
    console.log(`Kept smoke test temp directory: ${tempRoot}`);
  } else {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function packPackages(packDir) {
  const tarballs = [];

  for (const packageName of packages) {
    const { stdout } = await run(
      "pnpm",
      [
        "--filter",
        packageName,
        "pack",
        "--pack-destination",
        packDir,
        "--json"
      ],
      { cwd: repoRoot }
    );
    const packResult = parsePackJson(stdout);

    tarballs.push({
      name: packageName,
      path: packResult.filename
    });
  }

  return tarballs;
}

async function assertPackedManifests(tarballs) {
  for (const tarball of tarballs) {
    const { stdout } = await run(
      "tar",
      ["-xOf", tarball.path, "package/package.json"],
      { cwd: repoRoot }
    );
    const manifest = JSON.parse(stdout);

    assert(
      manifest.name === tarball.name,
      `Packed manifest name mismatch for ${tarball.name}`
    );
    assertNoWorkspaceRanges(manifest, manifest.name);

    if (manifest.name === "@rubric-dev/cli") {
      assert(
        manifest.bin?.rubric === "dist/index.js",
        "CLI package must publish the rubric binary"
      );
    }

    if (manifest.name === "@rubric-dev/packs") {
      assert(
        manifest.files?.includes("builtins"),
        "@rubric-dev/packs must include builtins"
      );
    }
  }
}

function assertNoWorkspaceRanges(manifest, packageName) {
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies"
  ]) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      assert(
        typeof range === "string" && !range.startsWith("workspace:"),
        `${packageName} still has workspace range for ${name}`
      );
    }
  }
}

function parsePackJson(stdout) {
  const trimmed = stdout.trim();

  if (trimmed.length === 0) {
    throw new Error("pnpm pack returned no JSON output");
  }

  const parsed = JSON.parse(trimmed);
  const result = Array.isArray(parsed) ? parsed[0] : parsed;

  assert(result?.filename, "pnpm pack JSON did not include filename");

  return result;
}

async function run(command, args, options) {
  try {
    return await execFileAsync(command, args, {
      ...options,
      env: process.env,
      maxBuffer: 50 * 1024 * 1024
    });
  } catch (error) {
    const stderr = error.stderr ? `\n${error.stderr}` : "";
    const stdout = error.stdout ? `\n${error.stdout}` : "";

    throw new Error(
      `Command failed: ${command} ${args.join(" ")}${stdout}${stderr}`,
      { cause: error }
    );
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
