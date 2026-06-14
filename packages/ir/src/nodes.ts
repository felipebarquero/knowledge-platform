import { z } from "zod";

/**
 * IR node taxonomy (v0.1).
 *
 * Nodes are content only. Data-driven and interaction nodes carry *references*
 * into the component / dataset / interaction registries — never definitions,
 * never logic, never state.
 */

export interface HeadingNode {
  type: "heading";
  id?: string;
  level: number;
  text: string;
}

export interface ParagraphNode {
  type: "paragraph";
  id?: string;
  text: string;
}

export interface ListNode {
  type: "list";
  id?: string;
  ordered: boolean;
  items: string[];
}

export interface EquationNode {
  type: "equation";
  id?: string;
  tex: string;
  display: boolean;
}

export interface CalloutNode {
  type: "callout";
  id?: string;
  kind?: string;
  text: string;
}

/** Additive in 0.1: fenced code blocks (previously dropped by the compiler). */
export interface CodeNode {
  type: "code";
  id?: string;
  language?: string;
  value: string;
}

export interface DatasetNode {
  type: "dataset";
  id?: string;
  ref: string;
}

export interface ComponentNode {
  type: "component";
  id?: string;
  ref: string;
}

export interface TableNode {
  type: "table";
  id?: string;
  ref: string;
}

export interface PlotNode {
  type: "plot";
  id?: string;
  ref: string;
}

export interface ChartNode {
  type: "chart";
  id?: string;
  ref: string;
}

export interface ControlNode {
  type: "control";
  id?: string;
  ref: string;
}

export interface SyncBindingNode {
  type: "sync_binding";
  id?: string;
  source: string;
  target: string;
  action: string;
}

export interface SectionNode {
  type: "section";
  id?: string;
  title?: string;
  children: IRNode[];
}

export interface LayoutGridNode {
  type: "layout_grid";
  id?: string;
  columns: number;
  /** Additive in 0.1: gap/padding in px (presentation hints, renderer-owned). */
  gap?: number;
  padding?: number;
  children: IRNode[];
}

export interface TabsNode {
  type: "tabs";
  id?: string;
  tabs: { label: string; children: IRNode[] }[];
}

export type IRNode =
  | HeadingNode
  | ParagraphNode
  | ListNode
  | EquationNode
  | CalloutNode
  | CodeNode
  | DatasetNode
  | ComponentNode
  | TableNode
  | PlotNode
  | ChartNode
  | ControlNode
  | SyncBindingNode
  | SectionNode
  | LayoutGridNode
  | TabsNode;

const id = z.string().optional();
const ref = z.string().min(1);

const headingSchema = z
  .object({ type: z.literal("heading"), id, level: z.number().int().min(1).max(6), text: z.string() })
  .strict();

const paragraphSchema = z
  .object({ type: z.literal("paragraph"), id, text: z.string() })
  .strict();

const listSchema = z
  .object({ type: z.literal("list"), id, ordered: z.boolean(), items: z.array(z.string()) })
  .strict();

const equationSchema = z
  .object({ type: z.literal("equation"), id, tex: z.string(), display: z.boolean() })
  .strict();

const calloutSchema = z
  .object({ type: z.literal("callout"), id, kind: z.string().optional(), text: z.string() })
  .strict();

const codeSchema = z
  .object({ type: z.literal("code"), id, language: z.string().optional(), value: z.string() })
  .strict();

const datasetNodeSchema = z.object({ type: z.literal("dataset"), id, ref }).strict();
const componentNodeSchema = z.object({ type: z.literal("component"), id, ref }).strict();
const tableNodeSchema = z.object({ type: z.literal("table"), id, ref }).strict();
const plotNodeSchema = z.object({ type: z.literal("plot"), id, ref }).strict();
const chartNodeSchema = z.object({ type: z.literal("chart"), id, ref }).strict();
const controlNodeSchema = z.object({ type: z.literal("control"), id, ref }).strict();

const syncBindingSchema = z
  .object({ type: z.literal("sync_binding"), id, source: ref, target: ref, action: z.string().min(1) })
  .strict();

const sectionSchema = z
  .object({
    type: z.literal("section"),
    id,
    title: z.string().optional(),
    children: z.array(z.lazy(() => nodeSchema)),
  })
  .strict();

const layoutGridSchema = z
  .object({
    type: z.literal("layout_grid"),
    id,
    columns: z.number().int().min(1).max(12),
    gap: z.number().min(0).max(64).optional(),
    padding: z.number().min(0).max(64).optional(),
    children: z.array(z.lazy(() => nodeSchema)),
  })
  .strict();

const tabsSchema = z
  .object({
    type: z.literal("tabs"),
    id,
    tabs: z
      .array(z.object({ label: z.string(), children: z.array(z.lazy(() => nodeSchema)) }).strict())
      .min(1),
  })
  .strict();

export const nodeSchema: z.ZodType<IRNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    headingSchema,
    paragraphSchema,
    listSchema,
    equationSchema,
    calloutSchema,
    codeSchema,
    datasetNodeSchema,
    componentNodeSchema,
    tableNodeSchema,
    plotNodeSchema,
    chartNodeSchema,
    controlNodeSchema,
    syncBindingSchema,
    sectionSchema,
    layoutGridSchema,
    tabsSchema,
  ]),
) as unknown as z.ZodType<IRNode>;
