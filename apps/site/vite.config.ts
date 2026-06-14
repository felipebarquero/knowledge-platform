import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

// Cross-origin isolation enables SharedArrayBuffer, which DuckDB-WASM and WebR
// use for their best (threaded) modes. COEP "credentialless" lets the engines'
// cross-origin CDN assets load without needing CORP headers. A production host
// (Vercel/Netlify) must send these too; GitHub Pages can't, so live execution
// falls back to recorded snapshots there.
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
  plugins: [react(), crossOriginIsolation()],
  // Relative base so the static build works on GitHub Pages project paths
  // (user.github.io/repo/) as well as any root-hosted static server.
  base: "./",
  // The reader dev server — a clean, read-only localhost alongside the studio.
  server: { port: 4400 },
  preview: { port: 4173, headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" } },
  // duckdb-wasm ships large prebuilt assets; don't let Vite pre-bundle them.
  optimizeDeps: { exclude: ["@duckdb/duckdb-wasm", "webr"] },
});
