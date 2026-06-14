import { Command } from "commander";

import { addAddPackCommand } from "./commands/addPack.js";
import { addCheckCommand } from "./commands/check.js";
import { addCompileCommand } from "./commands/compile.js";
import { addDemoCommand } from "./commands/demo.js";
import { addDoctorCommand } from "./commands/doctor.js";
import { addInitCommand } from "./commands/init.js";

export const productDescription =
  "Preflight checks for AI-generated pull requests.";

export function createCliProgram(): Command {
  const program = new Command();

  program
    .name("rubric")
    .description(productDescription)
    .version("0.0.0")
    .showHelpAfterError()
    .action(() => {
      program.outputHelp();
    });

  addAddPackCommand(program);
  addCheckCommand(program);
  addCompileCommand(program);
  addDemoCommand(program);
  addDoctorCommand(program);
  addInitCommand(program);

  return program;
}

export async function runCli(
  argv: readonly string[] = process.argv
): Promise<void> {
  const program = createCliProgram();

  await program.parseAsync(normalizeCliArgv(argv), { from: "node" });
}

export function normalizeCliArgv(argv: readonly string[]): string[] {
  const normalizedArgv = [...argv];

  if (normalizedArgv[2] === "--") {
    normalizedArgv.splice(2, 1);
  }

  return normalizedArgv;
}
