import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { columnsOf, parseCsv } from "@knowledge/data";

/**
 * Database adapters for the query gateway. Each connection resolves to one
 * adapter that runs a read-only query and returns columnar results. The
 * built-in `sqlite` adapter (node:sqlite, zero deps) loads the content CSVs as
 * tables — the reference / demo "on-prem" server. Postgres and MySQL adapters
 * dynamically import their (optional) drivers, so you only install the one you
 * use. DuckDB likewise.
 */

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface Adapter {
  driver: string;
  query(sql: string, maxRows: number): Promise<QueryResult>;
  close?(): Promise<void>;
}

export type ConnectionConfig =
  | { driver: "sqlite"; /** CSV files (name → path) loaded as tables; defaults to the demo content. */ tables?: Record<string, string> }
  | { driver: "postgres"; url: string }
  | { driver: "mysql"; url: string }
  | { driver: "duckdb"; path: string };

const HERE = dirname(fileURLToPath(import.meta.url));
const DEMO_DATA = resolve(HERE, "../../../content/data");

/* ── sqlite (node:sqlite) — the zero-dependency reference server ─────── */

function bindable(value: unknown): string | number | bigint | null | Uint8Array {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value);
}

async function makeSqlite(tables: Record<string, string>): Promise<Adapter> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  for (const [name, file] of Object.entries(tables)) {
    const rows = parseCsv(readFileSync(file, "utf8"));
    const cols = columnsOf(rows);
    if (cols.length === 0) continue;
    db.exec(`CREATE TABLE "${name}" (${cols.map((c) => `"${c}"`).join(", ")})`);
    const insert = db.prepare(`INSERT INTO "${name}" VALUES (${cols.map(() => "?").join(", ")})`);
    for (const row of rows) insert.run(...cols.map((c) => bindable(row[c])));
  }
  return {
    driver: "sqlite",
    query(sql, maxRows) {
      const rows = db.prepare(sql).all() as Record<string, unknown>[];
      const capped = rows.slice(0, maxRows);
      return Promise.resolve({ columns: capped.length ? Object.keys(capped[0]!) : [], rows: capped });
    },
    close: () => Promise.resolve(db.close()),
  };
}

/* ── postgres / mysql / duckdb (optional drivers, dynamically imported) ─ */

async function makePostgres(url: string): Promise<Adapter> {
  const pg = await importDriver<{ Client: new (c: { connectionString: string }) => any }>("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return {
    driver: "postgres",
    async query(sql, maxRows) {
      const res = await client.query(`SELECT * FROM (${sql}) AS _kp LIMIT ${maxRows}`);
      return { columns: res.fields.map((f: { name: string }) => f.name), rows: res.rows };
    },
    close: () => client.end(),
  };
}

async function makeMysql(url: string): Promise<Adapter> {
  const mysql = await importDriver<{ createConnection: (u: string) => Promise<any> }>("mysql2/promise");
  const conn = await mysql.createConnection(url);
  return {
    driver: "mysql",
    async query(sql, maxRows) {
      const [rows, fields] = await conn.query(`SELECT * FROM (${sql}) AS _kp LIMIT ${maxRows}`);
      return {
        columns: (fields as { name: string }[]).map((f) => f.name),
        rows: rows as Record<string, unknown>[],
      };
    },
    close: () => conn.end(),
  };
}

async function makeDuckdb(path: string): Promise<Adapter> {
  const duck = await importDriver<any>("@duckdb/node-api");
  const instance = await duck.DuckDBInstance.create(path);
  const conn = await instance.connect();
  return {
    driver: "duckdb",
    async query(sql, maxRows) {
      const reader = await conn.runAndReadAll(`SELECT * FROM (${sql}) LIMIT ${maxRows}`);
      const rows = reader.getRowObjects() as Record<string, unknown>[];
      return { columns: rows.length ? Object.keys(rows[0]!) : [], rows };
    },
  };
}

async function importDriver<T>(name: string): Promise<T> {
  try {
    return (await import(/* @vite-ignore */ name)) as T;
  } catch {
    throw new Error(`Driver "${name}" is not installed — run \`npm i ${name}\` in the query server`);
  }
}

export function createAdapter(config: ConnectionConfig): Promise<Adapter> {
  switch (config.driver) {
    case "sqlite":
      return makeSqlite(
        config.tables ?? {
          sprint_study: resolve(DEMO_DATA, "sprint_sessions.csv"),
          athlete_meta: resolve(DEMO_DATA, "athlete_meta.csv"),
          model_results: resolve(DEMO_DATA, "model_results.csv"),
        },
      );
    case "postgres":
      return makePostgres(config.url);
    case "mysql":
      return makeMysql(config.url);
    case "duckdb":
      return makeDuckdb(config.path);
  }
}
