import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RunGitOptions {
  cwd: string;
  args: string[];
}

export async function runGit({ cwd, args }: RunGitOptions): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 50 * 1024 * 1024
  });

  return stdout.trimEnd();
}
