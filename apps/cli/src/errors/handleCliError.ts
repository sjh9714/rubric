import { RubricError } from "@rubric-dev/core";

export interface CliErrorOptions {
  debug?: boolean;
  stderr?: NodeJS.WritableStream;
}

export function handleCliError(
  error: unknown,
  { debug = false, stderr = process.stderr }: CliErrorOptions = {}
): 2 | 3 {
  if (error instanceof RubricError) {
    stderr.write(`${error.message}\n`);
    return 2;
  }

  if (debug && error instanceof Error && error.stack !== undefined) {
    stderr.write(`${error.stack}\n`);
  } else {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`Unexpected error: ${message}\n`);
  }

  return 3;
}
