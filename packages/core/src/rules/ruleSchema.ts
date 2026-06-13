import { z } from "zod";

import { compileTargetSchema, severitySchema } from "../config/configSchema.js";

const anyAllSchema = z.object({
  any: z.array(z.string().min(1)).optional(),
  all: z.array(z.string().min(1)).optional()
});

export const rubricRuleSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9.-]*$/),
  title: z.string().min(1),
  description: z.string().optional(),
  severity: severitySchema.default("warning"),
  applies_to: z
    .object({
      paths: z.array(z.string().min(1)).default(["**/*"])
    })
    .default({ paths: ["**/*"] }),
  checks: z
    .object({
      required_changed_files: anyAllSchema.optional(),
      forbidden_changed_files: z
        .object({
          any: z.array(z.string().min(1)).optional()
        })
        .optional(),
      required_pr_body_sections: z
        .object({
          any: z.array(z.string().min(1)).optional()
        })
        .optional(),
      changed_directories_greater_than: z.number().int().positive().optional(),
      added_patterns: z.array(z.string().min(1)).optional()
    })
    .default({}),
  message: z.string().min(1),
  suggestion: z.string().optional(),
  compile: z
    .object({
      targets: z.array(compileTargetSchema).default(["agents"])
    })
    .default({ targets: ["agents"] }),
  evidence: z
    .object({
      source: z
        .enum(["manual", "github_pr_history", "generated"])
        .default("manual"),
      confidence: z.number().min(0).max(1).default(0.5),
      file: z.string().optional()
    })
    .default({ source: "manual", confidence: 0.5 })
});

export type RubricRule = z.infer<typeof rubricRuleSchema>;
