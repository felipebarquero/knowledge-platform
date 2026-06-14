import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import { ALL_COMPONENTS } from "@knowledge/ir";
import type { Binding, IRDocument } from "@knowledge/ir";
import type { DataTable } from "@knowledge/data";

/**
 * Phase 3 sync engine (Zustand vanilla store + pure resolution logic).
 *
 * The store holds one value per control; everything else is derived: the
 * event graph comes straight from the document's bindings + sync rules, and
 * `effectsFor` computes the filters/highlight a component must apply for the
 * current control values. The core is framework-free — the React adapter
 * lives in @knowledge/components.
 *
 * Action semantics (documented decisions):
 * - filter   → dropdown: keep rows where field == value ("all"/null = off);
 *              slider: keep rows where field ≤ value (mode "max", default)
 *              or field ≥ value (mode "min");
 *              toggle ON: keep rows where field == control.value (default true).
 * - update   → treated as filter in Phase 3 (pure declarative data flow;
 *              recomputation targets arrive with live connectors in Phase 5).
 * - highlight→ dims non-matching marks instead of removing rows.
 */

export interface SyncState {
  values: Record<string, unknown>;
  set: (control: string, value: unknown) => void;
  reset: () => void;
}

export type SyncStore = StoreApi<SyncState>;

function initialValues(doc: IRDocument): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(doc.interactions)) {
    values[name] = def.default ?? (def.type === "toggle" ? false : null);
  }
  return values;
}

export function createSyncStore(doc: IRDocument): SyncStore {
  return createStore<SyncState>((set) => ({
    values: initialValues(doc),
    set: (control, value) =>
      set((state) => ({ values: { ...state.values, [control]: value } })),
    reset: () => set(() => ({ values: initialValues(doc) })),
  }));
}

export interface SyncEdge {
  source: string;
  action: Binding["action"];
}

/** All control edges arriving at a component (bindings ∪ sync, all_components expanded). */
export function edgesInto(doc: IRDocument, component: string): SyncEdge[] {
  const edges: SyncEdge[] = [];
  const push = (source: string, action: Binding["action"]) => {
    if (!edges.some((e) => e.source === source && e.action === action)) {
      edges.push({ source, action });
    }
  };
  for (const binding of doc.bindings) {
    if (binding.target === component || binding.target === ALL_COMPONENTS) {
      push(binding.source, binding.action);
    }
  }
  for (const rule of doc.sync) {
    if (rule.to === component || rule.to === ALL_COMPONENTS) {
      push(rule.from, rule.action);
    }
  }
  return edges;
}

/** The column a control acts on: explicit `field`, else the target's first filter transform. */
export function resolveControlField(
  doc: IRDocument,
  control: string,
  target?: string,
): string | undefined {
  const def = doc.interactions[control];
  if (def?.field) return def.field;
  if (target) {
    for (const transform of doc.components[target]?.transforms ?? []) {
      if (typeof transform.filter === "string") return transform.filter;
    }
  }
  return undefined;
}

/** Field resolution without a known target: first edge out of the control that resolves. */
export function controlField(doc: IRDocument, control: string): string | undefined {
  const direct = resolveControlField(doc, control);
  if (direct) return direct;
  const targets: string[] = [];
  for (const binding of doc.bindings) {
    if (binding.source === control) {
      targets.push(...(binding.target === ALL_COMPONENTS ? Object.keys(doc.components) : [binding.target]));
    }
  }
  for (const rule of doc.sync) {
    if (rule.from === control) {
      targets.push(...(rule.to === ALL_COMPONENTS ? Object.keys(doc.components) : [rule.to]));
    }
  }
  for (const target of targets) {
    const field = resolveControlField(doc, control, target);
    if (field) return field;
  }
  return undefined;
}

export interface FilterEffect {
  field: string;
  op: "eq" | "lte" | "gte";
  value: unknown;
}

export interface ComponentEffects {
  filters: FilterEffect[];
  highlight: { field: string; value: string } | null;
}

const INACTIVE = new Set<unknown>([null, undefined, "", "all"]);

/** Filters + highlight a component must apply for the current control values. */
export function effectsFor(
  doc: IRDocument,
  component: string,
  values: Record<string, unknown>,
): ComponentEffects {
  const filters: FilterEffect[] = [];
  let highlight: ComponentEffects["highlight"] = null;

  for (const edge of edgesInto(doc, component)) {
    const control = doc.interactions[edge.source];
    if (!control) continue;
    const field = resolveControlField(doc, edge.source, component);
    if (!field) continue;
    const raw = values[edge.source];
    if (INACTIVE.has(raw)) continue;

    if (control.type === "toggle") {
      if (raw !== true) continue;
      const keep = control.value ?? true;
      if (edge.action === "highlight") highlight = { field, value: String(keep) };
      else filters.push({ field, op: "eq", value: keep });
      continue;
    }

    if (control.type === "slider") {
      const threshold = Number(raw);
      if (!Number.isFinite(threshold)) continue;
      if (edge.action === "highlight") {
        highlight = { field, value: String(raw) };
        continue;
      }
      filters.push({ field, op: control.mode === "min" ? "gte" : "lte", value: threshold });
      continue;
    }

    // dropdown ("update" deliberately behaves like filter in Phase 3)
    if (edge.action === "highlight") highlight = { field, value: String(raw) };
    else filters.push({ field, op: "eq", value: raw });
  }

  return { filters, highlight };
}

/**
 * Apply resolved effects to a data table (pure). Filters on columns the
 * table doesn't have are no-ops — an all_components rule must not blank
 * datasets that lack the control's field.
 */
export function applyEffects(rows: DataTable, effects: ComponentEffects): DataTable {
  if (effects.filters.length === 0 || rows.length === 0) return rows;
  const columns = new Set(Object.keys(rows[0]!));
  const applicable = effects.filters.filter((filter) => columns.has(filter.field));
  if (applicable.length === 0) return rows;
  return rows.filter((row) =>
    applicable.every((filter) => {
      const cell = row[filter.field];
      if (filter.op === "eq") return String(cell) === String(filter.value);
      const num = Number(cell);
      if (!Number.isFinite(num)) return false;
      return filter.op === "lte" ? num <= Number(filter.value) : num >= Number(filter.value);
    }),
  );
}
