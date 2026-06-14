import type { SqlRunResult } from "./duckdb";

/**
 * Server-side SQL execution — calls the on-prem query gateway
 * (@knowledge/query-server) over HTTP. The browser only sends the SQL and a
 * connection name; the gateway holds credentials and runs the query against
 * DuckDB / Postgres / MySQL, returning the (capped) result set. Use this for
 * big tables that should never be shipped to the browser.
 */

export interface ServerSqlResult extends SqlRunResult {
  /** Driver that executed the query (sqlite / postgres / mysql / duckdb). */
  engine: string;
}

export async function runServerSql(
  sql: string,
  options: { gateway: string; connection: string },
): Promise<ServerSqlResult> {
  const response = await fetch(`${options.gateway.replace(/\/$/, "")}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection: options.connection, sql }),
  });
  const out = (await response.json()) as {
    ok: boolean;
    error?: string;
    engine?: string;
    columns?: string[];
    rows?: Record<string, unknown>[];
    elapsedMs?: number;
  };
  if (!out.ok) throw new Error(out.error ?? `Gateway error (${response.status})`);
  return {
    columns: out.columns ?? [],
    rows: out.rows ?? [],
    elapsedMs: out.elapsedMs ?? 0,
    engine: out.engine ?? "server",
  };
}
