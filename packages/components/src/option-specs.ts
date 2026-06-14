import type { ComponentDef, ControlDef } from "@knowledge/ir";
import { HERO_COMPONENTS } from "./hero/hero-specs";

/**
 * Declarative parameter registry — the engine behind the Storybook-style
 * controls panel. Every component type publishes its full option surface;
 * the workshop renders control rows generically from these specs, so new
 * component types get a complete editor for free.
 *
 * Chart parameters mirror the underlying visx prop surfaces (Bar → SVG rect
 * props like fill/rx/opacity; AreaClosed → curve/fill/stroke/defined; dots →
 * circle r/fill/stroke). Card and select parameters mirror HeroUI's API
 * vocabulary (shadow/radius/isHoverable; variant/size/labelPlacement).
 */

export type OptionControlKind = "color" | "number" | "range" | "select" | "toggle" | "text";

export interface OptionSpec {
  key: string;
  label: string;
  control: OptionControlKind;
  group: string;
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  choices?: readonly (string | number)[];
}

const HEIGHT: OptionSpec = {
  key: "height",
  label: "height",
  control: "range",
  group: "Layout",
  default: 260,
  min: 140,
  max: 560,
  step: 10,
};

/** Grid span when the component is embedded as a card child. */
const SPAN: OptionSpec = {
  key: "span",
  label: "grid span",
  control: "range",
  group: "Layout",
  default: 1,
  min: 1,
  max: 4,
  step: 1,
};

const GRID: OptionSpec[] = [
  {
    key: "grid",
    label: "grid",
    control: "select",
    group: "Axes & Grid",
    default: "rows",
    choices: ["none", "rows", "columns", "both"],
  },
  { key: "xTicks", label: "x ticks", control: "range", group: "Axes & Grid", default: 6, min: 2, max: 12, step: 1 },
  { key: "yTicks", label: "y ticks", control: "range", group: "Axes & Grid", default: 4, min: 2, max: 10, step: 1 },
];

export const CURVE_CHOICES = [
  "linear",
  "monotoneX",
  "natural",
  "step",
  "basis",
  "cardinal",
] as const;

