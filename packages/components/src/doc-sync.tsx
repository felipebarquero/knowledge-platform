import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { useStore } from "zustand";
import { controlField, createSyncStore } from "@knowledge/sync";
import type { SyncStore } from "@knowledge/sync";
import type { ControlDef, IRDocument } from "@knowledge/ir";
import type { DataTable } from "@knowledge/data";
import { columnsOf, uniqueValues } from "@knowledge/data";

/**
 * React adapter for the Phase 3 sync engine (Zustand). DocumentView mounts
 * one DocSyncProvider per document; LiveControl writes control values into
 * the store and every component re-derives its rows via effectsFor.
 */

interface DocSyncCtx {
  doc: IRDocument;
  store: SyncStore;
}

const DocSyncContext = createContext<DocSyncCtx | null>(null);

// Stable fallback so hooks can run unconditionally outside a provider.
const FALLBACK_DOC = {
  irVersion: "0",
  id: "fallback",
  nodes: [],
  components: {},
  datasets: {},
  interactions: {},
  bindings: [],
  sync: [],
} as unknown as IRDocument;

const fallbackStore = createSyncStore(FALLBACK_DOC);

export function DocSyncProvider({ doc, children }: { doc: IRDocument; children: ReactNode }) {
  const store = useMemo(() => createSyncStore(doc), [doc]);
  const value = useMemo(() => ({ doc, store }), [doc, store]);
  return <DocSyncContext.Provider value={value}>{children}</DocSyncContext.Provider>;
}

export interface DocSync {
  active: boolean;
  doc: IRDocument | null;
  store: SyncStore;
  values: Record<string, unknown>;
}

export function useDocSync(): DocSync {
  const ctx = useContext(DocSyncContext);
  const store = ctx?.store ?? fallbackStore;
  const values = useStore(store, (state) => state.values);
  return { active: ctx !== null, doc: ctx?.doc ?? null, store, values };
}

/* ── Live controls ──────────────────────────────────────────────────── */

export interface LiveControlProps {
  name: string;
  def: ControlDef;
  doc: IRDocument;
  dataMap?: Record<string, DataTable>;
}

function numericExtent(dataMap: Record<string, DataTable> | undefined, field: string | undefined) {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  if (dataMap && field) {
    for (const rows of Object.values(dataMap)) {
      if (rows.length === 0 || !columnsOf(rows).includes(field)) continue;
      for (const row of rows) {
        const v = Number(row[field]);
        if (Number.isFinite(v)) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
    }
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? { lo, hi } : { lo: 0, hi: 100 };
}

export function LiveControl({ name, def, doc, dataMap }: LiveControlProps) {
  const { store, values } = useDocSync();
  const value = values[name];
  const field = controlField(doc, name);

  const options = useMemo(() => {
    if (Array.isArray(def.options)) return def.options.map(String);
    if (!field || !dataMap) return [];
    const out = new Set<string>();
    for (const rows of Object.values(dataMap)) {
      if (rows.length === 0 || !columnsOf(rows).includes(field)) continue;
      for (const v of uniqueValues(rows, field)) out.add(String(v));
    }
    return [...out].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [def.options, field, dataMap]);

  const variant = def.variant ?? "glass";
  const size = def.size ?? "md";
  const radius = def.radius ?? "full";
  const placement = def.labelPlacement ?? "left";
  const setValue = (v: unknown) => store.getState().set(name, v);
  const active = value !== null && value !== undefined && value !== "all" && value !== false && value !== "";

  const extent = numericExtent(dataMap, field);
  const min = def.min ?? extent.lo;
  const max = def.max ?? extent.hi;
  const step = def.step ?? Math.max(1, Math.round((max - min) / 100));
  const sliderValue = typeof value === "number" ? value : def.mode === "min" ? min : max;

  return (
    <div
      className={`kp-control kp-control--live kp-control--${variant} kp-control--${size} kp-control--r-${radius} kp-control--label-${placement}`}
    >
      <span className="kp-control__label">{def.label ?? name}</span>

      {def.type === "dropdown" && (
        <select
          value={value === null || value === undefined ? "all" : String(value)}
          onChange={(e) => setValue(e.target.value === "all" ? null : e.target.value)}
        >
          <option value="all">{def.placeholder ?? "All"}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}

      {def.type === "slider" && (
        <span className="kp-control__slider">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={sliderValue}
            onChange={(e) => setValue(Number(e.target.value))}
          />
          <code>
            {field ?? "value"} {def.mode === "min" ? "≥" : "≤"} {sliderValue}
          </code>
        </span>
      )}

      {def.type === "toggle" && (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => setValue(e.target.checked)}
        />
      )}

      {active && (
        <button
          type="button"
          className="kp-control__reset"
          title="Reset"
          onClick={() => setValue(def.type === "toggle" ? false : null)}
        >
          ✕
        </button>
      )}
      {def.description ? <span className="kp-control__desc">{def.description}</span> : null}
    </div>
  );
}
