/**
 * Editor-only UX metadata for the Workshop's "Simple" inspector mode.
 *
 * This is purely presentational for the authoring GUI — it intentionally lives
 * in the studio app, NOT in the shared `option-specs.ts`, so the IR/component
 * packages stay free of editor concerns. Advanced mode shows the raw prop
 * surface from `option-specs`; Simple mode shows plain language + a curated
 * subset of options driven by the maps below.
 */

/** Plain-language labels for cryptic encoding channels + option keys. */
export const FRIENDLY_LABELS: Record<string, string> = {
  // Data / encoding channels
  dataset: "Data source",
  x: "X axis (horizontal)",
  y: "Y axis (vertical)",
  y2: "Compare with (Y₂)",
  fill: "Color by",
  // Common option keys
  color: "Color",
  fillOpacity: "Fill opacity",
  bins: "Number of bars",
  rx: "Corner roundness",
  height: "Height",
  columns: "Columns",
  gap: "Spacing",
  title: "Title",
  variant: "Style",
  radius: "Roundness",
  shadow: "Shadow",
  padding: "Inner padding",
  aggregate: "Summarize by",
  curve: "Line shape",
  strokeWidth: "Line thickness",
  innerRadius: "Hole size",
  showLegend: "Show legend",
  limit: "Rows shown",
  density: "Row density",
  language: "Language",
  lineNumbers: "Line numbers",
};

/** Friendly label for any key, falling back to the spec's own label. */
export function friendlyLabel(key: string, fallback: string): string {
  return FRIENDLY_LABELS[key] ?? fallback;
}

/**
 * Per-type allowlist of the few option keys surfaced in Simple mode.
 * Types not listed here fall back to the first few of their specs.
 */
export const ESSENTIAL_OPTIONS: Record<string, string[]> = {
  card: ["title", "columns", "gap", "variant"],
  histogram: ["color", "bins", "height"],
  bars: ["aggregate", "color", "height"],
  area: ["color", "curve", "height"],
  dots: ["color", "radius", "height"],
  plot: ["mark", "color", "height"],
  chart: ["color", "curve", "height"],
  donut: ["valueMode", "innerRadius", "showLegend"],
  density: ["color", "height"],
  sparkline: ["color", "height"],
  summary_table: ["bestMode", "density"],
  diagram: ["rootLabel", "color", "height"],
  table: ["limit", "density"],
  code: ["language", "lineNumbers"],
  sql: ["title", "engine"],
};

/** How many specs to show in Simple mode for types without an explicit list. */
export const SIMPLE_FALLBACK_COUNT = 4;