export const COMPONENT_OPTION_SPECS: Record<string, OptionSpec[]> = {
  histogram: [
    { key: "color", label: "fill", control: "color", group: "Mark", default: "#7c9aff" },
    { key: "fillOpacity", label: "fill opacity", control: "range", group: "Mark", default: 0.85, min: 0.1, max: 1, step: 0.05 },
    { key: "rx", label: "corner radius", control: "range", group: "Mark", default: 2, min: 0, max: 12, step: 1 },
    { key: "bins", label: "bins", control: "range", group: "Mark", default: 20, min: 4, max: 80, step: 1 },
    { key: "stroke", label: "stroke", control: "color", group: "Mark", default: "#00000000" },
    HEIGHT,
    SPAN,
    ...GRID,
  ],
  bars: [
    { key: "aggregate", label: "aggregate", control: "select", group: "Data shaping", default: "mean", choices: ["count", "mean", "sum"] },
    { key: "color", label: "fill", control: "color", group: "Mark", default: "#7c9aff" },
    { key: "fillOpacity", label: "fill opacity", control: "range", group: "Mark", default: 0.9, min: 0.1, max: 1, step: 0.05 },
    { key: "rx", label: "corner radius", control: "range", group: "Mark", default: 6, min: 0, max: 20, step: 1 },
    { key: "bandPadding", label: "band padding", control: "range", group: "Mark", default: 0.25, min: 0, max: 0.8, step: 0.05 },
    { key: "stroke", label: "stroke", control: "color", group: "Mark", default: "#00000000" },
    { key: "strokeWidth", label: "stroke width", control: "range", group: "Mark", default: 0, min: 0, max: 6, step: 0.5 },
    HEIGHT,
    SPAN,
    ...GRID,
  ],
  area: [
    { key: "curve", label: "curve", control: "select", group: "Path", default: "monotoneX", choices: CURVE_CHOICES },
    { key: "color", label: "fill", control: "color", group: "Path", default: "#7c9aff" },
    { key: "fillOpacity", label: "fill opacity", control: "range", group: "Path", default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: "gradient", label: "gradient fill", control: "toggle", group: "Path", default: true },
    { key: "stroke", label: "stroke", control: "color", group: "Path", default: "#7c9aff" },
    { key: "strokeWidth", label: "stroke width", control: "range", group: "Path", default: 2, min: 0, max: 8, step: 0.5 },
    { key: "showDots", label: "show dots", control: "toggle", group: "Dots", default: false },
    { key: "dotRadius", label: "dot radius", control: "range", group: "Dots", default: 3, min: 1, max: 10, step: 0.5 },
    HEIGHT,
    SPAN,
    ...GRID,
  ],
  dots: [
    { key: "radius", label: "radius", control: "range", group: "Mark", default: 4, min: 1, max: 14, step: 0.5 },
    { key: "opacity", label: "opacity", control: "range", group: "Mark", default: 0.8, min: 0.05, max: 1, step: 0.05 },
    { key: "color", label: "fill", control: "color", group: "Mark", default: "#7c9aff" },
    { key: "stroke", label: "stroke", control: "color", group: "Mark", default: "#00000000" },
    { key: "strokeWidth", label: "stroke width", control: "range", group: "Mark", default: 0, min: 0, max: 4, step: 0.5 },
    { key: "refLine", label: "reference line", control: "select", group: "Mark", default: "none", choices: ["none", "zero", "diagonal"] },
    HEIGHT,
    SPAN,
    ...GRID,
  ],
  donut: [
    { key: "valueMode", label: "value", control: "select", group: "Data shaping", default: "count", choices: ["count", "sum"] },
    { key: "innerRadius", label: "inner radius", control: "range", group: "Arc", default: 0.62, min: 0, max: 0.9, step: 0.02 },
    { key: "padAngle", label: "pad angle", control: "range", group: "Arc", default: 0.02, min: 0, max: 0.12, step: 0.005 },
    { key: "showLegend", label: "legend", control: "toggle", group: "Arc", default: true },
    { ...HEIGHT, default: 180 },
    SPAN,
  ],
  density: [
    { key: "color", label: "fill", control: "color", group: "Path", default: "#7c9aff" },
    { key: "fillOpacity", label: "fill opacity", control: "range", group: "Path", default: 0.45, min: 0, max: 1, step: 0.05 },
    { key: "gradient", label: "gradient fill", control: "toggle", group: "Path", default: true },
    { key: "smooth", label: "smoothing", control: "range", group: "Path", default: 2, min: 0, max: 4, step: 1 },
    { key: "showAxis", label: "x axis", control: "toggle", group: "Axes & Grid", default: true },
    { ...HEIGHT, default: 160 },
    SPAN,
  ],
  sparkline: [
    { key: "color", label: "stroke", control: "color", group: "Mark", default: "#7fd1b9" },
    { key: "strokeWidth", label: "stroke width", control: "range", group: "Mark", default: 1.8, min: 0.5, max: 5, step: 0.1 },
    { key: "fillArea", label: "area fill", control: "toggle", group: "Mark", default: true },
    { ...HEIGHT, default: 48, min: 24, max: 160, step: 4 },
    SPAN,
  ],
  summary_table: [
    { key: "bestMode", label: "best is", control: "select", group: "Data shaping", default: "min", choices: ["min", "max"] },
    { key: "badges", label: "badges", control: "toggle", group: "Table", default: true },
    { key: "sparkline", label: "trend column", control: "toggle", group: "Table", default: true },
    { key: "density", label: "density", control: "select", group: "Table", default: "compact", choices: ["compact", "comfortable"] },
    { key: "striped", label: "striped rows", control: "toggle", group: "Table", default: true },
    SPAN,
  ],
  diagram: [
    { key: "rootLabel", label: "root label", control: "text", group: "Structure", default: "Population" },
    { key: "maxGroups", label: "max groups", control: "range", group: "Structure", default: 4, min: 2, max: 8, step: 1 },
    { key: "maxLeaves", label: "leaves / group", control: "range", group: "Structure", default: 3, min: 1, max: 6, step: 1 },
    { key: "color", label: "accent", control: "color", group: "Structure", default: "#7c9aff" },
    { ...HEIGHT, default: 230 },
    SPAN,
  ],
  plot: [
    { key: "mark", label: "mark", control: "select", group: "Mark", default: "dot", choices: ["dot", "line"] },
    { key: "radius", label: "radius", control: "range", group: "Mark", default: 4, min: 1, max: 14, step: 0.5 },
    { key: "opacity", label: "opacity", control: "range", group: "Mark", default: 0.8, min: 0.05, max: 1, step: 0.05 },
    { key: "color", label: "color", control: "color", group: "Mark", default: "#7c9aff" },
    HEIGHT,
    SPAN,
    ...GRID,
  ],
  chart: [
    { key: "curve", label: "curve", control: "select", group: "Mark", default: "monotoneX", choices: CURVE_CHOICES },
    { key: "color", label: "color", control: "color", group: "Mark", default: "#7c9aff" },
    { key: "strokeWidth", label: "stroke width", control: "range", group: "Mark", default: 2, min: 0.5, max: 8, step: 0.5 },
    HEIGHT,
    SPAN,
    ...GRID,
  ],
  table: [
    { key: "limit", label: "rows shown", control: "range", group: "Table", default: 8, min: 3, max: 50, step: 1 },
    { key: "density", label: "density", control: "select", group: "Table", default: "compact", choices: ["compact", "comfortable"] },
    { key: "striped", label: "striped rows", control: "toggle", group: "Table", default: false },
    SPAN,
  ],
  code: [
    { key: "language", label: "language", control: "select", group: "Code", default: "python", choices: ["python", "r", "typescript", "javascript", "sql", "bash", "yaml", "text"] },
    { key: "title", label: "title", control: "text", group: "Code", default: "" },
    { key: "lineNumbers", label: "line numbers", control: "toggle", group: "Code", default: true },
    { key: "wrap", label: "wrap lines", control: "toggle", group: "Code", default: false },
    { key: "fontSize", label: "font size", control: "range", group: "Code", default: 13, min: 10, max: 18, step: 0.5 },
    { key: "elapsed", label: "recorded run", control: "text", group: "Cell", default: "" },
    SPAN,
  ],
  sql: [
    { key: "title", label: "title", control: "text", group: "Console", default: "SQL Console" },
    { key: "engine", label: "engine", control: "select", group: "Execution", default: "wasm", choices: ["wasm", "server"] },
    { key: "connection", label: "connection", control: "text", group: "Execution", default: "" },
    { key: "elapsed", label: "recorded time", control: "text", group: "Console", default: "" },
    { key: "maxRows", label: "max rows", control: "range", group: "Console", default: 50, min: 5, max: 200, step: 5 },
    SPAN,
  ],
  card: [
    { key: "title", label: "title", control: "text", group: "Content", default: "" },
    { key: "code", label: "code line", control: "text", group: "Content", default: "" },
    { key: "columns", label: "grid columns", control: "range", group: "Composition", default: 1, min: 1, max: 4, step: 1 },
    { key: "gap", label: "grid gap", control: "range", group: "Composition", default: 14, min: 4, max: 32, step: 2 },
    { key: "variant", label: "variant", control: "select", group: "Surface", default: "glass", choices: ["glass", "flat", "bordered"] },
    { key: "radius", label: "radius", control: "select", group: "Surface", default: "lg", choices: ["sm", "md", "lg", "xl"] },
    { key: "shadow", label: "shadow", control: "select", group: "Surface", default: "md", choices: ["none", "sm", "md", "lg"] },
    { key: "blur", label: "blur (px)", control: "range", group: "Surface", default: 24, min: 0, max: 48, step: 2 },
    { key: "padding", label: "padding", control: "range", group: "Surface", default: 20, min: 8, max: 48, step: 2 },
    { key: "isHoverable", label: "hoverable", control: "toggle", group: "Behavior", default: false },
    { key: "fullWidth", label: "full width", control: "toggle", group: "Behavior", default: true },
    SPAN,
  ],
};

