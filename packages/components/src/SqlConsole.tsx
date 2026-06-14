import { useEffect, useState } from "react";
import type { DataTable } from "@knowledge/data";
import { kernel, runDuckSql, runServerSql } from "@knowledge/runtime";
import { highlightLine } from "./CodeBlock";
import { TableView } from "./TableView";

/**
 * SQL console — Phase 5 live execution with two engines:
 *
 *  • `wasm` (default) — DuckDB-WASM in the browser over the bundled CSVs.
 *    Great for the datasets that ship with the book.
 *  • `server` — POST the SQL to the on-prem query gateway, which runs it
 *    against DuckDB / Postgres / MySQL and returns only the result rows. Use
 *    this for big tables that should never enter the browser.
 *
 * With `autoRun` the query executes on mount; the recorded snapshot shows
 * instantly and is replaced by live results. The recorded snapshot also
 * covers hosts where execution isn't available (no isolation / no gateway).
 */

export interface SqlConsoleProps {
  query: string;
  /** Component name — the result is published to the kernel under this name (→ R data frame). */
  name?: string;
  /** Recorded result rows (authored snapshot, shown until live results land). */
  result?: DataTable;
  /** Dataset name → CSV text, for DuckDB-WASM to register as tables. */
  csvMap?: Record<string, string>;
  /** "wasm" (in-browser DuckDB) or "server" (on-prem gateway). */
  engine?: "wasm" | "server";
  /** Server mode: named connection resolved by the gateway. */
  connection?: string;
  /** Server mode: gateway base URL (falls back to VITE_QUERY_GATEWAY). */
  gateway?: string;
  title?: string;
  elapsed?: string;
  maxRows?: number;
  autoRun?: boolean;
}

type Status = "idle" | "running" | "ok" | "error";

const DEFAULT_GATEWAY =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_QUERY_GATEWAY) ||
  "http://localhost:8787";

export function SqlConsole({
  query,
  name,
  result,
  csvMap,
  engine = "wasm",
  connection,
  gateway,
  title = "SQL Console",
  elapsed,
  maxRows = 50,
  autoRun = true,
}: SqlConsoleProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [liveRows, setLiveRows] = useState<DataTable | null>(null);
  const [liveMs, setLiveMs] = useState<number | null>(null);
  const [liveEngine, setLiveEngine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isServer = engine === "server";
  const gatewayUrl = gateway ?? DEFAULT_GATEWAY;
  const canRun = isServer
    ? Boolean(connection)
    : Boolean(csvMap && Object.keys(csvMap).length > 0);
  const engineLabel = isServer ? `server · ${connection ?? "?"}` : "DuckDB";

  const execute = async () => {
    if (!canRun) return;
    setStatus("running");
    setError(null);
    try {
      let rows: DataTable;
      let ms: number;
      let eng: string;
      if (isServer) {
        const out = await runServerSql(query, { gateway: gatewayUrl, connection: connection! });
        rows = out.rows;
        ms = out.elapsedMs;
        eng = out.engine;
      } else {
        const out = await runDuckSql(query, csvMap!);
        rows = out.rows;
        ms = out.elapsedMs;
        eng = "duckdb-wasm";
      }
      setLiveRows(rows);
      setLiveMs(ms);
      setLiveEngine(eng);
      // Share the live result into the kernel so R cells can use it as a data frame.
      if (name) kernel.provideTable(name, rows);
      setStatus("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  useEffect(() => {
    if (autoRun && canRun) void execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, autoRun, canRun, engine, connection]);

  // Publish the recorded snapshot to the kernel immediately, so an R cell that
  // depends on this result can resolve even before the live query finishes.
  useEffect(() => {
    if (name && result && result.length > 0) kernel.provideTable(name, result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const lines = query.replace(/\n$/, "").split("\n");
  const rows = liveRows ?? result ?? [];
  const live = liveRows !== null;

  return (
    <figure className="kp-sql" style={{ fontSize: 13 }}>
      <header className="kp-codeblock__bar">
        <span className="kp-codeblock__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="kp-codeblock__title">{title}</span>
        <span className="kp-codeblock__meta">
          <span className={`kp-sql__engine ${isServer ? "kp-sql__engine--server" : ""}`}>{engineLabel}</span>
          <button
            type="button"
            className="kp-sql__run"
            onClick={() => void execute()}
            disabled={!canRun || status === "running"}
            title={canRun ? "Run query (⌘↵)" : isServer ? "No connection configured" : "No datasets available"}
          >
            {status === "running" ? "Running…" : "▶ Run"}
          </button>
        </span>
      </header>

      <pre className="kp-codeblock__pre kp-sql__query">
        <code>
          {lines.map((line, i) => (
            <span key={i} className="kp-code__line">
              <span className="kp-code__content">{highlightLine(line, "sql")}</span>
            </span>
          ))}
        </code>
      </pre>

      <div className="kp-sql__status">
        {status === "running" && (
          <>
            <span className="hui-spinner hui-spinner--inline" aria-hidden="true" />{" "}
            <span className="kp-sql__hint">
              {isServer ? `querying ${connection}…` : "running in DuckDB…"}
            </span>
          </>
        )}
        {status === "ok" && liveMs !== null && (
          <span className="kp-sql__ok">
            ✓ {liveMs < 1 ? "<1" : liveMs.toFixed(0)}ms · live{liveEngine ? ` · ${liveEngine}` : ""}
          </span>
        )}
        {status === "error" && <span className="kp-sql__error">✗ {error}</span>}
        {status === "idle" && elapsed && (
          <>
            <span className="kp-sql__ok">✓ {elapsed}</span>
            <span className="kp-sql__recorded">recorded</span>
          </>
        )}
        {status === "error" && result && <span className="kp-sql__recorded">showing recorded snapshot</span>}
      </div>

      {rows.length > 0 ? (
        <div className="kp-sql__results">
          <TableView rows={rows} limit={maxRows} density="compact" striped />
          <footer className="kp-sql__footer">
            {rows.length} row{rows.length === 1 ? "" : "s"} returned
            {!live && <span className="kp-sql__phase">recorded · live on Run</span>}
          </footer>
        </div>
      ) : (
        <div className="kp-sql__placeholder">
          {canRun ? "No rows — run the query." : "Live execution needs the bundled datasets."}
        </div>
      )}
    </figure>
  );
}
