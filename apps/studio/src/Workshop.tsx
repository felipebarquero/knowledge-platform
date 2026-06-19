import { useEffect, useMemo, useState } from "react";
import { parseDocument } from "yaml";
import { compile } from "@knowledge/compiler";
import {
  CONTROL_STYLE_SPECS,
  CellSessionContext,
  ComponentRenderer,
  DocSyncProvider,
  EASINGS,
  ENTRANCES,
  HERO_COMPONENTS,
  Icon,
  LiveControl,
  controlStyleValue,
  highlightLine,
  optionValue,
  parseDuration,
  specsFor,
} from "@knowledge/components";
import type { CellSession, OptionSpec } from "@knowledge/components";
import { applyFilters, columnsOf, filterFieldsOf, uniqueValues } from "@knowledge/data";
import type { DataTable } from "@knowledge/data";
import { ALL_COMPONENTS } from "@knowledge/ir";
import type { AnimationDef, Binding, ComponentDef, ControlDef, IRDocument, SyncRule } from "@knowledge/ir";
import { ESSENTIAL_OPTIONS, SIMPLE_FALLBACK_COUNT, friendlyLabel } from "./friendly";
import { IconPicker } from "./IconPicker";
import { presetsFor } from "./style-presets";
import type { StylePreset } from "./style-presets";

type InspectorMode = "simple" | "advanced";

/**
 * Component workshop (editor mode) — Storybook-style UX over the semantic
 * layers: Data, Style, Animation (anime.js), Interaction, Sync. Edits build a
 * draft, the canvas renders it live, and Save round-trips the result into
 * content/definitions.yaml via the dev-server write-back endpoint
 * (comments elsewhere in the file are preserved).
 *
 * The filter controls in the canvas are a PREVIEW of reactivity — the real
 * sync engine is Phase 3 and is deliberately not built here.
 */

interface Draft {
  component: ComponentDef;
  animation: AnimationDef | null;
  bindings: Binding[];
  sync: SyncRule[];
  interactions: Record<string, ControlDef>;
}

/** Sections collapsed by default in the Figma-style inspector. */
const DEFAULT_COLLAPSED: Record<string, boolean> = { sync: true, yaml: true };

const NATIVE_TYPES = [
  "histogram",
  "bars",
  "area",
  "dots",
  "donut",
  "density",
  "sparkline",
  "plot",
  "chart",
  "table",
  "summary_table",
  "diagram",
  "code",
  "sql",
  "card",
];
// Every editable component type: native + the full HeroUI library.
const IMPLEMENTED_TYPES = [...NATIVE_TYPES, ...Object.keys(HERO_COMPONENTS)];
const ACTIONS = ["filter", "update", "highlight"] as const;
const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Flow node/edge shapes (authored in a flow component's options). */
interface WsFlowNode {
  id: string;
  label?: string;
  sublabel?: string;
  icon?: string;
  x?: number;
  y?: number;
  color?: string;
  children?: string[];
}
interface WsFlowEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clean(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => {
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "object") return Object.keys(value).length > 0;
      return true;
    }),
  );
}

/** Catalog driving the "new component" wizard — kinds, blurbs, grouping. */
interface KindEntry {
  kind: string;
  label: string;
  group: string;
  description: string;
}

const TYPE_CATALOG: KindEntry[] = [
  { kind: "card", label: "card", group: "Containers", description: "Glass container — composes other components; children sync on its encoding.x" },
  { kind: "histogram", label: "histogram", group: "Charts", description: "Distribution of a numeric column (binned bars)" },
  { kind: "bars", label: "bars", group: "Charts", description: "Categorical bars — count / mean / sum per group" },
  { kind: "area", label: "area", group: "Charts", description: "Closed area over time or a numeric axis" },
  { kind: "dots", label: "dots", group: "Charts", description: "Scatter of two numeric columns; color + reference lines" },
  { kind: "donut", label: "donut", group: "Charts", description: "Share of categories with legend and percentages" },
  { kind: "density", label: "density", group: "Charts", description: "Smoothed distribution curve" },
  { kind: "violin", label: "violin", group: "Charts", description: "Split violin + box — value distribution by group (mixed-effects)" },
  { kind: "box", label: "box plot", group: "Charts", description: "Box-and-whisker: quartiles, whiskers, mean, outliers" },
  { kind: "threshold", label: "difference area", group: "Charts", description: "Two series compared — fill above/below where one exceeds the other" },
  { kind: "bands", label: "bands", group: "Charts", description: "Glowing mean profiles per group with confidence bands, legend + crosshair" },
  { kind: "panels", label: "panels", group: "Charts", description: "Faceted small-multiples: paired glow profiles, inset difference box plots, synced crosshair + pan/zoom toolbar" },
  { kind: "sparkline", label: "sparkline", group: "Charts", description: "Tiny inline trend line" },
  { kind: "chart", label: "chart", group: "Charts", description: "Line chart over x/y" },
  { kind: "table", label: "datatable", group: "Data", description: "Raw rows as a data table" },
  { kind: "code", label: "code block", group: "Data", description: "Syntax-highlighted code, optional Jupyter Out pane" },
  { kind: "sql", label: "SQL console", group: "Data", description: "Runnable SQL over the datasets with a results table" },
  { kind: "summary_table", label: "summary table", group: "Data", description: "Per-group stats: mean, n, best, improvement, trend" },
  { kind: "diagram", label: "diagram", group: "Data", description: "Hierarchy: population → groups → observations" },
  { kind: "flow", label: "flow", group: "Diagrams", description: "Node-and-edge graph (React Flow) — drag, connect, style" },
  { kind: "control:dropdown", label: "selector", group: "Controls", description: "Dropdown — pick a value to filter bound components" },
  { kind: "control:slider", label: "slider", group: "Controls", description: "Numeric range control (reactive in Phase 3)" },
  { kind: "control:toggle", label: "toggle", group: "Controls", description: "Boolean switch (reactive in Phase 3)" },
  // HeroUI component library (generated from the scraped spec catalog).
  ...Object.entries(HERO_COMPONENTS).map(([kind, meta]) => ({
    kind,
    label: meta.label,
    group: meta.group,
    description: meta.description,
  })),
];

