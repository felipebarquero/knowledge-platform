# Knowledge Platform — Engine

A multi-target reactive knowledge authoring platform. Authors write books,
articles, slides, dashboards and interactive materials from a shared
**Knowledge IR**, not Markdown. This repo is the **engine** (the rendering
platform + the authoring Workshop). The **content** lives in a separate repo
that authors own; this engine is pulled in at build time.

> New here? Read [`HANDOFF.md`](HANDOFF.md) for the full architecture, then
> [`CLAUDE.md`](CLAUDE.md) for the dated decision log.

## Two-repo model

```
knowledge-platform   (this repo)   the engine — packages/* + apps/*
knowledge-content    (authors)     document.md + definitions.yaml + data/*.csv
```

- The engine ships a demo `content/` so it runs standalone.
- A content repo's CI checks out this engine, injects its own content into
  `content/`, validates, builds, and deploys. Authors never merge engine code.

## Run it

```bash
npm install
npm run dev          # studio: Preview + Workshop   → http://localhost:5173
npm run read         # the reader (the book)         → http://localhost:4400
npm run gateway      # on-prem SQL gateway           → http://localhost:8787
npm test             # 71 tests
npm run check:content# the IR gate (compile content, fail on errors)
npm run build:site   # gate + production build of the reader
```

## Reader view modes

The reader is five stateless projections of the same compiled IR, by URL hash:
`#read`, `#slides`, `#course`, `#dashboard`, `#paper`.

## Live execution (SQL + R)

- **SQL** runs in-browser via DuckDB-WASM (full JOIN/CTE/window SQL over the
  bundled CSVs), or against an **on-prem database** (DuckDB/Postgres/MySQL) via
  the query gateway (`npm run gateway`) for big tables that shouldn't reach the
  browser. Credentials stay server-side (env `KP_CONNECTIONS`).
- **R** runs in WebR (R compiled to WASM); `lme4::lmer` and friends run for
  real. SQL results become R data frames and R variables persist across cells
  (a shared kernel).

Both need **cross-origin isolation** (`COOP: same-origin`,
`COEP: credentialless`) for SharedArrayBuffer. The dev servers set these.
**GitHub Pages cannot**, so a Pages deploy falls back to the recorded snapshots
in `definitions.yaml`. For live execution in production, deploy to a host that
can set headers — e.g. Vercel with:

```json
// vercel.json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
      { "key": "Cross-Origin-Embedder-Policy", "value": "credentialless" }
    ]
  }]
}
```

## Layout

`packages/` — ir, compiler, data, sync, runtime, query-server, components,
renderers/{web,slides}. `apps/` — studio, site. See [`HANDOFF.md`](HANDOFF.md).
