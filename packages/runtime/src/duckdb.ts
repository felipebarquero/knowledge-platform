import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";

/**
 * Phase 5 SQL execution — DuckDB-WASM. A lazily-instantiated, browser-side
 * analytical database. Datasets are registered as real tables from their CSV
 * text, so queries support the full SQL surface (JOIN, CTE, window functions)
 * over the bundled data. The engine (~3MB) loads only when the first query
 * runs (dynamic import keeps it out of the main chunk); init is memoised.
 */

export interface SqlRunResult {
  columns: string[];
  rows: Record<string, unknown>[];
  /** Wall-clock execution time in ms (engine init excluded after warm-up). */
  elapsedMs: number;
}

let dbPromise: Promise<AsyncDuckDB> | null = null;
const registered = new Set<string>();

async function getDb(): Promise<AsyncDuckDB> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const duckdb = await import("@duckdb/duckdb-wasm");
    // jsDelivr-hosted bundles; the worker is wrapped in a same-origin blob so
    // it loads under the page's COOP/COEP isolation.
    const bundles = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }),
    );
    const worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    return db;
  })();
  return dbPromise;
}

const TABLE_NAME = /^[A-Za-z_]\w*$/;

/**
 * Run a query against the given datasets (name → CSV text). Datasets are
 * registered once per page and reused. Pure-ish: same inputs → same output.
 */
export async function runDuckSql(
  sql: string,
  datasets: Record<string, string>,
): Promise<SqlRunResult> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    for (const [name, text] of Object.entries(datasets)) {
      if (!TABLE_NAME.test(name) || registered.has(name)) continue;
      await db.registerFileText(`${name}.csv`, text);
      await conn.query(
        `CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM read_csv_auto('${name}.csv', header = true)`,
      );
      registered.add(name);
    }
    const started = performance.now();
    const result = await conn.query(sql.replace(/;\s*$/, ""));
    const elapsedMs = performance.now() - started;
    const columns = result.schema.fields.map((f) => f.name);
    const rows = result.toArray().map((row) => {
      const obj = row.toJSON() as Record<string, unknown>;
      // Arrow returns BigInt for integer columns — normalise to number.
      for (const k of Object.keys(obj)) {
        if (typeof obj[k] === "bigint") obj[k] = Number(obj[k]);
      }
      return obj;
    });
    return { columns, rows, elapsedMs };
  } finally {
    await conn.close();
  }
}

/** Reset registered-table cache (e.g. when datasets change in the studio). */
export function resetDuckRegistry(): void {
  registered.clear();
}
