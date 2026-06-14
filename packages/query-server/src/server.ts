import { createServer } from "node:http";
import { createAdapter } from "./adapters";
import type { Adapter } from "./adapters";
import { loadConnections } from "./connections";
import { assertReadOnly } from "./readonly";

/**
 * Knowledge Platform query gateway — the on-prem SQL bridge.
 *
 *   browser → POST /query { connection, sql } → on-prem DB → result rows
 *
 * Big tables never enter the browser; only the (capped) result set is returned.
 * Read-only by guard (and you should also use a read-only DB role). Run with
 * `npm run gateway`; point the reader at it via VITE_QUERY_GATEWAY.
 */

const PORT = Number(process.env.KP_QUERY_PORT ?? 8787);
const MAX_ROWS = Number(process.env.KP_MAX_ROWS ?? 5000);
const connections = loadConnections();
const adapters = new Map<string, Promise<Adapter>>();

function getAdapter(name: string): Promise<Adapter> {
  const config = connections[name];
  if (!config) throw new Error(`Unknown connection "${name}" (have: ${Object.keys(connections).join(", ")})`);
  let adapter = adapters.get(name);
  if (!adapter) {
    adapter = createAdapter(config);
    adapters.set(name, adapter);
  }
  return adapter;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  // Required so cross-origin-isolated (COEP) pages may read the response.
  "Cross-Origin-Resource-Policy": "cross-origin",
};

const server = createServer((req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", ...CORS });
    res.end(JSON.stringify(body));
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    send(200, { ok: true, connections: Object.keys(connections) });
    return;
  }
  if (req.method !== "POST" || req.url !== "/query") {
    send(404, { ok: false, error: "POST /query or GET /health" });
    return;
  }

  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk;
    if (body.length > 1_000_000) req.destroy();
  });
  req.on("end", () => {
    void (async () => {
      const started = performance.now();
      try {
        const { connection, sql } = JSON.parse(body) as { connection?: string; sql?: string };
        if (!connection || !sql) throw new Error("Body must be { connection, sql }");
        assertReadOnly(sql);
        const adapter = await getAdapter(connection);
        const result = await adapter.query(sql.replace(/;\s*$/, ""), MAX_ROWS);
        send(200, {
          ok: true,
          engine: adapter.driver,
          connection,
          columns: result.columns,
          rows: result.rows,
          elapsedMs: performance.now() - started,
        });
      } catch (error) {
        send(400, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
});

server.listen(PORT, () => {
  console.log(`Knowledge query gateway on http://localhost:${PORT}`);
  console.log(`Connections: ${Object.keys(connections).join(", ")}`);
});
