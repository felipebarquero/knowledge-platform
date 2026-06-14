import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { parse } from "yaml";

const DEFINITIONS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../content/definitions.yaml",
);

/**
 * Workshop write-back (dev only): POST /__workshop/save { yaml } writes
 * content/definitions.yaml. The target path is fixed — no client-supplied
 * paths — and the payload must parse as YAML before it touches the file.
 * The UI additionally blocks saving while the compiled IR has errors.
 */
function workshopWriteback(): Plugin {
  return {
    name: "kp-workshop-writeback",
    configureServer(server) {
      server.middlewares.use("/__workshop/save", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("POST only");
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          res.setHeader("Content-Type", "application/json");
          try {
            const payload = JSON.parse(body) as { yaml?: unknown };
            if (typeof payload.yaml !== "string" || payload.yaml.length === 0) {
              throw new Error("Missing yaml payload");
            }
            parse(payload.yaml);
            writeFileSync(DEFINITIONS_PATH, payload.yaml, "utf8");
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            res.statusCode = 400;
            res.end(
              JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        });
      });
    },
  };
}

/** Cross-origin isolation so DuckDB-WASM / WebR can use SharedArrayBuffer. */
function crossOriginIsolation(): Plugin {
  return {
    name: "cross-origin-isolation",
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), workshopWriteback(), crossOriginIsolation()],
  // The workshop/studio localhost — the reader lives separately on :4400.
  server: { port: 5173 },
  optimizeDeps: { exclude: ["@duckdb/duckdb-wasm", "webr"] },
});
