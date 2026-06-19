/**
 * Named, pre-made surface styles — a small library the workshop can apply to a
 * component in one click (then keep tweaking). Each preset is just a bundle of
 * option values written through the normal `setOption` → draft → YAML path, so
 * nothing new leaks into the IR; "Liquid Glass · Tahoe" is the existing card
 * glass look, packaged as a preset alongside others.
 */
export interface StylePreset {
  id: string;
  label: string;
  /** Component types this preset targets. */
  targets: string[];
  /** Swatch style for the chip preview. */
  swatch: "glass" | "frosted" | "flat" | "bordered" | "soft";
  /** Option keys → values applied when picked. */
  options: Record<string, unknown>;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "tahoe",
    label: "Liquid Glass · Tahoe",
    targets: ["card", "callout"],
    swatch: "glass",
    options: { variant: "glass", blur: 28, radius: "lg", shadow: "md", padding: 20 },
  },
  {
    id: "frosted",
    label: "Frosted",
    targets: ["card", "callout"],
    swatch: "frosted",
    options: { variant: "glass", blur: 16, radius: "xl", shadow: "lg", padding: 24 },
  },
  {
    id: "flat",
    label: "Flat",
    targets: ["card", "callout"],
    swatch: "flat",
    options: { variant: "flat", radius: "md", shadow: "sm" },
  },
  {
    id: "bordered",
    label: "Bordered",
    targets: ["card", "callout"],
    swatch: "bordered",
    options: { variant: "bordered", radius: "md", shadow: "none" },
  },
  {
    id: "soft",
    label: "Soft Dark",
    targets: ["card", "callout"],
    swatch: "soft",
    options: { variant: "flat", radius: "lg", shadow: "lg", padding: 22 },
  },
];

export function presetsFor(type: string): StylePreset[] {
  return STYLE_PRESETS.filter((preset) => preset.targets.includes(type));
}