function prettyTitle(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function pascal(type: string): string {
  return type.split("_").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

/** Figma-layers-style icon for a component/control type (Iconify lucide name). */
function typeIconName(type: string): string {
  switch (type) {
    case "card":
    case "callout":
      return "lucide:frame";
    case "flow":
      return "lucide:workflow";
    case "diagram":
      return "lucide:share-2";
    case "table":
    case "summary_table":
      return "lucide:table-2";
    case "sql":
      return "lucide:database";
    case "code":
      return "lucide:code";
    case "equation":
      return "lucide:sigma";
    case "histogram":
    case "bars":
      return "lucide:bar-chart-3";
    case "area":
    case "chart":
      return "lucide:line-chart";
    case "density":
      return "lucide:area-chart";
    case "sparkline":
      return "lucide:activity";
    case "dots":
    case "plot":
      return "lucide:scatter-chart";
    case "donut":
      return "lucide:pie-chart";
    case "violin":
      return "lucide:chart-spline";
    case "box":
      return "lucide:candlestick-chart";
    case "threshold":
      return "lucide:chart-area";
    case "bands":
      return "lucide:chart-line";
    case "panels":
      return "lucide:layout-grid";
    case "dropdown":
      return "lucide:square-chevron-down";
    case "slider":
      return "lucide:sliders-horizontal";
    case "toggle":
      return "lucide:toggle-left";
    case "new":
      return "lucide:plus";
    default:
      return HERO_COMPONENTS[type] ? "lucide:component" : "lucide:box";
  }
}

/** HeroUI instances get the purple "component" tone (like a Figma component). */
function isComponentTone(type: string): boolean {
  return Boolean(HERO_COMPONENTS[type]);
}

/**
 * Render a component def as a readable JSX-like snippet for the workshop's
 * Selection → code panel (Lunagraph-style). Data/encoding/options become props;
 * arrays (flow nodes/edges) collapse to a count; a description becomes children.
 */
function defToJsx(name: string, def: ComponentDef): string {
  const tag = pascal(def.type);
  const props: string[] = [];
  if (def.data?.ref) props.push(`data="${def.data.ref}"`);
  for (const [channel, field] of Object.entries(def.encoding ?? {})) props.push(`${channel}="${field}"`);
  for (const [key, value] of Object.entries(def.options ?? {})) {
    if (Array.isArray(value)) props.push(`${key}={[${value.length}]}`);
    else if (typeof value === "string") props.push(`${key}="${value}"`);
    else if (typeof value === "boolean") props.push(value ? key : `${key}={false}`);
    else if (typeof value === "number") props.push(`${key}={${value}}`);
  }
  if (def.children?.length) props.push(`children={[${def.children.map((c) => `"${c}"`).join(", ")}]}`);
  const propStr = props.length === 0 ? "" : props.length <= 2 ? ` ${props.join(" ")}` : `\n  ${props.join("\n  ")}\n`;
  if (def.description) {
    const body = def.description.length > 90 ? `${def.description.slice(0, 90)}…` : def.description;
    return `<${tag}${propStr}>\n  {${JSON.stringify(body)}}\n</${tag}>`;
  }
  return `<${tag}${propStr}${props.length > 2 ? "" : " "}/>`;
}

function classifyColumns(rows: DataTable | undefined): {
  numeric: string[];
  categorical: string[];
  temporal: string[];
} {
  const out = { numeric: [] as string[], categorical: [] as string[], temporal: [] as string[] };
  if (!rows || rows.length === 0) return out;
  for (const column of columnsOf(rows)) {
    const sample = rows
      .slice(0, 24)
      .map((row) => row[column])
      .filter((v) => v !== null && v !== undefined);
    if (sample.length === 0) continue;
    if (sample.every((v) => v instanceof Date)) out.temporal.push(column);
    else if (sample.every((v) => typeof v === "number" && Number.isFinite(v))) out.numeric.push(column);
    else out.categorical.push(column);
  }
  return out;
}

/** Type-aware starter definition: sensible dataset + encodings per kind. */
function seedComponent(
  type: ComponentDef["type"],
  doc: IRDocument,
  data: Record<string, DataTable>,
  name: string,
): ComponentDef {
  const datasetName = Object.keys(doc.datasets)[0];
  const rows = datasetName ? data[datasetName] : undefined;
  const { numeric, categorical, temporal } = classifyColumns(rows);
  const dataRef = datasetName ? { data: { ref: datasetName } } : {};
  const enc = (entries: Record<string, string | undefined>) => {
    const encoding = Object.fromEntries(
      Object.entries(entries).filter(([, v]) => v !== undefined),
    ) as Record<string, string>;
    return Object.keys(encoding).length ? { encoding } : {};
  };
  // HeroUI components carry no dataset; seed from their declared defaults.
  if (HERO_COMPONENTS[type]) {
    const seed = HERO_COMPONENTS[type].seed;
    return { type, ...(seed ? { options: { ...seed } } : {}) };
  }
  switch (type) {
    case "card":
      return { type, options: { title: prettyTitle(name) } };
    case "histogram":
    case "density":
      return { type, ...dataRef, ...enc({ x: numeric[0] }) };
    case "bars":
      return { type, ...dataRef, ...enc({ x: categorical[0], y: numeric[0] }), options: { aggregate: "mean" } };
    case "summary_table":
      return { type, ...dataRef, ...enc({ x: categorical[0], y: numeric[0], fill: categorical[1] }) };
    case "violin":
      return { type, ...dataRef, ...enc({ x: categorical[0], y: numeric[0], fill: categorical[1] }), options: { split: true } };
    case "box":
      return { type, ...dataRef, ...enc({ x: categorical[0], y: numeric[0], fill: categorical[1] }) };
    case "threshold": {
      const xField = temporal[0] ?? numeric[0];
      const series = numeric.filter((numericField) => numericField !== xField);
      return { type, ...dataRef, ...enc({ x: xField, y: series[0] ?? numeric[0], y2: series[1] ?? series[0] }) };
    }
    case "bands": {
      const xField = temporal[0] ?? numeric[0];
      const yField = numeric.find((numericField) => numericField !== xField) ?? numeric[0];
      return { type, ...dataRef, ...enc({ x: xField, y: yField, fill: categorical[0] }) };
    }
    case "panels": {
      const xField = temporal[0] ?? numeric[0];
      const yField = numeric.find((numericField) => numericField !== xField) ?? numeric[0];
      return {
        type,
        ...dataRef,
        ...enc({ x: xField, y: yField, fill: categorical[0], facet: categorical[1] ?? categorical[0] }),
        options: { columns: 2 },
      };
    }
    case "donut":
    case "diagram":
      return { type, ...dataRef, ...enc({ x: categorical[0] }) };
    case "area":
    case "chart":
      return {
        type,
        ...dataRef,
        ...enc({ x: temporal[0] ?? numeric[0], y: temporal[0] ? numeric[0] : (numeric[1] ?? numeric[0]) }),
      };
    case "sparkline":
      return { type, ...dataRef, ...enc({ x: temporal[0], y: numeric[0] }) };
    case "code":
      return {
        type,
        description: 'def hello():\n    print("knowledge")',
        options: { language: "python", title: prettyTitle(name) },
      };
    case "sql": {
      const ds = datasetName ?? "dataset";
      const numericCol = numeric[0] ?? "value";
      const groupCol = categorical[0] ?? "id";
      return {
        type,
        description: `SELECT ${groupCol}, AVG(${numericCol}) AS mean_${numericCol}, COUNT(*) AS n\nFROM ${ds}\nGROUP BY ${groupCol}\nORDER BY mean_${numericCol} ASC\nLIMIT 10;`,
        options: { title: prettyTitle(name) },
      };
    }
    case "dots":
    case "plot":
      return { type, ...dataRef, ...enc({ x: numeric[0], y: numeric[1] ?? numeric[0] }) };
    case "flow":
      return {
        type,
        options: {
          nodes: [
            { id: "input", label: "Input", x: 0, y: 60, color: "#7c9aff" },
            { id: "process", label: "Process", x: 220, y: 60, color: "#c792ea" },
            { id: "output", label: "Output", x: 440, y: 60, color: "#58c896" },
          ],
          edges: [
            { source: "input", target: "process", animated: true },
            { source: "process", target: "output", animated: true },
          ],
        },
      };
    default:
      return { type, ...dataRef };
  }
}

function makeDraft(
  doc: IRDocument,
  name: string,
  data: Record<string, DataTable>,
  seedType: ComponentDef["type"] = "plot",
  localDefs: Record<string, ComponentDef> = {},
): Draft {
  // New, unsaved components live in localDefs until written back to YAML.
  const existing = doc.components[name] ?? localDefs[name];
  const shared = {
    bindings: structuredClone(doc.bindings),
    sync: structuredClone(doc.sync),
    interactions: structuredClone(doc.interactions),
  };
  if (existing) {
    const anim = doc.animations?.[name];
    return { component: structuredClone(existing), animation: anim ? structuredClone(anim) : null, ...shared };
  }
  return { component: seedComponent(seedType, doc, data, name), animation: null, ...shared };
}

/** Sidebar tree: cards nest their children; everything else sits at the root. */
interface TreeNodeT {
  name: string;
  path: string;
  children: TreeNodeT[];
}

function buildTree(components: Record<string, ComponentDef>, extra: string[]): TreeNodeT[] {
  const embedded = new Set<string>();
  for (const def of Object.values(components)) {
    for (const child of def.children ?? []) embedded.add(child);
  }
  const build = (name: string, path: string, seen: Set<string>): TreeNodeT => ({
    name,
    path,
    children: (components[name]?.children ?? [])
      .filter((child) => !seen.has(child))
      .map((child) => build(child, `${path}/${child}`, new Set([...seen, child]))),
  });
  const roots = [
    ...Object.keys(components).filter((name) => !embedded.has(name)),
    ...extra.filter((name) => !components[name]),
  ];
  return roots.map((name) => build(name, name, new Set([name])));
}

function serializeComponent(def: ComponentDef): Record<string, unknown> {
  return clean({
    type: def.type,
    data: def.data,
    encoding: def.encoding,
    transforms: def.transforms,
    options: def.options,
    description: def.description,
    children: def.children,
  });
}

function buildYamlText(
  source: string,
  name: string,
  draft: Draft,
  controlsTouched: boolean,
  localDefs: Record<string, ComponentDef> = {},
): string {
  const ydoc = parseDocument(source);
  // Persist any new components dropped into a card (children of the draft),
  // then write the selected component last so its draft edits win.
  for (const [childName, childDef] of Object.entries(localDefs)) {
    if (childName === name) continue;
    ydoc.setIn(["components", childName], serializeComponent(childDef));
  }
  ydoc.setIn(["components", name], serializeComponent(draft.component));
  if (draft.animation && draft.animation.entrance && draft.animation.entrance !== "none") {
    ydoc.setIn(["animations", name], clean({ ...draft.animation }));
  } else if (ydoc.hasIn(["animations", name])) {
    ydoc.deleteIn(["animations", name]);
  }
  ydoc.setIn(["bindings"], draft.bindings);
  ydoc.setIn(["sync"], draft.sync);
  if (controlsTouched) {
    for (const [controlName, def] of Object.entries(draft.interactions)) {
      ydoc.setIn(["interactions", controlName], clean({ ...def }));
    }
  }
  return ydoc.toString();
}

/** Round-trip a single control into interactions, preserving YAML comments. */
function buildControlYaml(source: string, name: string, def: ControlDef): string {
  const ydoc = parseDocument(source);
  ydoc.setIn(["interactions", name], clean({ ...def }));
  return ydoc.toString();
}

export interface WorkshopProps {
  doc: IRDocument;
  documentSource: string;
  definitionsSource: string;
  data: Record<string, DataTable>;
  csvMap: Record<string, string>;
}

export function Workshop({ doc, documentSource, definitionsSource, data, csvMap }: WorkshopProps) {
  const savedNames = Object.keys(doc.components);
  const [newNames, setNewNames] = useState<string[]>([]);
  const allNames = [...savedNames, ...newNames];

  const [selected, setSelected] = useState<string | null>(() => {
    const remembered = sessionStorage.getItem("kp.workshop.selected");
    return remembered && savedNames.includes(remembered) ? remembered : (savedNames[0] ?? null);
  });
  const [draft, setDraft] = useState<Draft | null>(() =>
    selected ? makeDraft(doc, selected, data) : null,
  );
  const [dirty, setDirty] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(DEFAULT_COLLAPSED);
  const [replayKey, setReplayKey] = useState(0);
  const [previewFilters, setPreviewFilters] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [controlsTouched, setControlsTouched] = useState(false);
  const [styledControl, setStyledControl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /** Canvas mode for embedded components: edit alone or live inside the parent card. */
  const [viewMode, setViewMode] = useState<"context" | "solo">("context");
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  // New components created/dropped but not yet saved to YAML (e.g. card children).
  const [localDefs, setLocalDefs] = useState<Record<string, ComponentDef>>({});
  // Inspector mode: Simple (friendly essentials) vs Advanced (full prop surface).
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>(() =>
    sessionStorage.getItem("kp.workshop.inspectorMode") === "advanced" ? "advanced" : "simple",
  );
  // Compose palette + drag-to-reorder state for card children.
  const [paletteTab, setPaletteTab] = useState<"existing" | "new">("existing");
  const [dragChild, setDragChild] = useState<number | null>(null);
  const [overChild, setOverChild] = useState<number | null>(null);
  const [dropActive, setDropActive] = useState(false);
  // Lunagraph-style Selection → code panel under the canvas.
  const [codePanelOpen, setCodePanelOpen] = useState(true);
  const [snippetCopied, setSnippetCopied] = useState(false);

  // Controls are first-class: edited on their own (not buried in a component).
  const savedControls = Object.keys(doc.interactions);
  const [newControls, setNewControls] = useState<string[]>([]);
  const [editing, setEditing] = useState<"component" | "control">("component");
  const [controlName, setControlName] = useState<string | null>(null);
  const [controlDef, setControlDef] = useState<ControlDef | null>(null);

  const tree = useMemo(() => buildTree(doc.components, newNames), [doc.components, newNames]);

  useEffect(() => {
    if (selected) sessionStorage.setItem("kp.workshop.selected", selected);
  }, [selected]);

  useEffect(() => {
    sessionStorage.setItem("kp.workshop.inspectorMode", inspectorMode);
  }, [inspectorMode]);

  function select(name: string) {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setSelected(name);
    setDraft(makeDraft(doc, name, data, "plot", localDefs));
    setDirty(false);
    setPreviewFilters({});
    setSaveError(null);
    setControlsTouched(false);
    setViewMode("context");
    setEditing("component");
  }

  /** Canvas click-to-select: ignore re-clicking the already-active component. */
  function pick(name: string) {
    if (editing === "component" && name === selected) return;
    select(name);
  }

  /** Select a control for standalone editing (canvas preview + inspector). */
  function selectControl(name: string) {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    const def =
      doc.interactions[name] ??
      ({ type: "dropdown", label: prettyTitle(name), options: "dynamic" } as ControlDef);
    setEditing("control");
    setControlName(name);
    setControlDef(structuredClone(def));
    setDirty(false);
    setSaveError(null);
  }

  /** Patch the control draft; undefined/empty values drop the key. */
  function patchControlDef(p: Partial<ControlDef>) {
    setControlDef((d) => {
      if (!d) return d;
      const next = { ...d, ...p } as Record<string, unknown>;
      for (const [k, v] of Object.entries(next)) {
        if (v === undefined || v === "" || v === null) delete next[k];
      }
      return next as unknown as ControlDef;
    });
    setDirty(true);
  }

  /** Wizard submit: create a component of the chosen kind, or a control. Returns an error string or null. */
  function createComponent(rawName: string, kind: string): string | null {
    const name = rawName.trim();
    if (!NAME_PATTERN.test(name)) return "Use snake_case: lowercase letters, digits, underscores.";
    if (allNames.includes(name) || doc.interactions[name] || newControls.includes(name))
      return `"${name}" already exists.`;
    if (kind.startsWith("control:")) {
      const controlType = kind.slice("control:".length) as ControlDef["type"];
      // Standalone control — selectable, customizable and saveable on its own.
      const def: ControlDef = {
        type: controlType,
        label: prettyTitle(name),
        ...(controlType === "dropdown" ? { options: "dynamic" as const } : {}),
        ...(controlType === "slider" ? { min: 0, max: 100, step: 1 } : {}),
      };
      setNewControls((names) => [...names, name]);
      setEditing("control");
      setControlName(name);
      setControlDef(def);
      setDirty(true);
      setCreating(false);
      return null;
    }
    const seeded = seedComponent(kind as ComponentDef["type"], doc, data, name);
    const nextLocal = { ...localDefs, [name]: seeded };
    setLocalDefs(nextLocal);
    setNewNames((names) => [...names, name]);
    setSelected(name);
    setDraft(makeDraft(doc, name, data, kind as ComponentDef["type"], nextLocal));
    setDirty(true);
    setPreviewFilters({});
    setCreating(false);
    setEditing("component");
    return null;
  }

  /**
   * Quick-compose: create a new component of `kind` and append it as a child of
   * the selected card (Builder.io-style drop → element appears immediately).
   * Auto-names to avoid a modal; the user edits/styles it via the inspector.
   */
  function addChildOfKind(kind: string) {
    const taken = new Set([
      ...allNames,
      ...Object.keys(localDefs),
      ...savedControls,
      ...newControls,
    ]);
    let name = kind;
    for (let i = 2; taken.has(name); i++) name = `${kind}_${i}`;
    const seeded = seedComponent(kind as ComponentDef["type"], doc, data, name);
    setLocalDefs((d) => ({ ...d, [name]: seeded }));
    setNewNames((names) => [...names, name]);
    patch((d) => ({
      ...d,
      component: {
        ...d.component,
        children: [...(d.component.children ?? []), name],
      },
    }));
  }

  /** Quick-compose: append an existing component as a child of the selected card. */
  function addChildExisting(name: string) {
    patch((d) =>
      (d.component.children ?? []).includes(name)
        ? d
        : {
            ...d,
            component: {
              ...d.component,
              children: [...(d.component.children ?? []), name],
            },
          },
    );
  }

  /** Reorder the selected card's children (drag-and-drop). */
  function moveChild(from: number, to: number) {
    patch((d) => {
      const children = [...(d.component.children ?? [])];
      if (from < 0 || from >= children.length || to < 0 || to >= children.length) return d;
      const [moved] = children.splice(from, 1);
      children.splice(to, 0, moved!);
      return { ...d, component: { ...d.component, children } };
    });
  }

  /** Remove a child from the selected card (does not delete the component). */
  function removeChild(name: string) {
    patch((d) => {
      const children = (d.component.children ?? []).filter((c) => c !== name);
      return {
        ...d,
        component: { ...d.component, children: children.length ? children : undefined },
      };
    });
  }

  /** Persist dragged flow node positions (x/y) back into the def → saved to YAML. */
  function persistFlowNodes(name: string, dragged: WsFlowNode[]) {
    const byId = new Map(dragged.map((n) => [n.id, n]));
    const merge = (def: ComponentDef): ComponentDef => {
      const existing = (def.options?.nodes as WsFlowNode[] | undefined) ?? [];
      const nodes = existing.map((n) => {
        const u = byId.get(n.id);
        return u ? { ...n, x: u.x, y: u.y } : n;
      });
      return { ...def, options: { ...(def.options ?? {}), nodes } };
    };
    if (name === selected) {
      patch((d) => ({ ...d, component: merge(d.component) }));
    } else if (localDefs[name]) {
      setLocalDefs((defs) => ({ ...defs, [name]: merge(defs[name]!) }));
      setDirty(true);
    }
  }

  const toggleSection = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  function patch(fn: (d: Draft) => Draft) {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
  }

  const patchComponent = (p: Partial<ComponentDef>) =>
    patch((d) => ({ ...d, component: { ...d.component, ...p } }));

  const setOption = (key: string, value: unknown) =>
    patch((d) => {
      const options = { ...(d.component.options ?? {}) };
      if (value === undefined || value === "" || value === null) delete options[key];
      else options[key] = value;
      return { ...d, component: { ...d.component, options } };
    });

  /** Apply a named style preset — a bundle of option values, still tweakable. */
  const applyPreset = (preset: StylePreset) =>
    patch((d) => ({
      ...d,
      component: { ...d.component, options: { ...(d.component.options ?? {}), ...preset.options } },
    }));

  const setEncoding = (channel: string, field: string) =>
    patch((d) => {
      const encoding = { ...(d.component.encoding ?? {}) };
      if (field) encoding[channel] = field;
      else delete encoding[channel];
      return { ...d, component: { ...d.component, encoding } };
    });

  const patchAnimation = (p: Partial<AnimationDef>) =>
    patch((d) => ({ ...d, animation: { ...(d.animation ?? {}), ...p } }));

  const patchControl = (controlName: string, key: string, value: unknown) => {
    setControlsTouched(true);
    patch((d) => {
      const def = { ...(d.interactions[controlName] ?? { type: "dropdown" as const }) } as Record<string, unknown>;
      if (value === undefined || value === "" || value === null) delete def[key];
      else def[key] = value;
      return { ...d, interactions: { ...d.interactions, [controlName]: def as unknown as ControlDef } };
    });
  };

  // Canvas cells are editable; inline-editing the SELECTED code/sql cell writes
  // back to its draft (persisted on Save), like the inspector's code field.
  // Other cells edit ephemerally. Kernel scope = the document id.
  const cellSession = useMemo<CellSession>(
    () => ({
      scope: doc.id,
      editable: true,
      onSourceChange: (cellId, src) => {
        if (cellId === selected) patchComponent({ description: src || undefined });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.id, selected],
  );

  const yamlText = useMemo(
    () =>
      draft && selected
        ? buildYamlText(definitionsSource, selected, draft, controlsTouched, localDefs)
        : definitionsSource,
    [definitionsSource, selected, draft, controlsTouched, localDefs],
  );

  const check = useMemo(
    () => compile(documentSource, { definitions: yamlText }),
    [documentSource, yamlText],
  );
  const checkErrors = check.issues.filter((i) => i.severity === "error");
  const checkWarnings = check.issues.filter((i) => i.severity === "warning");

  // Control-editor YAML + validation (parallel to the component path).
  const controlYaml = useMemo(
    () =>
      controlName && controlDef
        ? buildControlYaml(definitionsSource, controlName, controlDef)
        : definitionsSource,
    [definitionsSource, controlName, controlDef],
  );
  const controlCheck = useMemo(
    () => compile(documentSource, { definitions: controlYaml }),
    [documentSource, controlYaml],
  );

  async function postYaml(yaml: string) {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/__workshop/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml }),
      });
      const out = (await response.json()) as { ok: boolean; error?: string };
      if (!out.ok) setSaveError(out.error ?? "Save failed");
      else setDirty(false); // Vite reloads the page once the file changes on disk
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }
  const save = () => postYaml(yamlText);

  // ── Control editor (first-class control editing) ─────────────────────
  if (editing === "control" && controlName && controlDef) {
    return (
      <ControlEditor
        name={controlName}
        def={controlDef}
        onChange={patchControlDef}
        columns={[...new Set(Object.values(data).flatMap((t) => (t.length ? columnsOf(t) : [])))]}
        previewDoc={{ ...doc, interactions: { [controlName]: controlDef } }}
        data={data}
        yaml={controlYaml}
        issues={controlCheck.issues}
        dirty={dirty}
        saving={saving}
        saveError={saveError}
        onSave={() => void postYaml(controlYaml)}
        collapsed={collapsed}
        onToggle={toggleSection}
        wizard={creating ? <CreateWizard onClose={() => setCreating(false)} onCreate={createComponent} /> : null}
        sidebar={
          <WorkshopSidebar
            tree={tree}
            selected=""
            draftType=""
            components={doc.components}
            expanded={expandedPaths}
            onToggleExpand={(path) => setExpandedPaths((e) => ({ ...e, [path]: !(e[path] ?? true) }))}
            onSelect={select}
            controls={[...savedControls, ...newControls.filter((c) => !savedControls.includes(c))]}
            activeControl={controlName}
            onSelectControl={selectControl}
            onNew={() => setCreating(true)}
          />
        }
      />
    );
  }

  if (!selected || !draft) {
    return (
      <div className="workshop workshop--empty">
        <p className="empty">
          No components defined yet — add one with “New component” or in{" "}
          <code>content/definitions.yaml</code>.
        </p>
        <button type="button" className="ws-btn ws-btn--primary" onClick={() => setCreating(true)}>
          + New component
        </button>
        {creating && (
          <CreateWizard onClose={() => setCreating(false)} onCreate={createComponent} />
        )}
      </div>
    );
  }

  const rows = draft.component.data ? data[draft.component.data.ref] : undefined;
  const columns = rows ? columnsOf(rows) : [];
  // Cards usually have no own dataset; offer the union of their children's columns.
  const encodingColumns =
    draft.component.type === "card"
      ? [
          ...new Set(
            (draft.component.children ?? []).flatMap((child) => {
              const ref = doc.components[child]?.data?.ref;
              return ref && data[ref] ? columnsOf(data[ref]) : [];
            }),
          ),
        ]
      : columns;
  const filterFields = filterFieldsOf(draft.component);
  const allColumns = [
    ...new Set(Object.values(data).flatMap((tableRows) => (tableRows.length ? columnsOf(tableRows) : []))),
  ];
  const filtered = rows ? applyFilters(rows, previewFilters) : undefined;
  const options = draft.component.options ?? {};
  const encoding = draft.component.encoding ?? {};
  const controlNames = Object.keys(doc.interactions);

  const visibleBindings = draft.bindings
    .map((binding, index) => ({ binding, index }))
    .filter(({ binding }) => binding.target === selected || binding.target === ALL_COMPONENTS);
  const visibleSync = draft.sync
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.to === selected || rule.to === ALL_COMPONENTS);

  // Cards embedding the selected component → enables in-context editing.
  const parents = Object.keys(doc.components).filter((p) =>
    doc.components[p]?.children?.includes(selected),
  );
  const contextParent = parents[0];
  const inContext = viewMode === "context" && contextParent !== undefined;

  return (
    <div className="workshop">
      <WorkshopSidebar
        tree={tree}
        selected={editing === "component" ? selected : ""}
        draftType={draft.component.type}
        components={doc.components}
        expanded={expandedPaths}
        onToggleExpand={(path) => setExpandedPaths((e) => ({ ...e, [path]: !(e[path] ?? true) }))}
        onSelect={select}
        controls={[...savedControls, ...newControls.filter((c) => !savedControls.includes(c))]}
        activeControl={editing === "control" ? controlName : null}
        onSelectControl={selectControl}
        onNew={() => setCreating(true)}
      />

      <section className="workshop__canvas">
        <div className="workshop__canvas-bar">
          {parents.length > 0 && (
            <div className="ws-seg">
              <button
                type="button"
                className={`ws-seg__btn ${!inContext ? "ws-seg__btn--active" : ""}`}
                onClick={() => setViewMode("solo")}
              >
                Solo
              </button>
              <button
                type="button"
                className={`ws-seg__btn ${inContext ? "ws-seg__btn--active" : ""}`}
                onClick={() => setViewMode("context")}
              >
                In {contextParent}
              </button>
            </div>
          )}
          {contextParent && (
            <nav className="ws-path" aria-label="selection path">
              <button
                type="button"
                className="ws-path__crumb"
                title={`edit ${contextParent}`}
                onClick={() => select(contextParent)}
              >
                {contextParent}
              </button>
              <span className="ws-path__sep">›</span>
              <span className="ws-path__crumb ws-path__crumb--current">{selected}</span>
            </nav>
          )}
          {inContext ? (
            <span className="workshop__canvas-hint">live card sync — hover &amp; click the children</span>
          ) : filterFields.length > 0 && rows ? (
            filterFields.map((field) => {
              const boundControls = draft.bindings
                .filter(
                  (b) =>
                    b.action === "filter" &&
                    (b.target === selected || b.target === ALL_COMPONENTS),
                )
                .map((b) => b.source);
              return (
                <label key={field} className="ws-filter">
                  <span>{boundControls[0] ?? field}</span>
                  <select
                    value={previewFilters[field] ?? "all"}
                    onChange={(e) =>
                      setPreviewFilters((f) => ({ ...f, [field]: e.target.value }))
                    }
                  >
                    <option value="all">all</option>
                    {uniqueValues(rows, field).map((value) => (
                      <option key={String(value)} value={String(value)}>
                        {String(value)}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })
          ) : (
            <span className="workshop__canvas-hint">
              add a filter transform (Data tab) to preview reactivity
            </span>
          )}
          <span className="workshop__canvas-note">reactivity preview — real engine is Phase 3</span>
          <button type="button" className="ws-btn" onClick={() => setReplayKey((k) => k + 1)}>
            ▶ Replay animation
          </button>
        </div>
        <div className="workshop__stage">
          <CellSessionContext.Provider value={cellSession}>
            {inContext && contextParent ? (
              <ComponentRenderer
                name={contextParent}
                def={doc.components[contextParent]!}
                replayKey={replayKey}
                registry={{ ...doc.components, ...localDefs, [selected]: draft.component }}
                dataMap={data}
                csvMap={csvMap}
                visited={[contextParent]}
                selectable
                activeName={selected}
                onPick={pick}
                onFlowNodes={persistFlowNodes}
              />
            ) : (
              <ComponentRenderer
                name={selected}
                def={draft.component}
                rows={filtered}
                animation={draft.animation ?? undefined}
                replayKey={replayKey}
                registry={{ ...doc.components, ...localDefs, [selected]: draft.component }}
                dataMap={data}
                csvMap={csvMap}
                visited={[selected]}
                selectable
                activeName={selected}
                onPick={pick}
                onFlowNodes={persistFlowNodes}
              />
            )}
          </CellSessionContext.Provider>
        </div>

        <div className={`ws-codepanel ${codePanelOpen ? "" : "ws-codepanel--collapsed"}`}>
          <div className="ws-codepanel__bar">
            <button
              type="button"
              className="ws-codepanel__toggle"
              onClick={() => setCodePanelOpen((o) => !o)}
              aria-expanded={codePanelOpen}
            >
              {codePanelOpen ? "▾" : "▸"} Selection
            </button>
            <code className="ws-codepanel__name">{selected}</code>
            <button
              type="button"
              className="ws-codepanel__copy"
              onClick={() => {
                void navigator.clipboard?.writeText(defToJsx(selected, draft.component)).then(() => {
                  setSnippetCopied(true);
                  window.setTimeout(() => setSnippetCopied(false), 1400);
                });
              }}
            >
              {snippetCopied ? "copied ✓" : "Copy"}
            </button>
          </div>
          {codePanelOpen && (
            <pre className="ws-codepanel__code">
              <code>
                {defToJsx(selected, draft.component)
                  .split("\n")
                  .map((line, i) => (
                    <span key={i} className="kp-code__line">
                      <span className="kp-code__content">{highlightLine(line, "typescript")}</span>
                    </span>
                  ))}
              </code>
            </pre>
          )}
        </div>
      </section>

      <aside className="workshop__panel">
        <header className="ws-inspector__title">
          <code>{selected}</code>
          <span className="ws-item__type">{draft.component.type}</span>
        </header>

        <div className="ws-mode">
          <div className="ws-seg">
            <button
              type="button"
              className={`ws-seg__btn ${inspectorMode === "simple" ? "ws-seg__btn--active" : ""}`}
              onClick={() => setInspectorMode("simple")}
            >
              Simple
            </button>
            <button
              type="button"
              className={`ws-seg__btn ${inspectorMode === "advanced" ? "ws-seg__btn--active" : ""}`}
              onClick={() => setInspectorMode("advanced")}
            >
              Advanced
            </button>
          </div>
        </div>

        <div className="workshop__panel-body ws-inspector">
          <Section id="data" title={draft.component.type === "flow" ? "Flow" : "Data"} collapsed={collapsed} onToggle={toggleSection}>
              {draft.component.type === "flow" ? (
                <FlowEditor
                  nodes={(draft.component.options?.nodes as WsFlowNode[] | undefined) ?? []}
                  edges={(draft.component.options?.edges as WsFlowEdge[] | undefined) ?? []}
                  onNodes={(nodes) => setOption("nodes", nodes.length ? nodes : undefined)}
                  onEdges={(edges) => setOption("edges", edges.length ? edges : undefined)}
                />
              ) : (
              <>
              <Field label={inspectorMode === "simple" ? "Data source" : "dataset"}>
                <select
                  value={draft.component.data?.ref ?? ""}
                  onChange={(e) =>
                    patchComponent({ data: e.target.value ? { ref: e.target.value } : undefined })
                  }
                >
                  <option value="">— none —</option>
                  {Object.keys(doc.datasets).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              {draft.component.type === "card" && (
                <>
                  <h4 className="ws-group">Composition</h4>
                  <CardComposer
                    childNames={draft.component.children ?? []}
                    typeOf={(n) => doc.components[n]?.type ?? localDefs[n]?.type ?? "new"}
                    available={allNames.filter(
                      (n) => n !== selected && !(draft.component.children ?? []).includes(n),
                    )}
                    catalog={TYPE_CATALOG.filter((e) => !e.kind.startsWith("control:"))}
                    onReorder={moveChild}
                    onAddExisting={addChildExisting}
                    onAddKind={addChildOfKind}
                    onRemove={removeChild}
                    onSelectChild={select}
                  />
                  {inspectorMode === "advanced" && (
                    <p className="ws-note">
                      encoding.x is the card's <strong>sync key</strong> — children hover-highlight and
                      click-filter on it.
                    </p>
                  )}
                </>
              )}
              {(draft.component.type === "threshold"
                ? (["x", "y", "y2", "fill"] as const)
                : (["x", "y", "fill"] as const)
              ).map((channel) => (
                <Field
                  key={channel}
                  label={inspectorMode === "simple" ? friendlyLabel(channel, channel) : `encoding.${channel}`}
                >
                  <select
                    value={encoding[channel] ?? ""}
                    onChange={(e) => setEncoding(channel, e.target.value)}
                  >
                    <option value="">— none —</option>
                    {encodingColumns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
              {inspectorMode === "advanced" && (
              <Field label="filterable by">
                <div className="ws-chips">
                  {filterFields.map((field) => (
                    <span key={field} className="ws-chip">
                      {field}
                      <button
                        type="button"
                        onClick={() =>
                          patch((d) => ({
                            ...d,
                            component: {
                              ...d.component,
                              transforms: (d.component.transforms ?? []).filter(
                                (t) => t.filter !== field,
                              ),
                            },
                          }))
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <select
                    value=""
                    onChange={(e) => {
                      const field = e.target.value;
                      if (!field) return;
                      patch((d) => ({
                        ...d,
                        component: {
                          ...d.component,
                          transforms: [...(d.component.transforms ?? []), { filter: field }],
                        },
                      }));
                    }}
                  >
                    <option value="">+ add field…</option>
                    {columns
                      .filter((column) => !filterFields.includes(column))
                      .map((column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      ))}
                  </select>
                </div>
              </Field>
              )}
              </>
              )}
          </Section>

          {(inspectorMode === "advanced" ||
            draft.component.type === "card" ||
            draft.component.type === "callout" ||
            draft.component.type === "code" ||
            draft.component.type === "sql") && (
          <Section
            id="component"
            title={inspectorMode === "simple" ? "Content" : "Component"}
            collapsed={collapsed}
            onToggle={toggleSection}
          >
              {inspectorMode === "advanced" && (
              <Field label="type">
                <select
                  value={draft.component.type}
                  onChange={(e) =>
                    patchComponent({ type: e.target.value as ComponentDef["type"] })
                  }
                >
                  {IMPLEMENTED_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              )}
              {(draft.component.type === "card" ||
                draft.component.type === "callout" ||
                draft.component.type === "code" ||
                draft.component.type === "sql") && (
                <Field
                  label={
                    draft.component.type === "code"
                      ? "code"
                      : draft.component.type === "sql"
                        ? "query"
                        : "body text"
                  }
                >
                  <textarea
                    className={`ws-textarea ${draft.component.type === "code" || draft.component.type === "sql" ? "ws-textarea--code" : ""}`}
                    rows={draft.component.type === "card" || draft.component.type === "callout" ? 3 : 7}
                    value={draft.component.description ?? ""}
                    onChange={(e) => patchComponent({ description: e.target.value || undefined })}
                  />
                </Field>
              )}
              {inspectorMode === "advanced" && (
                <p className="ws-note">
                  Every parameter mirrors the underlying visx/HeroUI prop surface. ↺ resets to the
                  spec default (removes the key from YAML).
                </p>
              )}
          </Section>
          )}

          {presetsFor(draft.component.type).length > 0 && (
            <Section id="presets" title="Style presets" collapsed={collapsed} onToggle={toggleSection}>
              <div className="ws-presets">
                {presetsFor(draft.component.type).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="ws-preset"
                    onClick={() => applyPreset(preset)}
                    title={`Apply ${preset.label}`}
                  >
                    <span className={`ws-preset__swatch ws-preset__swatch--${preset.swatch}`} />
                    <span className="ws-preset__label">{preset.label}</span>
                  </button>
                ))}
              </div>
              <p className="ws-note">A ready-made look applied in one click — then tweak any control below.</p>
            </Section>
          )}

          <OptionSections
            specs={specsFor(draft.component.type)}
            def={draft.component}
            onChange={setOption}
            collapsed={collapsed}
            onToggle={toggleSection}
            mode={inspectorMode}
            type={draft.component.type}
          />

          {inspectorMode === "advanced" && (
          <>
          <Section id="animation" title="Animation" collapsed={collapsed} onToggle={toggleSection}>
              <Field label="entrance">
                <select
                  value={draft.animation?.entrance ?? "none"}
                  onChange={(e) => patchAnimation({ entrance: e.target.value })}
                >
                  {ENTRANCES.map((entrance) => (
                    <option key={entrance} value={entrance}>
                      {entrance}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="duration (ms)">
                <input
                  type="number"
                  min={0}
                  max={4000}
                  step={50}
                  value={parseDuration(draft.animation?.duration, 500)}
                  onChange={(e) => patchAnimation({ duration: `${e.target.value}ms` })}
                />
              </Field>
              <Field label="delay (ms)">
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step={50}
                  value={parseDuration(draft.animation?.delay, 0)}
                  onChange={(e) => patchAnimation({ delay: `${e.target.value}ms` })}
                />
              </Field>
              <Field label="easing">
                <select
                  value={draft.animation?.easing ?? "outQuad"}
                  onChange={(e) => patchAnimation({ easing: e.target.value })}
                >
                  {EASINGS.map((easing) => (
                    <option key={easing} value={easing}>
                      {easing}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="ws-note">Executed by anime.js; the IR stores only the declaration.</p>
          </Section>

          <Section id="interaction" title="Interaction" collapsed={collapsed} onToggle={toggleSection}>
              {visibleBindings.map(({ binding, index }) => (
                <div key={index} className="ws-rule">
                  <select
                    value={binding.source}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        bindings: d.bindings.map((b, i) =>
                          i === index ? { ...b, source: e.target.value } : b,
                        ),
                      }))
                    }
                  >
                    {controlNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={binding.action}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        bindings: d.bindings.map((b, i) =>
                          i === index ? { ...b, action: e.target.value as Binding["action"] } : b,
                        ),
                      }))
                    }
                  >
                    {ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                  <select
                    value={binding.target}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        bindings: d.bindings.map((b, i) =>
                          i === index ? { ...b, target: e.target.value } : b,
                        ),
                      }))
                    }
                  >
                    <option value={selected}>{selected}</option>
                    <option value={ALL_COMPONENTS}>{ALL_COMPONENTS}</option>
                  </select>
                  <button
                    type="button"
                    className="ws-btn"
                    onClick={() =>
                      patch((d) => ({ ...d, bindings: d.bindings.filter((_, i) => i !== index) }))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              {controlNames.length === 0 ? (
                <p className="ws-note">
                  No controls defined — add them under <code>interactions:</code> in YAML first.
                </p>
              ) : (
                <button
                  type="button"
                  className="ws-btn"
                  onClick={() =>
                    patch((d) => ({
                      ...d,
                      bindings: [
                        ...d.bindings,
                        { source: controlNames[0]!, target: selected, action: "filter" },
                      ],
                    }))
                  }
                >
                  + Add binding
                </button>
              )}
              {controlNames.length > 0 && (
                <>
                  <h4 className="ws-group">Control appearance</h4>
                  <Field label="control">
                    <select
                      value={styledControl ?? controlNames[0]}
                      onChange={(e) => setStyledControl(e.target.value)}
                    >
                      {controlNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {CONTROL_STYLE_SPECS.map((spec) => {
                    const controlName = styledControl ?? controlNames[0]!;
                    const def = draft.interactions[controlName];
                    if (!def) return null;
                    return (
                      <OptionRow
                        key={spec.key}
                        spec={spec}
                        value={controlStyleValue(def, spec)}
                        explicit={
                          (def as unknown as Record<string, unknown>)[spec.key] !== undefined
                        }
                        onChange={(value) => patchControl(controlName, spec.key, value)}
                      />
                    );
                  })}
                  <p className="ws-note">HeroUI-inspired params, saved onto the control in YAML.</p>
                  {(() => {
                    const controlName = styledControl ?? controlNames[0]!;
                    const def = draft.interactions[controlName];
                    if (!def) return null;
                    return (
                      <>
                        <h4 className="ws-group">Behavior (sync engine)</h4>
                        <Field label="field">
                          <select
                            value={def.field ?? ""}
                            onChange={(e) =>
                              patchControl(controlName, "field", e.target.value || undefined)
                            }
                          >
                            <option value="">auto (target's filter transform)</option>
                            {allColumns.map((column) => (
                              <option key={column} value={column}>
                                {column}
                              </option>
                            ))}
                          </select>
                        </Field>
                        {def.type === "slider" && (
                          <Field label="mode">
                            <select
                              value={def.mode ?? "max"}
                              onChange={(e) =>
                                patchControl(
                                  controlName,
                                  "mode",
                                  e.target.value === "max" ? undefined : e.target.value,
                                )
                              }
                            >
                              <option value="max">max — keep rows ≤ value</option>
                              <option value="min">min — keep rows ≥ value</option>
                            </select>
                          </Field>
                        )}
                        {def.type === "toggle" && (
                          <Field label="keep value">
                            <input
                              type="text"
                              placeholder="true"
                              value={
                                typeof def.value === "string" || typeof def.value === "number"
                                  ? String(def.value)
                                  : ""
                              }
                              onChange={(e) =>
                                patchControl(controlName, "value", e.target.value || undefined)
                              }
                            />
                          </Field>
                        )}
                        <p className="ws-note">
                          The Phase 3 engine filters this column document-wide when the control
                          changes.
                        </p>
                      </>
                    );
                  })()}
                </>
              )}
          </Section>

          <Section id="sync" title="Sync" collapsed={collapsed} onToggle={toggleSection}>
              {visibleSync.map(({ rule, index }) => (
                <div key={index} className="ws-rule">
                  <select
                    value={rule.from}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        sync: d.sync.map((r, i) => (i === index ? { ...r, from: e.target.value } : r)),
                      }))
                    }
                  >
                    {controlNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={rule.action}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        sync: d.sync.map((r, i) =>
                          i === index ? { ...r, action: e.target.value as SyncRule["action"] } : r,
                        ),
                      }))
                    }
                  >
                    {ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                  <select
                    value={rule.to}
                    onChange={(e) =>
                      patch((d) => ({
                        ...d,
                        sync: d.sync.map((r, i) => (i === index ? { ...r, to: e.target.value } : r)),
                      }))
                    }
                  >
                    <option value={selected}>{selected}</option>
                    <option value={ALL_COMPONENTS}>{ALL_COMPONENTS}</option>
                  </select>
                  <button
                    type="button"
                    className="ws-btn"
                    onClick={() =>
                      patch((d) => ({ ...d, sync: d.sync.filter((_, i) => i !== index) }))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              {controlNames.length > 0 && (
                <button
                  type="button"
                  className="ws-btn"
                  onClick={() =>
                    patch((d) => ({
                      ...d,
                      sync: [...d.sync, { from: controlNames[0]!, to: selected, action: "filter" }],
                    }))
                  }
                >
                  + Add sync rule
                </button>
              )}
              <p className="ws-note">
                Declarative event graph, executed by the Phase 3 Zustand engine.
              </p>
          </Section>

          <Section id="yaml" title="YAML" collapsed={collapsed} onToggle={toggleSection}>
            <pre className="ir-json">{yamlText}</pre>
          </Section>
          </>
          )}
        </div>

        <footer className="workshop__footer">
          <span className={`pill ${checkErrors.length ? "pill--error" : "pill--ok"}`}>
            {checkErrors.length ? `${checkErrors.length} error(s)` : "valid IR"}
          </span>
          {checkWarnings.length > 0 && (
            <span className="pill pill--warn">{checkWarnings.length} warning(s)</span>
          )}
          <button
            type="button"
            className="ws-btn ws-btn--primary"
            disabled={!dirty || saving || checkErrors.length > 0}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save to YAML"}
          </button>
          {saveError && <span className="workshop__save-error">{saveError}</span>}
          {dirty && !saveError && <span className="ws-note">unsaved changes</span>}
        </footer>
      </aside>

      {creating && <CreateWizard onClose={() => setCreating(false)} onCreate={createComponent} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="ws-field">
      <span className="ws-field__label">{label}</span>
      {children}
    </label>
  );
}

/* ── Card composer: drag-to-reorder children + drag/click to add ────── */

function CardComposer({
  childNames,
  typeOf,
  available,
  catalog,
  onReorder,
  onAddExisting,
  onAddKind,
  onRemove,
  onSelectChild,
}: {
  childNames: string[];
  typeOf: (name: string) => string;
  available: string[];
  catalog: { kind: string; label: string }[];
  onReorder: (from: number, to: number) => void;
  onAddExisting: (name: string) => void;
  onAddKind: (kind: string) => void;
  onRemove: (name: string) => void;
  onSelectChild: (name: string) => void;
}) {
  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dropActive, setDropActive] = useState(false);

  const resetDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="ws-composer">
      <div
        className={`ws-dropzone ${dropActive ? "ws-dropzone--over" : ""}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("text/kp-add")) {
            e.preventDefault();
            setDropActive(true);
          }
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData("text/kp-add");
          setDropActive(false);
          if (!raw) return;
          e.preventDefault();
          try {
            const payload = JSON.parse(raw) as { mode: "existing" | "new"; value: string };
            if (payload.mode === "existing") onAddExisting(payload.value);
            else onAddKind(payload.value);
          } catch {
            /* ignore malformed drag payload */
          }
        }}
      >
        {childNames.length === 0 ? (
          <p className="ws-dropzone__hint">No components yet — drag one in, or click to add below.</p>
        ) : (
          <div className="ws-compose">
            {childNames.map((name, i) => (
              <div
                key={name}
                className={`ws-compose__item ${dragIndex === i ? "ws-compose__item--dragging" : ""} ${
                  overIndex === i && dragIndex !== null && dragIndex !== i ? "ws-compose__item--over" : ""
                }`}
                draggable
                onDragStart={(e) => {
                  setDragIndex(i);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(i));
                }}
                onDragOver={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  setOverIndex(i);
                }}
                onDrop={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  if (dragIndex !== i) onReorder(dragIndex, i);
                  resetDrag();
                }}
                onDragEnd={resetDrag}
              >
                <span className="ws-compose__grip" aria-hidden="true">
                  ⋮⋮
                </span>
                <button
                  type="button"
                  className="ws-compose__name"
                  onClick={() => onSelectChild(name)}
                  title={`edit ${name}`}
                >
                  {name}
                </button>
                <span className="ws-compose__type">{typeOf(name)}</span>
                <button
                  type="button"
                  className="ws-compose__remove"
                  title="remove from card"
                  onClick={() => onRemove(name)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ws-palette">
        <div className="ws-palette__tab">
          <button type="button" className={tab === "existing" ? "is-active" : ""} onClick={() => setTab("existing")}>
            Existing
          </button>
          <button type="button" className={tab === "new" ? "is-active" : ""} onClick={() => setTab("new")}>
            New
          </button>
        </div>
        <div className="ws-palette__strip">
          {tab === "existing" ? (
            available.length === 0 ? (
              <p className="ws-dropzone__hint">All components are already in this card.</p>
            ) : (
              available.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="ws-palette__item"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData("text/kp-add", JSON.stringify({ mode: "existing", value: name }));
                  }}
                  onClick={() => onAddExisting(name)}
                  title={`add ${name}`}
                >
                  <span className="ws-palette__thumb">
                    <KindThumb kind={typeOf(name)} />
                  </span>
                  <span className="ws-palette__name">{name}</span>
                </button>
              ))
            )
          ) : (
            catalog.map((entry) => (
              <button
                key={entry.kind}
                type="button"
                className="ws-palette__item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "copy";
                  e.dataTransfer.setData("text/kp-add", JSON.stringify({ mode: "new", value: entry.kind }));
                }}
                onClick={() => onAddKind(entry.kind)}
                title={`add a new ${entry.label}`}
              >
                <span className="ws-palette__thumb">
                  <KindThumb kind={entry.kind} />
                </span>
                <span className="ws-palette__name">{entry.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Flow editor (nodes + edges for the React Flow component) ────────── */

function FlowEditor({
  nodes,
  edges,
  onNodes,
  onEdges,
}: {
  nodes: WsFlowNode[];
  edges: WsFlowEdge[];
  onNodes: (nodes: WsFlowNode[]) => void;
  onEdges: (edges: WsFlowEdge[]) => void;
}) {
  const ids = nodes.map((n) => n.id);
  const patchNode = (idx: number, p: Partial<WsFlowNode>) =>
    onNodes(
      nodes.map((n, i) => {
        if (i !== idx) return n;
        const next: Record<string, unknown> = { ...n, ...p };
        for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
        return next as unknown as WsFlowNode;
      }),
    );
  const patchEdge = (idx: number, p: Partial<WsFlowEdge>) =>
    onEdges(edges.map((e, i) => (i === idx ? { ...e, ...p } : e)));
  const addNode = () => {
    const taken = new Set(ids);
    let i = nodes.length + 1;
    let id = `node_${i}`;
    while (taken.has(id)) id = `node_${++i}`;
    onNodes([
      ...nodes,
      { id, label: `Node ${i}`, x: (nodes.length % 4) * 200, y: Math.floor(nodes.length / 4) * 130, color: "#7c9aff" },
    ]);
  };
  const removeNode = (n: WsFlowNode, idx: number) => {
    onNodes(nodes.filter((_, j) => j !== idx));
    onEdges(edges.filter((e) => e.source !== n.id && e.target !== n.id));
  };
  const addEdge = () => {
    if (ids.length < 2) return;
    onEdges([...edges, { source: ids[0]!, target: ids[1]!, animated: true }]);
  };

  return (
    <>
      <h4 className="ws-group">Nodes</h4>
      <div className="ws-flowlist">
        {nodes.map((n, i) => (
          <div key={n.id} className="ws-floweditnode">
            <div className="ws-flowrow">
              <input
                type="color"
                value={typeof n.color === "string" && /^#[0-9a-fA-F]{6}/.test(n.color) ? n.color.slice(0, 7) : "#7c9aff"}
                onChange={(e) => patchNode(i, { color: e.target.value })}
              />
              <input type="text" value={n.label ?? n.id} onChange={(e) => patchNode(i, { label: e.target.value })} />
              <button type="button" className="ws-btn" title="remove node" onClick={() => removeNode(n, i)}>
                ×
              </button>
            </div>
            <div className="ws-flowrow">
              <IconPicker value={n.icon} onChange={(icon) => patchNode(i, { icon })} />
              <input
                type="text"
                placeholder="subtitle"
                value={n.sublabel ?? ""}
                onChange={(e) => patchNode(i, { sublabel: e.target.value || undefined })}
              />
            </div>
          </div>
        ))}
        {nodes.length === 0 && <p className="ws-note">No nodes yet.</p>}
      </div>
      <button type="button" className="ws-btn" onClick={addNode}>
        + Add node
      </button>

      <h4 className="ws-group">Edges</h4>
      <div className="ws-flowlist">
        {edges.map((e, i) => (
          <div key={i} className="ws-flowrow">
            <select value={e.source} onChange={(ev) => patchEdge(i, { source: ev.target.value })}>
              {ids.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <span className="ws-flowrow__arrow">→</span>
            <select value={e.target} onChange={(ev) => patchEdge(i, { target: ev.target.value })}>
              {ids.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`ws-toggle ${e.animated ? "ws-toggle--on" : ""}`}
              title="animated"
              aria-pressed={Boolean(e.animated)}
              onClick={() => patchEdge(i, { animated: !e.animated })}
            >
              <i />
            </button>
            <button type="button" className="ws-btn" title="remove edge" onClick={() => onEdges(edges.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        {edges.length === 0 && <p className="ws-note">No edges yet.</p>}
      </div>
      <button type="button" className="ws-btn" onClick={addEdge} disabled={ids.length < 2}>
        + Add edge
      </button>
      <p className="ws-note">Drag nodes on the canvas to reposition — positions save with the component.</p>
    </>
  );
}

/* ── Sidebar tree ───────────────────────────────────────────────────── */

function TreeBranch({
  nodes,
  depth,
  selected,
  draftType,
  components,
  expanded,
  onToggle,
  onSelect,
}: {
  nodes: TreeNodeT[];
  depth: number;
  selected: string;
  draftType: string;
  components: Record<string, ComponentDef>;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
  onSelect: (name: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const isExpanded = expanded[node.path] ?? true;
        const type =
          node.name === selected ? draftType : (components[node.name]?.type ?? "new");
        return (
          <div key={node.path} className="ws-tree__node" role="treeitem" aria-expanded={node.children.length > 0 ? isExpanded : undefined}>
            <div className={`ws-item ${node.name === selected ? "ws-item--active" : ""}`}>
              {node.children.length > 0 ? (
                <button
                  type="button"
                  className="ws-chevron"
                  onClick={() => onToggle(node.path)}
                  aria-label={isExpanded ? "collapse" : "expand"}
                >
                  {isExpanded ? "▾" : "▸"}
                </button>
              ) : (
                <span className="ws-chevron ws-chevron--leaf" aria-hidden="true">
                  {depth > 0 ? "·" : ""}
                </span>
              )}
              <button type="button" className="ws-item__btn" onClick={() => onSelect(node.name)}>
                <Icon
                  icon={typeIconName(type)}
                  size={14}
                  className={`ws-item__icon ${isComponentTone(type) ? "ws-item__icon--component" : ""}`}
                />
                <code>{node.name}</code>
                <span className="ws-item__type">{type}</span>
              </button>
            </div>
            {node.children.length > 0 && isExpanded && (
              <div className="ws-tree__children">
                <TreeBranch
                  nodes={node.children}
                  depth={depth + 1}
                  selected={selected}
                  draftType={draftType}
                  components={components}
                  expanded={expanded}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ── Shared sidebar (components tree + controls list) ───────────────── */

function WorkshopSidebar({
  tree,
  selected,
  draftType,
  components,
  expanded,
  onToggleExpand,
  onSelect,
  controls,
  activeControl,
  onSelectControl,
  onNew,
}: {
  tree: TreeNodeT[];
  selected: string;
  draftType: string;
  components: Record<string, ComponentDef>;
  expanded: Record<string, boolean>;
  onToggleExpand: (path: string) => void;
  onSelect: (name: string) => void;
  controls: string[];
  activeControl: string | null;
  onSelectControl: (name: string) => void;
  onNew: () => void;
}) {
  return (
    <aside className="workshop__sidebar">
      <div className="workshop__sidebar-head">
        <span>Components</span>
        <button type="button" className="ws-btn" onClick={onNew} title="New component or control">
          +
        </button>
      </div>
      <div className="ws-tree" role="tree">
        <TreeBranch
          nodes={tree}
          depth={0}
          selected={selected}
          draftType={draftType}
          components={components}
          expanded={expanded}
          onToggle={onToggleExpand}
          onSelect={onSelect}
        />
      </div>
      {controls.length > 0 && (
        <>
          <div className="workshop__sidebar-head workshop__sidebar-head--sub">
            <span>Controls</span>
          </div>
          <div className="ws-tree" role="tree">
            {controls.map((name) => (
              <div key={name} className="ws-tree__node" role="treeitem">
                <div className={`ws-item ${name === activeControl ? "ws-item--active" : ""}`}>
                  <span className="ws-chevron ws-chevron--leaf" aria-hidden="true" />
                  <button type="button" className="ws-item__btn" onClick={() => onSelectControl(name)}>
                    <Icon icon="lucide:sliders-horizontal" size={14} className="ws-item__icon" />
                    <code>{name}</code>
                    <span className="ws-item__type">control</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="workshop__sidebar-note">
        Click any component or control to edit it. Datasets are defined in YAML.
      </p>
    </aside>
  );
}

/* ── Control editor (first-class control editing) ───────────────────── */

const CONTROL_TYPES = ["dropdown", "slider", "toggle"] as const;

function ControlEditor({
  name,
  def,
  onChange,
  columns,
  previewDoc,
  data,
  yaml,
  issues,
  dirty,
  saving,
  saveError,
  onSave,
  collapsed,
  onToggle,
  sidebar,
  wizard,
}: {
  name: string;
  def: ControlDef;
  onChange: (p: Partial<ControlDef>) => void;
  columns: string[];
  previewDoc: IRDocument;
  data: Record<string, DataTable>;
  yaml: string;
  issues: { severity: string }[];
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
  sidebar: React.ReactNode;
  wizard: React.ReactNode;
}) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const optStr = (k: keyof ControlDef): string => {
    const v = def[k];
    return typeof v === "string" || typeof v === "number" ? String(v) : "";
  };
  return (
    <div className="workshop">
      {sidebar}

      <section className="workshop__canvas">
        <div className="workshop__canvas-bar">
          <span className="workshop__canvas-hint">live control preview — reactive in the reader</span>
          <span className="workshop__canvas-note">control · {def.type}</span>
        </div>
        <div className="workshop__stage">
          <div className="kp-doc" style={{ width: "min(420px, 100%)" }}>
            <DocSyncProvider doc={previewDoc}>
              <LiveControl name={name} def={def} doc={previewDoc} dataMap={data} />
            </DocSyncProvider>
          </div>
        </div>
      </section>

      <aside className="workshop__panel">
        <header className="ws-inspector__title">
          <code>{name}</code>
          <span className="ws-item__type">control</span>
        </header>
        <div className="workshop__panel-body ws-inspector">
          <Section id="ctl-control" title="Control" collapsed={collapsed} onToggle={onToggle}>
            <Field label="type">
              <select value={def.type} onChange={(e) => onChange({ type: e.target.value as ControlDef["type"] })}>
                {CONTROL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="label">
              <input type="text" value={optStr("label")} onChange={(e) => onChange({ label: e.target.value })} />
            </Field>
          </Section>

          <Section id="ctl-appearance" title="Appearance" collapsed={collapsed} onToggle={onToggle}>
            {CONTROL_STYLE_SPECS.map((spec) => (
              <OptionRow
                key={spec.key}
                spec={spec}
                value={controlStyleValue(def, spec)}
                explicit={(def as unknown as Record<string, unknown>)[spec.key] !== undefined}
                onChange={(value) => onChange({ [spec.key]: value } as Partial<ControlDef>)}
              />
            ))}
          </Section>

          <Section id="ctl-behavior" title="Behavior" collapsed={collapsed} onToggle={onToggle}>
            <Field label="field">
              <select value={def.field ?? ""} onChange={(e) => onChange({ field: e.target.value || undefined })}>
                <option value="">— auto (target's filter) —</option>
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            {def.type === "slider" && (
              <>
                <Field label="min">
                  <input type="number" value={def.min ?? 0} onChange={(e) => onChange({ min: Number(e.target.value) })} />
                </Field>
                <Field label="max">
                  <input type="number" value={def.max ?? 100} onChange={(e) => onChange({ max: Number(e.target.value) })} />
                </Field>
                <Field label="step">
                  <input type="number" value={def.step ?? 1} onChange={(e) => onChange({ step: Number(e.target.value) })} />
                </Field>
                <Field label="mode">
                  <select value={def.mode ?? "max"} onChange={(e) => onChange({ mode: e.target.value as "max" | "min" })}>
                    <option value="max">max — keep rows ≤ value</option>
                    <option value="min">min — keep rows ≥ value</option>
                  </select>
                </Field>
              </>
            )}
            {def.type === "toggle" && (
              <Field label="keep value">
                <input type="text" placeholder="true" value={optStr("value")} onChange={(e) => onChange({ value: e.target.value || undefined })} />
              </Field>
            )}
            {def.type === "dropdown" && (
              <>
                <Field label="options">
                  <select
                    value={def.options === "dynamic" || def.options === undefined ? "dynamic" : "custom"}
                    onChange={(e) => onChange({ options: e.target.value === "dynamic" ? "dynamic" : [] })}
                  >
                    <option value="dynamic">dynamic (from data)</option>
                    <option value="custom">custom list</option>
                  </select>
                </Field>
                {Array.isArray(def.options) && (
                  <Field label="values">
                    <input
                      type="text"
                      placeholder="A,B,C"
                      value={def.options.map(String).join(",")}
                      onChange={(e) => onChange({ options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
                    />
                  </Field>
                )}
                <Field label="placeholder">
                  <input type="text" value={optStr("placeholder")} onChange={(e) => onChange({ placeholder: e.target.value || undefined })} />
                </Field>
              </>
            )}
            <p className="ws-note">
              The Phase 3 engine filters this field document-wide. Bind it to components from a
              component's Interaction section.
            </p>
          </Section>

          <Section id="ctl-yaml" title="YAML" collapsed={collapsed} onToggle={onToggle}>
            <pre className="ir-json">{yaml}</pre>
          </Section>
        </div>

        <footer className="workshop__footer">
          <span className={`pill ${errors.length ? "pill--error" : "pill--ok"}`}>
            {errors.length ? `${errors.length} error(s)` : "valid IR"}
          </span>
          {warnings.length > 0 && <span className="pill pill--warn">{warnings.length} warning(s)</span>}
          <button
            type="button"
            className="ws-btn ws-btn--primary"
            disabled={!dirty || saving || errors.length > 0}
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save to YAML"}
          </button>
          {saveError && <span className="workshop__save-error">{saveError}</span>}
          {dirty && !saveError && <span className="ws-note">unsaved changes</span>}
        </footer>
      </aside>
      {wizard}
    </div>
  );
}

/* ── New-component wizard ───────────────────────────────────────────── */

function CreateWizard({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, kind: string) => string | null;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = new Map<string, KindEntry[]>();
  for (const entry of TYPE_CATALOG) {
    groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  }

  const submit = () => {
    if (!kind) return;
    const result = onCreate(name, kind);
    setError(result);
  };

  return (
    <div className="ws-wizard" role="dialog" aria-modal="true" aria-label="New component">
      <div className="ws-wizard__panel">
        <header className="ws-wizard__head">
          <h3>New component</h3>
          <button type="button" className="ws-btn" onClick={onClose} aria-label="close">
            ✕
          </button>
        </header>
        <label className="ws-field">
          <span className="ws-field__label">name</span>
          <input
            type="text"
            autoFocus
            value={name}
            placeholder="my_component"
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </label>
        {error && <p className="ws-wizard__error">{error}</p>}
        {[...groups.entries()].map(([group, entries]) => (
          <div key={group}>
            <h4 className="ws-group">{group}</h4>
            <div className="ws-wizard__grid">
              {entries.map((entry) => (
                <button
                  key={entry.kind}
                  type="button"
                  className={`ws-kind ${kind === entry.kind ? "ws-kind--active" : ""}`}
                  onClick={() => setKind(entry.kind)}
                >
                  <span className="ws-kind__thumb">
                    <KindThumb kind={entry.kind} />
                  </span>
                  <span className="ws-kind__body">
                    <span className="ws-kind__name">{entry.label}</span>
                    <span className="ws-kind__desc">{entry.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <footer className="ws-wizard__footer">
          <button type="button" className="ws-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ws-btn ws-btn--primary"
            disabled={!name.trim() || !kind}
            onClick={submit}
          >
            Create
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Tiny wireframe previews for the catalog (shadcn-gallery style). */
function KindThumb({ kind }: { kind: string }) {
  const muted = "#8a94a6";
  const accent = "#7c9aff";
  const mint = "#7fd1b9";
  const common = { fill: "none", stroke: muted, strokeWidth: 1.4 } as const;
  switch (kind) {
    case "card":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <rect x="14" y="6" width="56" height="32" rx="6" {...common} />
          <rect x="20" y="12" width="20" height="14" rx="3" fill={accent} opacity={0.5} />
          <rect x="44" y="12" width="20" height="14" rx="3" fill={mint} opacity={0.5} />
          <rect x="20" y="30" width="44" height="3" rx="1.5" fill={muted} opacity={0.5} />
        </svg>
      );
    case "histogram":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          {[8, 16, 26, 20, 30, 22, 12].map((h, i) => (
            <rect key={i} x={14 + i * 9} y={38 - h} width={7} height={h} rx={1.5} fill={accent} opacity={0.75} />
          ))}
        </svg>
      );
    case "bars":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          {[24, 32, 18, 28].map((h, i) => (
            <rect key={i} x={16 + i * 14} y={38 - h} width={10} height={h} rx={3} fill={mint} opacity={0.8} />
          ))}
        </svg>
      );
    case "area":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <path d="M 12 36 C 24 18, 34 30, 44 20 S 64 10, 72 16 L 72 38 L 12 38 Z" fill={accent} opacity={0.4} />
          <path d="M 12 36 C 24 18, 34 30, 44 20 S 64 10, 72 16" {...common} stroke={accent} />
        </svg>
      );
    case "dots":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          {[[20, 28], [28, 18], [36, 24], [44, 12], [52, 20], [60, 9], [66, 16], [32, 33]].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={3} fill={accent} opacity={0.8} />
          ))}
        </svg>
      );
    case "donut":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <circle cx="42" cy="22" r="13" fill="none" stroke={muted} strokeWidth="7" opacity={0.4} />
          <circle cx="42" cy="22" r="13" fill="none" stroke={accent} strokeWidth="7" strokeDasharray="50 32" transform="rotate(-90 42 22)" />
        </svg>
      );
    case "density":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <path d="M 12 38 C 28 36, 30 12, 42 12 S 56 34, 72 38 Z" fill={accent} opacity={0.35} />
          <path d="M 12 38 C 28 36, 30 12, 42 12 S 56 34, 72 38" {...common} stroke={accent} />
        </svg>
      );
    case "violin":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <path d="M 28 5 C 18 16, 18 28, 28 39 C 38 28, 38 16, 28 5 Z" fill={accent} opacity={0.4} />
          <line x1="28" y1="7" x2="28" y2="37" stroke={accent} strokeWidth={1.2} />
          <rect x="25" y="17" width="6" height="11" rx="1.5" fill={accent} />
          <path d="M 56 9 C 48 18, 48 27, 56 36 C 64 27, 64 18, 56 9 Z" fill={mint} opacity={0.45} />
          <line x1="56" y1="10" x2="56" y2="35" stroke={mint} strokeWidth={1.2} />
          <rect x="53" y="19" width="6" height="9" rx="1.5" fill={mint} />
        </svg>
      );
    case "box":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <line x1="30" y1="6" x2="30" y2="14" stroke={accent} strokeWidth={1.4} />
          <rect x="22" y="14" width="16" height="16" rx="2" fill={accent} opacity={0.4} stroke={accent} strokeWidth={1.2} />
          <line x1="22" y1="22" x2="38" y2="22" stroke="#fff" strokeWidth={1.4} />
          <line x1="30" y1="30" x2="30" y2="38" stroke={accent} strokeWidth={1.4} />
          <line x1="54" y1="10" x2="54" y2="16" stroke={mint} strokeWidth={1.4} />
          <rect x="46" y="16" width="16" height="14" rx="2" fill={mint} opacity={0.4} stroke={mint} strokeWidth={1.2} />
          <line x1="46" y1="24" x2="62" y2="24" stroke="#fff" strokeWidth={1.4} />
          <line x1="54" y1="30" x2="54" y2="36" stroke={mint} strokeWidth={1.4} />
        </svg>
      );
    case "threshold":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <path d="M 12 18 C 22 22, 32 30, 42 26 L 42 32 C 32 36, 22 28, 12 24 Z" fill="#e0aaff" opacity={0.6} />
          <path d="M 42 26 C 54 22, 62 12, 72 16 L 72 22 C 62 18, 54 28, 42 32 Z" fill={mint} opacity={0.6} />
          <path d="M 12 18 C 22 22, 32 30, 42 26 S 62 12, 72 16" fill="none" stroke={accent} strokeWidth={1.5} />
          <path d="M 12 24 C 22 28, 32 22, 42 32 S 62 18, 72 22" fill="none" stroke={muted} strokeWidth={1.2} strokeDasharray="2 2" />
        </svg>
      );
    case "bands":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <path d="M 12 26 C 30 18, 48 14, 72 12 L 72 20 C 48 22, 30 26, 12 32 Z" fill={accent} opacity={0.18} />
          <path d="M 12 29 C 30 22, 48 18, 72 15" fill="none" stroke={accent} strokeWidth={2} />
          <path d="M 12 33 C 30 28, 48 25, 72 23" fill="none" stroke={mint} strokeWidth={2} />
          <path d="M 12 37 C 30 34, 48 33, 72 31" fill="none" stroke="#e0aaff" strokeWidth={2} />
        </svg>
      );
    case "panels":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          {[
            [6, 5, accent],
            [44, 5, "#e0aaff"],
            [6, 25, mint],
            [44, 25, "#f0a3c0"],
          ].map(([gx, gy, col], i) => (
            <g key={i} transform={`translate(${gx}, ${gy})`}>
              <rect x={0} y={0} width={34} height={16} rx={3} fill="rgba(255,255,255,0.04)" stroke={muted} strokeOpacity={0.4} />
              <path d="M 3 12 C 9 4, 17 6, 31 3" fill="none" stroke={col as string} strokeWidth={1.4} />
              <path d="M 3 13 C 9 8, 17 9, 31 7" fill="none" stroke={col as string} strokeWidth={1.1} strokeDasharray="2 1.5" opacity={0.8} />
            </g>
          ))}
        </svg>
      );
    case "sparkline":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <polyline points="14,30 26,24 36,28 48,16 58,20 70,12" {...common} stroke={mint} strokeWidth={2} />
          <circle cx="70" cy="12" r="2.5" fill={mint} />
        </svg>
      );
    case "chart":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <polyline points="14,34 28,26 42,30 56,16 70,10" {...common} stroke={accent} strokeWidth={2} />
        </svg>
      );
    case "table":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <rect x="16" y="8" width="52" height="6" rx="2" fill={accent} opacity={0.5} />
          {[18, 26, 34].map((y) => (
            <rect key={y} x="16" y={y} width="52" height="4" rx="2" fill={muted} opacity={0.45} />
          ))}
        </svg>
      );
    case "summary_table":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          {[10, 20, 30].map((y, i) => (
            <g key={y}>
              <rect x="14" y={y} width="14" height="5" rx="2.5" fill={i === 1 ? mint : accent} opacity={0.7} />
              <rect x="32" y={y} width="22" height="5" rx="2" fill={muted} opacity={0.4} />
              <polyline points={`58,${y + 4} 62,${y + 1} 66,${y + 3} 70,${y}`} fill="none" stroke={mint} strokeWidth={1.4} />
            </g>
          ))}
        </svg>
      );
    case "diagram":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <rect x="34" y="5" width="16" height="8" rx="3" {...common} />
          <rect x="16" y="24" width="14" height="8" rx="3" {...common} stroke={accent} />
          <rect x="54" y="24" width="14" height="8" rx="3" {...common} stroke={accent} />
          <path d="M 42 13 C 42 18, 23 19, 23 24 M 42 13 C 42 18, 61 19, 61 24" {...common} />
          {[20, 26, 58, 64].map((cx, i) => (
            <circle key={i} cx={cx} cy={38} r={2.2} fill={accent} opacity={0.8} />
          ))}
        </svg>
      );
    case "flow":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <line x1="28" y1="22" x2="40" y2="22" stroke={muted} strokeWidth={1.4} />
          <line x1="56" y1="22" x2="68" y2="13" stroke={muted} strokeWidth={1.4} />
          <line x1="56" y1="22" x2="68" y2="31" stroke={muted} strokeWidth={1.4} />
          <rect x="12" y="16" width="16" height="12" rx="3" fill={accent} opacity={0.85} />
          <rect x="40" y="16" width="16" height="12" rx="3" fill={mint} opacity={0.85} />
          <rect x="68" y="7" width="14" height="11" rx="3" {...common} stroke={accent} />
          <rect x="68" y="26" width="14" height="11" rx="3" {...common} stroke={mint} />
        </svg>
      );
    case "code":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <rect x="16" y="6" width="52" height="32" rx="5" {...common} />
          <line x1="16" y1="14" x2="68" y2="14" stroke={muted} strokeWidth={1.2} />
          <text x="42" y="31" textAnchor="middle" fontSize="13" fontFamily="ui-monospace, Menlo, monospace" fill={accent}>
            {"</>"}
          </text>
        </svg>
      );
    case "sql":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <rect x="16" y="6" width="52" height="32" rx="5" {...common} />
          <line x1="16" y1="14" x2="68" y2="14" stroke={muted} strokeWidth={1.2} />
          <text x="22" y="25" fontSize="7" fontFamily="ui-monospace, Menlo, monospace" fill={accent}>
            SELECT
          </text>
          <rect x="22" y="29" width="18" height="3" rx="1.5" fill={mint} opacity={0.7} />
          <rect x="43" y="29" width="22" height="3" rx="1.5" fill={muted} opacity={0.45} />
        </svg>
      );
    case "control:dropdown":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <rect x="14" y="14" width="56" height="16" rx="8" {...common} />
          <rect x="20" y="20" width="26" height="4" rx="2" fill={muted} opacity={0.5} />
          <path d="M 58 19 L 62 24 L 66 19" {...common} stroke={accent} />
        </svg>
      );
    case "control:slider":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <line x1="16" y1="22" x2="68" y2="22" stroke={muted} strokeWidth={3} strokeLinecap="round" opacity={0.5} />
          <line x1="16" y1="22" x2="46" y2="22" stroke={accent} strokeWidth={3} strokeLinecap="round" />
          <circle cx="46" cy="22" r="6" fill="#dbe2ea" />
        </svg>
      );
    case "control:toggle":
      return (
        <svg viewBox="0 0 84 44" width="84" height="44">
          <rect x="26" y="14" width="32" height="16" rx="8" fill={mint} opacity={0.7} />
          <circle cx="50" cy="22" r="6" fill="#fff" />
        </svg>
      );
    default:
      return <HeroThumb kind={kind} muted={muted} accent={accent} mint={mint} common={common} />;
  }
}

/** Representative thumbnails for the HeroUI catalog (falls back to a chip glyph). */
function HeroThumb({
  kind,
  muted,
  accent,
  mint,
  common,
}: {
  kind: string;
  muted: string;
  accent: string;
  mint: string;
  common: { fill: string; stroke: string; strokeWidth: number };
}) {
  const box = (children: React.ReactNode) => (
    <svg viewBox="0 0 84 44" width="84" height="44">
      {children}
    </svg>
  );
  switch (kind) {
    case "button":
      return box(<rect x="22" y="15" width="40" height="15" rx="7" fill={accent} />);
    case "chip":
      return box(<rect x="26" y="16" width="32" height="13" rx="6.5" fill={mint} opacity={0.85} />);
    case "badge":
      return box(<>
        <rect x="24" y="14" width="24" height="18" rx="4" {...common} />
        <circle cx="50" cy="14" r="6" fill="#ef6363" />
      </>);
    case "avatar":
    case "user":
      return box(<>
        <circle cx="30" cy="22" r="10" fill={accent} opacity={0.7} />
        {kind === "user" && <><rect x="44" y="16" width="24" height="4" rx="2" fill={muted} /><rect x="44" y="24" width="16" height="3" rx="1.5" fill={muted} opacity={0.5} /></>}
      </>);
    case "alert":
    case "toast":
      return box(<>
        <rect x="14" y="13" width="56" height="18" rx="5" fill={accent} opacity={0.18} stroke={accent} strokeWidth={1} />
        <circle cx="23" cy="22" r="3" fill={accent} />
        <rect x="30" y="20" width="32" height="4" rx="2" fill={muted} opacity={0.6} />
      </>);
    case "progress":
      return box(<>
        <rect x="16" y="20" width="52" height="5" rx="2.5" fill={muted} opacity={0.3} />
        <rect x="16" y="20" width="32" height="5" rx="2.5" fill={accent} />
      </>);
    case "circular_progress":
    case "spinner":
      return box(<circle cx="42" cy="22" r="11" fill="none" stroke={accent} strokeWidth="3.5" strokeDasharray="52 30" strokeLinecap="round" />);
    case "tabs":
      return box(<>
        <rect x="14" y="15" width="56" height="14" rx="7" fill={muted} opacity={0.18} />
        <rect x="16" y="17" width="20" height="10" rx="5" fill={accent} />
      </>);
    case "accordion":
      return box(<>
        <rect x="16" y="10" width="52" height="9" rx="2" {...common} />
        <rect x="16" y="21" width="52" height="9" rx="2" {...common} />
        <rect x="16" y="32" width="52" height="6" rx="2" fill={accent} opacity={0.3} />
      </>);
    case "input":
    case "textarea":
    case "number_input":
    case "autocomplete":
    case "date_input":
      return box(<>
        <rect x="16" y="14" width="52" height="17" rx="5" {...common} />
        <rect x="21" y="21" width="22" height="4" rx="2" fill={muted} opacity={0.5} />
      </>);
    case "checkbox":
      return box(<>
        <rect x="22" y="16" width="13" height="13" rx="3" fill={accent} />
        <rect x="40" y="20" width="22" height="4" rx="2" fill={muted} opacity={0.6} />
      </>);
    case "radio_group":
      return box(<>
        <circle cx="26" cy="16" r="4" fill={accent} /><rect x="34" y="14" width="22" height="3.5" rx="1.75" fill={muted} opacity={0.6} />
        <circle cx="26" cy="28" r="4" fill="none" stroke={muted} /><rect x="34" y="26" width="22" height="3.5" rx="1.75" fill={muted} opacity={0.4} />
      </>);
    case "input_otp":
      return box([14, 31, 48, 65].map((x) => <rect key={x} x={x - 1} y="15" width="12" height="15" rx="3" {...common} />));
    case "pagination":
      return box([18, 33, 48, 63].map((x, i) => <rect key={x} x={x} y="16" width="11" height="13" rx="3" fill={i === 1 ? accent : "none"} stroke={i === 1 ? "none" : muted} strokeWidth={1.2} />));
    case "breadcrumbs":
      return box(<>
        <rect x="12" y="20" width="14" height="4" rx="2" fill={muted} opacity={0.6} />
        <text x="30" y="24" fontSize="7" fill={muted}>/</text>
        <rect x="36" y="20" width="14" height="4" rx="2" fill={muted} opacity={0.6} />
        <text x="54" y="24" fontSize="7" fill={muted}>/</text>
        <rect x="60" y="20" width="12" height="4" rx="2" fill={accent} />
      </>);
    case "navbar":
      return box(<>
        <rect x="12" y="14" width="60" height="16" rx="4" {...common} />
        <circle cx="20" cy="22" r="3" fill={accent} />
        <rect x="40" y="20" width="10" height="3" rx="1.5" fill={muted} opacity={0.6} />
        <rect x="54" y="20" width="12" height="5" rx="2.5" fill={accent} opacity={0.5} />
      </>);
    case "modal":
    case "drawer":
    case "popover":
      return box(<>
        <rect x="10" y="8" width="64" height="28" rx="4" fill="#000" opacity={0.18} />
        <rect x="22" y="13" width="40" height="20" rx="4" fill={accent} opacity={0.25} stroke={accent} strokeWidth={1} />
      </>);
    case "tooltip":
      return box(<>
        <rect x="26" y="22" width="32" height="11" rx="4" fill={muted} opacity={0.25} />
        <rect x="30" y="26" width="20" height="3" rx="1.5" fill={muted} />
      </>);
    case "divider":
      return box(<line x1="16" y1="22" x2="68" y2="22" stroke={muted} strokeWidth="1.5" />);
    case "spacer":
      return box(<><rect x="16" y="18" width="22" height="8" rx="2" fill={muted} opacity={0.3} /><rect x="46" y="18" width="22" height="8" rx="2" fill={muted} opacity={0.3} /></>);
    case "kbd":
      return box(<rect x="30" y="14" width="24" height="16" rx="4" {...common} />);
    case "link":
      return box(<><rect x="22" y="20" width="40" height="3.5" rx="1.75" fill={accent} /><rect x="22" y="26" width="40" height="1" fill={accent} opacity={0.5} /></>);
    case "image":
      return box(<><rect x="20" y="10" width="44" height="24" rx="4" fill={accent} opacity={0.2} stroke={accent} strokeWidth={1} /><circle cx="30" cy="18" r="3" fill={accent} /><path d="M22 32 L34 22 L44 30 L52 24 L62 32 Z" fill={accent} opacity={0.5} /></>);
    case "snippet":
      return box(<><rect x="14" y="15" width="56" height="15" rx="4" {...common} /><text x="20" y="26" fontSize="8" fontFamily="monospace" fill={mint}>$_</text></>);
    case "skeleton":
      return box(<><rect x="16" y="15" width="52" height="5" rx="2.5" fill={muted} opacity={0.3} /><rect x="16" y="24" width="36" height="5" rx="2.5" fill={muted} opacity={0.2} /></>);
    case "calendar":
      return box(<>
        <rect x="20" y="9" width="44" height="28" rx="4" {...common} />
        {[0, 1, 2, 3].map((c) => [0, 1].map((r) => <rect key={`${c}-${r}`} x={26 + c * 9} y={18 + r * 8} width="5" height="5" rx="1" fill={c === 1 && r === 0 ? accent : muted} opacity={c === 1 && r === 0 ? 1 : 0.4} />))}
      </>);
    case "listbox":
    case "dropdown":
      return box([13, 21, 29].map((y) => <rect key={y} x="22" y={y} width="40" height="5" rx="2" fill={y === 13 ? accent : muted} opacity={y === 13 ? 0.6 : 0.35} />));
    case "scroll_shadow":
      return box(<><rect x="20" y="10" width="44" height="24" rx="3" {...common} /><rect x="24" y="14" width="36" height="3" rx="1.5" fill={muted} opacity={0.5} /><rect x="24" y="20" width="36" height="3" rx="1.5" fill={muted} opacity={0.35} /></>);
    default:
      return box(<rect x="26" y="16" width="32" height="13" rx="6.5" fill={accent} opacity={0.6} />);
  }
}

/* ── Figma-style inspector sections ─────────────────────────────────── */

function Section({
  id,
  title,
  collapsed,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const isCollapsed = collapsed[id] ?? false;
  return (
    <section className="ws-section">
      <button type="button" className="ws-section__head" onClick={() => onToggle(id)}>
        <span>{title}</span>
        <span className="ws-section__chevron">{isCollapsed ? "+" : "−"}</span>
      </button>
      {!isCollapsed && <div className="ws-section__body">{children}</div>}
    </section>
  );
}

/* ── Spec-driven option controls (Storybook-style rows, Figma sections) ─ */

function OptionSections({
  specs,
  def,
  onChange,
  collapsed,
  onToggle,
  mode = "advanced",
  type = "",
}: {
  specs: OptionSpec[];
  def: ComponentDef;
  onChange: (key: string, value: unknown) => void;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
  mode?: InspectorMode;
  type?: string;
}) {
  if (specs.length === 0) {
    if (mode === "simple") return null;
    return (
      <Section id="options" title="Options" collapsed={collapsed} onToggle={onToggle}>
        <p className="ws-note">No options published for this component type yet.</p>
      </Section>
    );
  }
  // Simple mode: one "Style" section showing only the essential options with
  // plain-language labels (driven by friendly.ts, an editor-only concern).
  if (mode === "simple") {
    const essentialKeys = ESSENTIAL_OPTIONS[type] ?? specs.slice(0, SIMPLE_FALLBACK_COUNT).map((s) => s.key);
    const list = essentialKeys
      .map((key) => specs.find((s) => s.key === key))
      .filter((s): s is OptionSpec => Boolean(s));
    if (list.length === 0) return null;
    return (
      <Section id="opt:simple" title="Style" collapsed={collapsed} onToggle={onToggle}>
        {list.map((spec) => (
          <OptionRow
            key={spec.key}
            spec={spec}
            label={friendlyLabel(spec.key, spec.label)}
            value={optionValue(def, spec)}
            explicit={def.options?.[spec.key] !== undefined}
            onChange={(value) => onChange(spec.key, value)}
          />
        ))}
      </Section>
    );
  }
  const groups = new Map<string, OptionSpec[]>();
  for (const spec of specs) {
    groups.set(spec.group, [...(groups.get(spec.group) ?? []), spec]);
  }
  return (
    <>
      {[...groups.entries()].map(([group, list]) => (
        <Section
          key={group}
          id={`opt:${group}`}
          title={group}
          collapsed={collapsed}
          onToggle={onToggle}
        >
          {list.map((spec) => (
            <OptionRow
              key={spec.key}
              spec={spec}
              value={optionValue(def, spec)}
              explicit={def.options?.[spec.key] !== undefined}
              onChange={(value) => onChange(spec.key, value)}
            />
          ))}
        </Section>
      ))}
    </>
  );
}

function OptionRow({
  spec,
  value,
  explicit,
  onChange,
  label,
}: {
  spec: OptionSpec;
  value: unknown;
  explicit: boolean;
  onChange: (value: unknown | undefined) => void;
  label?: string;
}) {
  return (
    <div className="ws-option-row">
      <span className="ws-field__label">{label ?? spec.label}</span>
      <OptionControlInput spec={spec} value={value} onChange={onChange} />
      <button
        type="button"
        className="ws-reset"
        title="Reset to spec default"
        onClick={() => onChange(undefined)}
        disabled={!explicit}
      >
        ↺
      </button>
    </div>
  );
}

function OptionControlInput({
  spec,
  value,
  onChange,
}: {
  spec: OptionSpec;
  value: unknown;
  onChange: (value: unknown | undefined) => void;
}) {
  switch (spec.control) {
    case "color": {
      const isHex = typeof value === "string" && /^#[0-9a-fA-F]{6}/.test(value);
      const transparent =
        value === "transparent" ||
        (typeof value === "string" && /^#[0-9a-fA-F]{8}$/.test(value) && value.toLowerCase().endsWith("00"));
      return (
        <span className="ws-colorbox">
          <input
            type="color"
            value={isHex && !transparent ? (value).slice(0, 7) : "#7c9aff"}
            onChange={(e) => onChange(e.target.value)}
          />
          {transparent && <span className="ws-color-note">transparent</span>}
        </span>
      );
    }
    case "range": {
      const n = typeof value === "number" ? value : Number(spec.default) || 0;
      return (
        <span className="ws-range">
          <input
            type="range"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={n}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <code>{n}</code>
        </span>
      );
    }
    case "number":
      return (
        <input
          type="number"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={typeof value === "number" ? value : Number(spec.default) || 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      );
    case "toggle":
      return (
        <button
          type="button"
          className={`ws-toggle ${value === true ? "ws-toggle--on" : ""}`}
          onClick={() => onChange(value !== true)}
          aria-pressed={value === true}
        >
          <i />
        </button>
      );
    case "select":
      return (
        <select value={String(value ?? spec.default ?? "")} onChange={(e) => onChange(e.target.value)}>
          {(spec.choices ?? []).map((choice) => (
            <option key={String(choice)} value={String(choice)}>
              {String(choice)}
            </option>
          ))}
        </select>
      );
    case "icon":
      return (
        <IconPicker
          value={typeof value === "string" && value ? value : undefined}
          onChange={(icon) => onChange(icon)}
        />
      );
    case "text":
    default:
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          placeholder={typeof spec.default === "string" ? spec.default : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
  }
}
