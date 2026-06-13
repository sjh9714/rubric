import { Command } from "commander";

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

  return program;
}

export async function runCli(
  argv: readonly string[] = process.argv
): Promise<void> {
  const program = createCliProgram();

  await program.parseAsync([...argv], { from: "node" });
}
