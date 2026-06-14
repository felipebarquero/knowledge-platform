import { useState } from "react";
import type { DataTable } from "@knowledge/data";
import { TableView } from "./TableView";

/**
 * Notebook-style output pane for a code cell. A REPL result can surface in
 * several representations; the pane shows a tab per recorded representation:
 *
 *   Table — the result is a dataframe        (`result`)
 *   Plot  — the result is an image           (`plot`, an <img> src)
 *   Text  — plain stdout / printed text       (`text`)
 *   Info  — variable values, for debugging    (`info`, key → value)
 *
 * Phase 4 scope: every field is a recorded snapshot authored in YAML. Phase 5
 * (WASM R / Python REPL) populates the same shape at runtime — the rendering
 * never changes. Output never carries line numbers; only the code does.
 */

export interface CellOutputData {
  text?: string;
  table?: DataTable;
  plot?: string;
  info?: Record<string, unknown>;
}

type OutTab = "table" | "plot" | "text" | "info";

const TAB_LABELS: Record<OutTab, string> = {
  table: "Table",
  plot: "Plot",
  text: "Text",
  info: "Info",
};

export function cellTabs(data: CellOutputData): OutTab[] {
  const tabs: OutTab[] = [];
  if (data.table && data.table.length > 0) tabs.push("table");
  if (data.plot) tabs.push("plot");
  if (data.text !== undefined && data.text !== "") tabs.push("text");
  if (data.info && Object.keys(data.info).length > 0) tabs.push("info");
  return tabs;
}

export function CellOutput({ data, maxRows = 50 }: { data: CellOutputData; maxRows?: number }) {
  const tabs = cellTabs(data);
  const [active, setActive] = useState<OutTab>(tabs[0] ?? "text");
  if (tabs.length === 0) return null;
  const current = tabs.includes(active) ? active : tabs[0]!;

  return (
    <div className="kp-out">
      <nav className="kp-out__tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={tab === current}
            className={`kp-out__tab ${tab === current ? "kp-out__tab--active" : ""}`}
            onClick={() => setActive(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>
      <div className="kp-out__body">
        {current === "table" && data.table && (
          <TableView rows={data.table} limit={maxRows} density="compact" striped />
        )}
        {current === "plot" && data.plot && (
          <img className="kp-out__img" src={data.plot} alt="cell output plot" />
        )}
        {current === "text" && data.text !== undefined && (
          <pre className="kp-out__text">{data.text.replace(/\n$/, "")}</pre>
        )}
        {current === "info" && data.info && <InfoView info={data.info} />}
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(4);
  if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function InfoView({ info }: { info: Record<string, unknown> }) {
  return (
    <dl className="kp-out__info">
      {Object.entries(info).map(([key, value]) => (
        <div key={key} className="kp-out__info-row">
          <dt>{key}</dt>
          <dd>{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