/** HeroUI-inspired presentation params editable on dropdown/slider/toggle controls. */
export const CONTROL_STYLE_SPECS: OptionSpec[] = [
  { key: "variant", label: "variant", control: "select", group: "Appearance", default: "glass", choices: ["glass", "flat", "bordered", "underlined"] },
  { key: "size", label: "size", control: "select", group: "Appearance", default: "md", choices: ["sm", "md", "lg"] },
  { key: "radius", label: "radius", control: "select", group: "Appearance", default: "full", choices: ["none", "sm", "md", "lg", "full"] },
  { key: "labelPlacement", label: "label placement", control: "select", group: "Appearance", default: "left", choices: ["outside", "inside", "left"] },
  { key: "placeholder", label: "placeholder", control: "text", group: "Appearance", default: "" },
];

export function specsFor(type: string): OptionSpec[] {
  return COMPONENT_OPTION_SPECS[type] ?? HERO_COMPONENTS[type]?.specs ?? [];
}

/** Effective option value: explicit def.options value, else the spec default. */
export function optionValue(def: Pick<ComponentDef, "options">, spec: OptionSpec): unknown {
  const raw = def.options?.[spec.key];
  return raw === undefined || raw === null ? spec.default : raw;
}

/** All effective options for a component as a flat record. */
export function resolvedOptions(def: Pick<ComponentDef, "options" | "type">): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const spec of specsFor((def as { type?: string }).type ?? "")) {
    out[spec.key] = optionValue(def, spec);
  }
  if (def.options) Object.assign(out, def.options);
  return out;
}

/** Effective control style value (HeroUI-inspired fields live on the def itself). */
export function controlStyleValue(def: ControlDef, spec: OptionSpec): unknown {
  const raw = (def as unknown as Record<string, unknown>)[spec.key];
  return raw === undefined || raw === null || raw === "" ? spec.default : raw;
}
