#!/usr/bin/env node
import { handleCliError } from "./errors/handleCliError.js";
import { runCli } from "./program.js";

runCli(process.argv).catch((error: unknown) => {
  process.exitCode = handleCliError(error, {
    debug: process.argv.includes("--debug")
  });
});
