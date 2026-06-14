import { autoType, csvParse } from "d3-dsv";
import type { ComponentDef, DatasetDef, ValidationIssue } from "@knowledge/ir";

export { SqlError, runSql } from "./sql";
export type { SqlResult } from "./sql";

/**
 * Data layer (Phase 2: static connectors only — CSV files shipped with the
 * content repo). Postgres/DuckDB/Parquet are later phases; their datasets
 * simply produce no rows yet and components render their no-data state.
 *
 * This layer never touches presentation or interaction: it parses, filters,
 * and describes tables. Nothing here knows what a plot is.
 */

export type DataRow = Record<string, unknown>;
export type DataTable = DataRow[];

/** CSV text → typed rows (numbers and ISO dates coerced via d3 autoType). */
export function parseCsv(text: string): DataTable {
  return csvParse(text, autoType) as unknown as DataTable;
}

export function columnsOf(rows: DataTable): string[] {
  const first = rows[0];
  return first ? Object.keys(first) : [];
}

/** Distinct non-null values of a column, naturally sorted. */
export function uniqueValues(rows: DataTable, field: string): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const row of rows) {
    const value = row[field];
    if (value === null || value === undefined) continue;
    const key = String(value);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

/** Apply equality filters ({ field: value }); undefined/"all" entries are ignored. */
export function applyFilters(rows: DataTable, filters: Record<string, unknown>): DataTable {
  const active = Object.entries(filters).filter(
    ([, value]) => value !== undefined && value !== null && value !== "" && value !== "all",
  );
  if (active.length === 0) return rows;
  return rows.filter((row) => active.every(([field, value]) => String(row[field]) === String(value)));
}

/** Fields a component declares as interactively filterable (`- filter: <field>`). */
export function filterFieldsOf(def: Pick<ComponentDef, "transforms">): string[] {
  return (def.transforms ?? []).flatMap((transform) =>
    typeof transform.filter === "string" ? [transform.filter] : [],
  );
}

export type AggregateMode = "count" | "mean" | "sum";

export interface AggregatedRow {
  key: string;
  value: number;
}

/** Group rows by a categorical field and aggregate a numeric field (or count). */
export function aggregateBy(
  rows: DataTable,
  groupField: string,
  valueField: string | undefined,
  mode: AggregateMode,
): AggregatedRow[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = row[groupField];
    if (key === null || key === undefined) continue;
    const bucket = groups.get(String(key)) ?? [];
    if (mode !== "count" && valueField) {
      const value = Number(row[valueField]);
      if (Number.isFinite(value)) bucket.push(value);
    } else {
      bucket.push(1);
    }
    groups.set(String(key), bucket);
  }
  return [...groups.entries()]
    .map(([key, values]) => {
      const sum = values.reduce((a, b) => a + b, 0);
      const value =
        mode === "mean" ? (values.length ? sum / values.length : 0) : mode === "sum" ? sum : values.length;
      return { key, value };
    })
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

export interface GroupSummary {
  key: string;
  badge?: string;
  count: number;
  mean: number;
  best: number;
  /** Relative improvement %, first-3 vs last-3 observations, sign-adjusted for bestMode. */
  improvement: number;
  /** Value sequence in row order (for sparklines). */
  series: number[];
}

/**
 * Per-group summary used by summary tables: group by `groupField`, summarize
 * the numeric `valueField` (count / mean / best / improvement / series), and
 * carry the group's `badgeField` category if given. Row order is assumed
 * chronological for the improvement and series computations.
 */
export function summarizeBy(
  rows: DataTable,
  groupField: string,
  valueField: string,
  badgeField?: string,
  bestMode: "min" | "max" = "min",
): GroupSummary[] {
  const groups = new Map<string, { badge?: string; values: number[] }>();
  for (const row of rows) {
    const key = row[groupField];
    if (key === null || key === undefined) continue;
    const value = Number(row[valueField]);
    if (!Number.isFinite(value)) continue;
    const entry = groups.get(String(key)) ?? {
      badge: badgeField ? (row[badgeField] === null || row[badgeField] === undefined ? undefined : String(row[badgeField])) : undefined,
      values: [],
    };
    entry.values.push(value);
    groups.set(String(key), entry);
  }
  const mean = (values: number[]) =>
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
  return [...groups.entries()]
    .map(([key, { badge, values }]) => {
      // Window never exceeds half the series so head and tail can't overlap.
      const window = Math.max(1, Math.min(3, Math.floor(values.length / 2)));
      const head = mean(values.slice(0, window));
      const tail = mean(values.slice(-window));
      const raw = head === 0 ? 0 : ((head - tail) / Math.abs(head)) * 100;
      return {
        key,
        ...(badge !== undefined ? { badge } : {}),
        count: values.length,
        mean: mean(values),
        best: bestMode === "min" ? Math.min(...values) : Math.max(...values),
        improvement: bestMode === "min" ? raw : -raw,
        series: values,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

export interface DataMapResult {
  data: Record<string, DataTable>;
  issues: ValidationIssue[];
}

/**
 * Resolve static datasets to their raw CSV text (dataset name → text), for
 * the Phase 5 DuckDB engine which ingests CSV directly. Same path-suffix
 * matching as `buildDataMap`.
 */
export function buildCsvMap(
  datasets: Record<string, DatasetDef>,
  files: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, def] of Object.entries(datasets)) {
    if (def.source !== "csv" || !def.path) continue;
    const path = def.path;
    const key = Object.keys(files).find((k) => k === path || k.endsWith(`/${path}`));
    if (key !== undefined && files[key] !== undefined) out[name] = files[key]!;
  }
  return out;
}

/**
 * Resolve static datasets against a bundle of raw files (path → file text,
 * as produced by `import.meta.glob(..., { query: "?raw" })`). Matching is by
 * path suffix so importer-relative glob keys work.
 */
export function buildDataMap(
  datasets: Record<string, DatasetDef>,
  files: Record<string, string>,
): DataMapResult {
  const data: Record<string, DataTable> = {};
  const issues: ValidationIssue[] = [];

  for (const [name, def] of Object.entries(datasets)) {
    if (def.source !== "csv" || !def.path) continue;
    const path = def.path;
    const key = Object.keys(files).find((k) => k === path || k.endsWith(`/${path}`));
    if (key === undefined) {
      issues.push({
        severity: "warning",
        code: "DATA_FILE_MISSING",
        path: `datasets.${name}`,
        message: `No bundled file matches "${path}" — component previews will show their no-data state`,
      });
      continue;
    }
    try {
      data[name] = parseCsv(files[key] ?? "");
    } catch (error) {
      issues.push({
        severity: "error",
        code: "DATA_PARSE",
        path: `datasets.${name}`,
        message: error instanceof Error ? error.message : "Failed to parse CSV",
      });
    }
  }

  return { data, issues };
}
