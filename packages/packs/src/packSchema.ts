import { z } from "zod";

export const builtInPackMetadataSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1),
  description: z.string().optional()
});

export type BuiltInPackMetadata = z.infer<typeof builtInPackMetadataSchema>;
