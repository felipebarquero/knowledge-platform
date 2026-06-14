import { z } from "zod";

/**
 * Registry definitions: components, datasets, interactions, bindings, sync,
 * theme and animations. These live alongside content in the IR document but
 * are a separate layer — content nodes only reference them by key.
 */

export const componentTypeSchema = z.enum([
  "table",
  "plot",
  "chart",
  "histogram",
  // Additive in 0.1 (Phase 2): visx-backed chart types + HeroUI-inspired card
  "bars",
  "area",
  "dots",
  "card",
  // Additive in 0.1 (Phase 2, dashboard vocabulary)
  "donut",
  "density",
  "sparkline",
  "summary_table",
  // Additive in 0.1 (Phase 4): syntax-highlighted code block + SQL console
  "code",
  "sql",
  "equation",
  "quiz",
  "simulation",
  "callout",
  "diagram",
  // Additive in 0.1 (Phase 4): HeroUI component library. Props/render live in
  // @knowledge/components (hero/); the IR only needs the type names. Keep this
  // list in sync with HERO_COMPONENTS keys in hero/hero-specs.ts.
  "button",
  "snippet",
  "chip",
  "badge",
  "avatar",
  "user",
  "image",
  "link",
  "kbd",
  "divider",
  "spacer",
  "skeleton",
  "spinner",
  "progress",
  "circular_progress",
  "input",
  "textarea",
  "number_input",
  "checkbox",
  "radio_group",
  "input_otp",
  "autocomplete",
  "alert",
  "tooltip",
  "popover",
  "modal",
  "toast",
  "drawer",
  "accordion",
  "tabs",
  "breadcrumbs",
  "pagination",
  "navbar",
  "listbox",
  "dropdown",
  "scroll_shadow",
  "calendar",
  "date_input",
]);
export type ComponentType = z.infer<typeof componentTypeSchema>;

export const componentDefSchema = z
  .object({
    type: componentTypeSchema,
    data: z.object({ ref: z.string().min(1) }).strict().optional(),
    encoding: z.record(z.string()).optional(),
    transforms: z.array(z.record(z.unknown())).optional(),
    options: z.record(z.unknown()).optional(),
    description: z.string().optional(),
    /**
     * Additive in 0.1 (Phase 2): composition. A card may embed other
     * components by name; the card's encoding.x is the shared sync key its
     * children hover/filter on. Cycles are rejected by the validator.
     */
    children: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type ComponentDef = z.infer<typeof componentDefSchema>;

export const datasetSourceSchema = z.enum(["postgres", "duckdb", "parquet", "csv"]);
export type DatasetSource = z.infer<typeof datasetSourceSchema>;

export const datasetDefSchema = z
  .object({
    source: datasetSourceSchema,
    connection: z.string().optional(),
    path: z.string().optional(),
    query: z.string().optional(),
    description: z.string().optional(),
  })
  .strict();
export type DatasetDef = z.infer<typeof datasetDefSchema>;

export const controlTypeSchema = z.enum(["slider", "dropdown", "toggle"]);
export type ControlType = z.infer<typeof controlTypeSchema>;

export const controlDefSchema = z
  .object({
    type: controlTypeSchema,
    label: z.string().optional(),
    options: z.union([z.literal("dynamic"), z.array(z.union([z.string(), z.number()]))]).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    // Additive in 0.1 (Phase 2): HeroUI-inspired presentation params.
    variant: z.enum(["glass", "flat", "bordered", "underlined"]).optional(),
    size: z.enum(["sm", "md", "lg"]).optional(),
    radius: z.enum(["none", "sm", "md", "lg", "full"]).optional(),
    labelPlacement: z.enum(["outside", "inside", "left"]).optional(),
    placeholder: z.string().optional(),
    description: z.string().optional(),
    // Additive in 0.1 (Phase 3): behavior semantics for the sync engine.
    /** Column this control filters/highlights. Falls back to the target's first filter transform. */
    field: z.string().optional(),
    /** Slider constraint: "max" keeps rows ≤ value (default), "min" keeps rows ≥ value. */
    mode: z.enum(["max", "min"]).optional(),
    /** Toggle: the field value kept while the toggle is ON (default true). */
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .strict();
export type ControlDef = z.infer<typeof controlDefSchema>;

export const bindingActionSchema = z.enum(["filter", "update", "highlight"]);
export type BindingAction = z.infer<typeof bindingActionSchema>;

/** Sentinel target meaning "every component in the document". */
export const ALL_COMPONENTS = "all_components";

export const bindingSchema = z
  .object({ source: z.string().min(1), target: z.string().min(1), action: bindingActionSchema })
  .strict();
export type Binding = z.infer<typeof bindingSchema>;

export const syncRuleSchema = z
  .object({ from: z.string().min(1), to: z.string().min(1), action: bindingActionSchema })
  .strict();
export type SyncRule = z.infer<typeof syncRuleSchema>;

export const themeSchema = z.record(z.record(z.union([z.string(), z.number()])));
export type Theme = z.infer<typeof themeSchema>;

export const animationDefSchema = z
  .object({
    entrance: z.string().optional(),
    exit: z.string().optional(),
    duration: z.string().optional(),
    // Additive in 0.1: anime.js-inspired vocabulary. Strings like "120ms" / "outExpo".
    delay: z.string().optional(),
    easing: z.string().optional(),
  })
  .strict();
export type AnimationDef = z.infer<typeof animationDefSchema>;
