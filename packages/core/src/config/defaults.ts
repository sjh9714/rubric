import type { RubricConfig } from "./configSchema.js";

export const defaultRubricConfig = {
  version: 1,
  project: {
    name: null,
    default_base: "main",
    package_manager: null
  },
  modes: {
    check: {
      fail_on: ["error"],
      warn_on: ["warning", "info"]
    }
  },
  paths: {
    tests: ["**/*.test.ts", "**/*.spec.ts", "tests/**"],
    api: ["app/api/**", "src/api/**", "src/controllers/**"],
    migrations: ["db/migrations/**", "prisma/migrations/**"],
    docs: ["docs/**", "README.md"]
  },
  compile: {
    targets: ["agents", "claude", "copilot", "cursor", "pr_template"],
    managed_header: true
  },
  privacy: {
    send_code_to_llm: false,
    send_review_comments_to_llm: false,
    redact_secrets: true
  },
  output: {
    format: "text",
    max_findings: 20
  }
} as const satisfies RubricConfig;
