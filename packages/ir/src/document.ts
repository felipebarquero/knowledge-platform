import { z } from "zod";
import { nodeSchema } from "./nodes";
import {
  animationDefSchema,
  bindingSchema,
  componentDefSchema,
  controlDefSchema,
  datasetDefSchema,
  syncRuleSchema,
  themeSchema,
} from "./definitions";

/**
 * Bump on breaking IR changes. Backward compatibility rule: existing
 * documents must keep validating, so additive changes only within a minor.
 */
export const IR_VERSION = "0.1.0";

export const documentSchema = z
  .object({
    irVersion: z.string().min(1),
    id: z.string().min(1),
    title: z.string().optional(),
    // Additive in 0.1 (Phase 4): hero metadata, authored in frontmatter.
    subtitle: z.string().optional(),
    chapter: z.string().optional(),
    tags: z.array(z.string()).optional(),
    breadcrumb: z.array(z.string()).optional(),
    nodes: z.array(nodeSchema),
    components: z.record(componentDefSchema).default({}),
    datasets: z.record(datasetDefSchema).default({}),
    interactions: z.record(controlDefSchema).default({}),
    bindings: z.array(bindingSchema).default([]),
    sync: z.array(syncRuleSchema).default([]),
    theme: themeSchema.optional(),
    animations: z.record(animationDefSchema).optional(),
  })
  .strict();

export type IRDocument = z.infer<typeof documentSchema>;
