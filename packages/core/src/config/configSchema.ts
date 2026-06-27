import { z } from "zod";

export const severitySchema = z.enum(["error", "warning", "info"]);

export const compileTargetSchema = z.enum([
  "agents",
  "claude",
  "copilot",
  "cursor",
  "pr_template"
]);

const nonEmptyStringArraySchema = z.array(z.string().min(1));

export const rubricConfigSchema = z.object({
  version: z.literal(1),
  project: z.object({
    name: z.string().min(1).nullable(),
    default_base: z.string().min(1),
    package_manager: z.string().min(1).nullable()
  }),
  modes: z.object({
    check: z.object({
      fail_on: z.array(severitySchema),
      warn_on: z.array(severitySchema)
    })
  }),
  paths: z.object({
    tests: nonEmptyStringArraySchema,
    api: nonEmptyStringArraySchema,
    migrations: nonEmptyStringArraySchema,
    docs: nonEmptyStringArraySchema
  }),
  compile: z.object({
    targets: z.array(compileTargetSchema),
    managed_header: z.boolean()
  }),
  privacy: z.object({
    send_code_to_llm: z.boolean(),
    send_review_comments_to_llm: z.boolean(),
    redact_secrets: z.boolean()
  }),
  output: z.object({
    format: z.enum(["text", "json", "markdown", "github"]),
    max_findings: z.number().int().positive()
  })
});

export type RubricConfig = z.infer<typeof rubricConfigSchema>;
