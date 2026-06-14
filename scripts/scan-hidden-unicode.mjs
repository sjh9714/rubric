import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { TextDecoder } from "node:util";

const hiddenCharacters = [
  [0x2028, "LINE_SEPARATOR"],
  [0x2029, "PARAGRAPH_SEPARATOR"],
  [0x200b, "ZERO_WIDTH_SPACE"],
  [0x200c, "ZERO_WIDTH_NON_JOINER"],
  [0x200d, "ZERO_WIDTH_JOINER"],
  [0x200e, "LEFT_TO_RIGHT_MARK"],
  [0x200f, "RIGHT_TO_LEFT_MARK"],
  [0x061c, "ARABIC_LETTER_MARK"],
  [0x202a, "LRE"],
  [0x202b, "RLE"],
  [0x202c, "PDF"],
  [0x202d, "LRO"],
  [0x202e, "RLO"],
  [0x2066, "LRI"],
  [0x2067, "RLI"],
  [0x2068, "FSI"],
  [0x2069, "PDI"],
  [0xfeff, "BOM"]
].map(([codePoint, name]) => ({
  character: String.fromCodePoint(codePoint),
  name
}));

const textExtensions = new Set([
  ".cjs",
  ".gitignore",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".npmrc",
  ".prettierignore",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);
const textBasenames = new Set([
  ".gitignore",
  ".npmrc",
  ".prettierignore",
  "AGENTS.md",
  "CLAUDE.md",
  "README.md"
]);
const skipDirectories = new Set([".git", "node_modules", "dist", "coverage"]);
const decoder = new TextDecoder("utf-8", {
  fatal: true
});

const paths = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  {
    encoding: "buffer"
  }
)
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .filter(shouldScanPath);

const issues = [];

for (const path of paths) {
  const data = readFileSync(path);
  let text;

  try {
    text = decoder.decode(data);
  } catch {
    continue;
  }

  collectLineEndingIssues(path, data, issues);
  collectHiddenCharacterIssues(path, text, issues);
}

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(`${issue.path}:${issue.line}: ${issue.message}`);
  }

  process.exitCode = 1;
} else {
  console.log(
    "No hidden Unicode separators, bidi controls, zero-width marks, BOM, CRLF/CR line endings, or missing final LF found."
  );
}

function shouldScanPath(path) {
  const parts = path.split(/[\\/]/);

  if (parts.some((part) => skipDirectories.has(part))) {
    return false;
  }

  const name = basename(path);
  return textExtensions.has(extname(path)) || textBasenames.has(name);
}

function collectLineEndingIssues(path, data, target) {
  for (let index = 0; index < data.length; index += 1) {
    if (data[index] !== 13) {
      continue;
    }

    target.push({
      path,
      line: lineNumberForByteOffset(data, index),
      message: data[index + 1] === 10 ? "CRLF_LINE_ENDING" : "CR_LINE_ENDING"
    });
  }

  if (data.length > 0 && data[data.length - 1] !== 10) {
    target.push({
      path,
      line: lineNumberForByteOffset(data, data.length - 1),
      message: "MISSING_FINAL_LF"
    });
  }
}

function collectHiddenCharacterIssues(path, text, target) {
  const lines = text.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];

    for (const { character, name } of hiddenCharacters) {
      if (line.includes(character)) {
        target.push({
          path,
          line: lineIndex + 1,
          message: name
        });
      }
    }
  }
}

function lineNumberForByteOffset(data, offset) {
  let line = 1;

  for (let index = 0; index < offset; index += 1) {
    if (data[index] === 10) {
      line += 1;
    }
  }

  return line;
}
