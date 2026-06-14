import { RubricError } from "@rubric-dev/core";

export const managedBlockBegin = "<!-- rubric:begin -->";
export const managedBlockEnd = "<!-- rubric:end -->";

export function upsertManagedBlock(
  existingContents: string,
  generatedContents: string,
  options: {
    path?: string;
  } = {}
): string {
  const managedBlock = renderManagedBlock(generatedContents);

  if (existingContents.trim().length === 0) {
    return managedBlock;
  }

  const beginIndex = existingContents.indexOf(managedBlockBegin);
  const endIndex = existingContents.indexOf(managedBlockEnd);

  if (beginIndex === -1 && endIndex === -1) {
    return `${ensureTrailingNewline(existingContents).trimEnd()}\n\n${managedBlock}`;
  }

  if (beginIndex !== -1 && endIndex !== -1 && endIndex > beginIndex) {
    const endOffset = endIndex + managedBlockEnd.length;
    return ensureTrailingNewline(
      `${existingContents.slice(0, beginIndex)}${managedBlock.trimEnd()}${existingContents.slice(endOffset)}`
    );
  }

  const location =
    options.path === undefined ? "target file" : `target file ${options.path}`;
  throw new RubricError(`malformed Rubric managed block in ${location}`);
}

function renderManagedBlock(contents: string): string {
  return `${managedBlockBegin}\n${ensureTrailingNewline(contents)}${managedBlockEnd}\n`;
}

function ensureTrailingNewline(contents: string): string {
  return contents.endsWith("\n") ? contents : `${contents}\n`;
}
