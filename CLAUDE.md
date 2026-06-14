# CLAUDE.md — Knowledge Platform (working title)

## Project Identity

**Multi-Target Reactive Knowledge Authoring Platform** — a system where academics, authors, mathematicians, and developers build books, articles, documentation, lectures, slides, and interactive materials from a shared **Knowledge IR**, not Markdown.

Long-term this is a **Knowledge Graph CMS + Reactive Component Runtime + Multi-Renderer Compiler**.

It is NOT:

- a Markdown tool
- a static site generator
- a notebook system

Author background: experienced in Python, likes TypeScript (and ReScript). Core is TypeScript-first (see Stack); Python remains a candidate for data-execution services in later phases.

## Core Principle (Non-Negotiable)

🔴 **Single Source of Truth Rule**

```
Markdown → IR → Everything else
```

- Markdown is **disposable** — only an authoring syntax
- The **IR is canonical** — immutable and validated
- Renderers are **stateless projections** of IR

## Key Architectural Rule

**Never collapse layers early.**

```
Content ≠ Data ≠ Presentation ≠ Interaction
```

If these merge too early, the system becomes "Markdown with plugins" instead of a "Knowledge Operating System". Collapsing any two layers requires explicit approval from the author — never do it implicitly in code.

## Authoring & Publishing Model (decided 2026-06-11/12)

- **Authoring is offline.** Authors write Markdown + YAML sidecars as plain files on disk, in their own editor (VS Code, Obsidian, vim). The platform never owns the writing surface.
- **Local loop**: edit files → save → localhost studio preview reloads (`npm run dev`).
- **Publish loop**: content lives in its own GitHub repository (platform repo keeps only sample content for development). On push, CI compiles Markdown + YAML → IR → static rendered site and deploys it. Example workflow: `.github/workflows/publish.yml` (GitHub Pages; Vercel equally viable — hosting is not locked in). CI gate: `npm run check:content` fails the build on any IR error, so a broken ref can never publish.
- **The studio is not a text editor.** Its online roles are: live preview of the compiled IR, and — from Phase 2 — the **component workshop (editor mode)**: Storybook-style UX where each component is browsable in isolation and its *declarative* options (encoding, data ref, theme, control wiring) are adjusted in a controls panel, with edits written back into the YAML files. Storybook is the UX reference, not a dependency — component definitions in the IR registries play the role of stories.
- **YAML sidecars are the shared layer between humans and AI.** They must stay readable and writable by three parties equally: the author by hand, the component workshop, and an AI assistant (e.g. Claude) operating on the files. Keep them obvious and diffable; never generate YAML a human couldn't comfortably edit.
- **Scale target: ~100 curated components and one great book.** This is not a component marketplace. Prefer a small, polished component vocabulary over extensibility machinery — the success bar is the quality of the rendered book, not the size of the library.

## High-Level Architecture

```
Authoring Layer (Markdown / DSL)
        ↓
Parser / Compiler
        ↓
Knowledge IR (Canonical Graph)
        ↓
┌──────────────────────────────────┐
│ Content Layer                    │
│ Component Layer                  │
│ Data Layer                       │
│ Interaction Layer                │
│ Sync Layer                       │
│ Presentation Layer               │
│ Animation Layer (optional)       │
└──────────────────────────────────┘
        ↓
Multi-Renderer System
        ↓
Web / PDF / Slides / Course / API / Mobile
```

## Design Constraints

### Must Have

- IR is immutable and validated
- Components are declarative (no embedded logic)
- Data sources are externalized
- State is not embedded in content
- Multi-renderers share the same IR
- Reactive visualizations (plots, tables, controls)
- Reproducible, data-backed content

### Must NOT Have

- No React in the content layer
- No UI logic inside Markdown
- No hidden state in components
- No coupling between data + presentation
- No per-renderer content duplication

## Stack

Committed (Phase 1 — decided 2026-06-11):

- **TypeScript**, strict mode, everywhere in the core
- **Zod** for the IR schema + validation
- Monorepo: npm workspaces (pnpm-compatible layout; swap later if desired)
- IR serialization: **JSON canonical**. YAML is allowed only for human-authored sidecar definitions (datasets, components, interactions) and is compiled into IR JSON — YAML is never load-bearing in the core
- Markdown parsing: **remark / unified** (remark-directive for `::dataset foo` syntax, remark-math for equations, remark-frontmatter for id/title)
- Web renderer + studio preview: **Vite + React**; the renderer remains a stateless `(IR, theme) → output` package, the framework lives at the app edge
- Studio reads content from `content/*.md` + `content/*.yaml` on disk (offline authoring, live preview on save) — it is a preview + component configurator, never an editing surface

Committed (Phase 2 — decided 2026-06-12):

- Plots: **visx v4** (author's pick over Observable Plot/D3; Vega-Lite ruled out). All imperative chart code lives ONLY in `packages/components` — component definitions in the IR stay declarative (type + data ref + encoding). Implemented types: histogram, **bars** (categorical, aggregate count/mean/sum), **area** (AreaClosed: curve/gradient/time-axis), **dots**, plot, chart, table, **card** (HeroUI-inspired glass card); the rest are placeholders.
- **Option-spec registry** (`packages/components/src/option-specs.ts`): every component type publishes its full parameter surface (control kind, default, min/max/choices, group). The workshop renders Storybook-style control rows generically from these specs — adding a new component type means writing the renderer + its spec, and the editor UI comes for free. Parameter names mirror the underlying visx prop surfaces and HeroUI's API vocabulary (Card: shadow/radius/isHoverable; Select: variant/size/labelPlacement).
- **macOS Tahoe liquid-glass design language** for studio + rendered output: wallpaper gradient background, frosted translucent panels (backdrop-blur + saturate), pill segmented controls, glass cards. Controls (dropdown/slider/toggle) accept HeroUI-inspired presentation params on the ControlDef (variant/size/radius/labelPlacement/placeholder/description — additive IR change).
- **Composable cards + card-scoped sync** (decided 2026-06-12): a card may embed other components via `children: [names]` (additive IR change; validator rejects cycles, graph gets `compose` edges). The card's **encoding.x is its sync key**: children whose own key/badge column matches participate in hover-highlight (dim siblings) and click-to-filter (card-wide row filter + clearable chip). This is deliberately CARD-SCOPED presentation behavior in `packages/components/src/sync.ts` — the document-wide engine is still the Phase 3 decision. **Every plot is hoverable** with a contextual glass tooltip (`tooltip.tsx`).
- **Dashboard vocabulary** (all spec-registered, all tooltipped): `donut` (visx Pie + legend/%), `density` (smoothed distribution), `sparkline`, `summary_table` (per-group mean/n/best/improvement% + badges + trend sparklines), `diagram` (Population → groups → observations hierarchy), plus `refLine: zero|diagonal` on dots (residual/QQ plots). Layout composition in Markdown via `:::grid{columns=N gap=M}` container directive → `layout_grid` node.
- **Controls are first-class in the workshop** (fixed 2026-06-13): creating a slider/selector/toggle from the wizard makes a **standalone control** (not silently attached to the selected component). Controls appear in a "Controls" section of the sidebar, select into a dedicated `ControlEditor` (live `LiveControl` preview + inspector sections Control/Appearance/Behavior/YAML), and save to `interactions.<name>` via the same write-back. The shared `WorkshopSidebar` lists components (tree) + controls; `editing: "component" | "control"` switches the editor. Previously controls were second-class (buried in a component's Interaction section) — creating one appeared to do nothing.
- **Workshop authoring UX** (2026-06-12): new components are created through a glass wizard — a **visual catalog** (shadcn-gallery style: wireframe thumbnail + name + blurb per kind, grouped containers/charts/data/controls) with type-aware seeding — the wizard classifies the first dataset's columns (numeric/categorical/temporal) and pre-fills sensible encodings. The sidebar is a hierarchical tree (cards expand to their children; any node is selectable for full editing). Embedded components edit **in context**: the canvas renders the parent card live with the draft injected (Solo / In-card segmented toggle + parent breadcrumbs). The right panel is a **Figma-style inspector**: one scrolling panel of hairline-separated collapsible sections (Data, Component, per-spec-group sections like Mark/Layout/Axes & Grid, Animation, Interaction incl. control behavior, Sync, YAML) — no tabs. Localhost map: **workshop/studio :5173** (`npm run dev`), **reader :4400** (`npm run read`), built-site preview :4173.
- Animation executor: **anime.js v4** (author's pick over CSS keyframes). The IR stores only declarations ({ entrance, duration, delay, easing }, anime v4 easing names like "outExpo"); `packages/components/src/animation.ts` performs them. Respects prefers-reduced-motion.
- Workshop write-back: Vite dev-server middleware (`POST /__workshop/save`) writes `content/definitions.yaml`; fixed target path, YAML-validated payload, UI blocks saving while the IR has errors. YAML comments outside edited nodes survive (yaml `parseDocument` round-trip).
- Workshop reactivity is **preview-only** (local filters in the canvas) — the real sync engine remains a Phase 3 decision (Zustand vs RxJS vs custom).
- Data: static CSV connector in `packages/data` (d3-dsv); files bundled from `content/data/` via `import.meta.glob`.

Committed (Phase 3 — decided 2026-06-12):

- Reactivity engine: **Zustand v5** (author's pick over custom graph/RxJS). `packages/sync` is a framework-free vanilla store (`zustand/vanilla`) + pure resolution logic; the React adapter (`DocSyncProvider`/`useDocSync`/`LiveControl`) lives in `packages/components`. The event graph is derived directly from the document's bindings + sync rules — no parallel registration.
- Control semantics (Phase 3, additive ControlDef fields): `field` = the column a control acts on (falls back to the target's first filter transform; validator warns `BINDING_NO_FIELD` when unresolvable); slider `mode: max|min` keeps rows ≤/≥ value; toggle `value` = the field value kept while ON. Action semantics: `filter` removes rows; `update` ≡ filter until live connectors (Phase 5); `highlight` dims non-matching marks (rides the card-sync dim mechanism). **Filters on columns a dataset doesn't have are no-ops** — all_components rules must not blank unrelated datasets.
- Live controls render automatically wherever `DocumentView` mounts (reader, published site, studio preview): dropdowns get dynamic options from data, sliders get data-driven extents and a live `field ≤ value` readout, all with a reset chip.
- **Reader localhost**: `npm run read` → clean read-only book at **localhost:4400** (the site app's dev server), fully interactive; studio stays on :5173.

Committed (Phase 4 — decided 2026-06-13):

- **Rendering abstraction**: in-app projections share the React component layer — the reader renders five stateless views of the same compiled IR, selected by URL hash: `#read` (default), `#slides`, `#course`, `#dashboard`, `#paper`. External targets are pure text/print projections: `packages/renderers/slides` exports Slidev markdown (`npm run export:slidev` → `dist/slides.md`); PDF = paper mode + print CSS (browser/headless print). A dedicated PDF engine (Typst/Paged.js) remains a future decision.
- **Layout system**: slides/lessons paginate at heading level ≤ 2; slides overflow into "(cont.)" slides after a block budget. Dashboard mode is a node-type filter (controls row + 2-col widget grid). Components can't run inside Slidev, so they export as labeled pointers to the web rendering — never silently dropped.
- **`code` node + `code` component** (additive 0.1): fenced Markdown blocks now compile to `code` nodes (the old UNSUPPORTED_NODE drop is gone); the component type adds language/title/lineNumbers/wrap/fontSize options. Highlighting is a zero-dep regex tokenizer in `CodeBlock.tsx` — swapping in shiki later is renderer-only. **Jupyter-cell mode**: code components render code (with a faint 0.25-opacity line-number gutter — **line numbers on the code only, never the output**) above a **tabbed output pane** (`CellOutput`). Tabs appear only for the representations the cell recorded: **Table** (`result` = dataframe rows), **Plot** (`plot` = image src; data URIs are the natural recorded form), **Text** (`output` = stdout), **Info** (`info` = key→value variable/debug dump). All authored in YAML as recorded snapshots; Phase 5 (WASM R / Python REPL) populates the same `CellOutputData` shape at runtime with no rendering change.
- **`sql` component (display-only)** + static SQL engine. **Decided 2026-06-13: neither SQL nor R execute on the page in Phase 4** — real execution is Phase 5 (a SQL database with JOIN support; a WASM R environment). The `SqlConsole` renders the query (JetBrains-highlighted) + a **recorded result snapshot** authored in `options.result`; the Run button is present (matches the reference aesthetic) but disabled with a "Phase 5" affordance, and a "live SQL database & JOINs · Phase 5" badge sits in the footer. The static recursive-descent engine (`packages/data/src/sql.ts`, SELECT/aggregates/WHERE+BETWEEN/GROUP BY/ORDER BY/LIMIT, tested) is **no longer imported by the rendered component** — it stays ready to back author-time previews and the Phase-5 path. `FROM` names a dataset by its registry key.
- **JetBrains/Darcula syntax highlighting** (`CodeBlock.highlightLine`): token classes keyword/function/constant/string/number/comment. Darcula palette in dark mode (keyword #cc7832, function #ffc66d, constant #9876aa, string #6a8759, number #6897bb, comment #808080, default fg #a9b7c6); IntelliJ-light palette in paper mode. KEYWORDS hold only control-flow/declarations — builtins (`print`, `lmer`, `AVG`) fall through to function detection (ident before `(`), literals (`True`, `NULL`) are constants.
- **Self-contained components**: `code`/`sql`/`card` types render without the standard `kp-component` figure caption (they own their window chrome).
- **Hero header** (additive 0.1, frontmatter-authored): `chapter`, `subtitle`, `tags[]`, `breadcrumb[]` on the document drive a `HeroHeader` (chapter badge + serif title + subtitle + tag pills + breadcrumb). `chapter` accepts YAML numbers (8.3) coerced to string. When a hero exists and the first node is an H1 duplicating the title, it's dropped to avoid a double title.
- Course mode stores per-lesson completion in `localStorage` (presentation state, never in the IR).
- **HeroUI component library** (added 2026-06-13): ~38 HeroUI components live in `packages/components/src/hero/` — `hero-specs.ts` is the scraped prop catalog (props pulled from the HeroUI theme source on GitHub: button variants solid/bordered/light/flat/faded/shadow/ghost, the 6-color system default/primary/secondary/success/warning/danger, sm/md/lg, none/sm/md/lg/full, plus per-component props), `HeroRender.tsx` is the attribute-driven renderer (data-color sets --c/--cf tokens; data-variant/size/radius select the rest in CSS — no per-combination JS). Components: button, snippet, chip, badge, avatar, user, image, link, kbd, divider, spacer, skeleton, spinner, progress, circular_progress, input, textarea, number_input, checkbox, radio_group, input_otp, autocomplete, alert, tooltip, popover, modal, toast, drawer, accordion, tabs, breadcrumbs, pagination, navbar, listbox, dropdown, scroll_shadow, calendar, date_input. **Omitted because they already exist**: card, code, table, select, slider, switch. The catalog feeds the IR enum, `specsFor()` (workshop Figma inspector), the wizard catalog (grouped HeroUI · Actions/Display/Feedback/Inputs/Navigation/Date with SVG thumbnails) and `ComponentRenderer` (self-contained dispatch). Sync guard test (`hero.test.ts`) keeps the IR enum and `HERO_COMPONENTS` keys aligned. To add more: append to `HERO_COMPONENTS` + the IR enum + a `HeroRender` case + CSS.

Committed (Phase 5 — decided 2026-06-14):

- **Execution layer** `packages/runtime` — real in-browser code execution, lazily dynamic-imported so the engines stay out of the main chunk (code-split into separate `duckdb-*.js` / `webr-*.js` bundles).
- **SQL engine: DuckDB-WASM** (author's pick). `runDuckSql(sql, csvMap)` registers each dataset's CSV text as a real table (once per page) and runs the **full SQL surface incl. JOIN/CTE/window functions**. `SqlConsole` is live again: with `autoRun` (the chosen execution model — **live auto-run on load**) it executes on mount, shows the recorded snapshot instantly, then replaces it with live results (`✓ Nms · live`); a Run button re-executes. `FROM` names a dataset by registry key. The old static recursive-descent engine stays in `packages/data/src/sql.ts` for tests/author-time but is no longer the renderer's path.
- **On-prem SQL gateway** (added 2026-06-14) — for big tables that shouldn't ship to the browser. A SQL component sets `options.engine: server` + `options.connection: <name>`; `runServerSql(sql, {gateway, connection})` POSTs to the gateway, which runs the query against the on-prem DB and returns only the (capped) result rows. Gateway = `packages/query-server` (a `node:http` server, `npm run gateway`, default :8787): adapters for **sqlite** (built-in `node:sqlite`, zero-dep — the reference `local` connection loads the demo CSVs), **postgres** (`pg`), **mysql** (`mysql2`), **duckdb** (`@duckdb/node-api`), the DB drivers dynamically imported/optional. **Credentials live server-side only** (env `KP_CONNECTIONS` JSON: name → {driver,url}); the IR/content references a connection by name, never a credential. Read-only by guard (`readonly.ts`: single SELECT/WITH only) — production should also use a read-only DB role. Gateway URL via `VITE_QUERY_GATEWAY` (default localhost:8787); CORS + `Cross-Origin-Resource-Policy: cross-origin` so the COEP-isolated reader can read it. Recorded snapshot is the fallback when the gateway is absent.
- **R engine: WebR** (R compiled to WASM — the only real option). Installs packages from the WebR binary repo on demand (**lme4 IS available** for R 4.3–4.5, so `lmer` runs for real), injects datasets as R data frames (column-wise, type-preserving), captures stdout → Text, a returned data.frame → Table, base-graphics → Plot. Code components with `language: r` auto-run live; recorded `output` is the fallback. First run is heavy (~30s: download R + install lme4; cached after) — a spinner shows progress.
- **Execution kernel** (`packages/runtime/src/kernel.ts`, added 2026-06-14) — a shared notebook-style session, the right model for SQL↔R interop:
  1. **Shared table registry.** SQL cells publish their result rows to the kernel under the component name (`kernel.provideTable`); the kernel materialises every registered table as a real R data frame, so an R cell can use a SQL result directly (`sprint_query$mean_time`). The recorded snapshot is published immediately so dependents resolve before the live query finishes; a cell can declare `options.uses: [name]` to wait.
  2. **Persistent R session.** R runs in WebR's global env, so `model <- lmer(...)` in one cell is usable in the next. Runs are **serialised through a queue** → deterministic top-to-bottom notebook semantics (and no concurrent WebR access). Tables are version-gated (re-synced only when changed). `kernel.reset()` clears the session.
  - Bug fixed in the rewrite: data-frame capture used `cap.result` instead of probing `.Last.value` (which the `is.data.frame` check clobbered); temp column vars are now `rm()`'d so the shared session stays clean.
- **Data plumbing**: `buildCsvMap(datasets, files)` (in `@knowledge/data`) → dataset name → raw CSV text; provided to the tree via `CsvContext` (no prop-drilling) and consumed by `ComponentRenderer`/`SqlConsole`.
- **Cross-origin isolation**: both Vite dev servers + the site `preview` send `COOP: same-origin` / `COEP: credentialless` so SharedArrayBuffer is available (DuckDB threads, WebR). **A production host must send these headers too** — GitHub Pages can't, so live execution falls back to the recorded snapshots there; Vercel/Netlify can (config). `optimizeDeps.exclude` keeps Vite from pre-bundling the WASM packages.

Recommended but not yet committed (mark as decision points in PRs):

- Tables: simple HTML table now; TanStack Table optional later
- PDF engine beyond print CSS (Typst vs Paged.js vs headless Chrome)
- Reproducibility (Phase 5 cont.): dataset versioning, query/result snapshot caching, deterministic re-runs — execution works; provenance/caching is still open.

### Monorepo Layout (current)

```
knowledge-platform/
├── CLAUDE.md
├── content/             # sample content for dev — production content lives in its own repo
│   ├── document.md
│   └── definitions.yaml
├── scripts/
│   └── check-content.ts # CI gate: compile content, exit 1 on IR errors
├── .github/workflows/publish.yml  # example publish pipeline (Pages)
├── packages/
│   ├── ir/              # Zod schema, types, validator, dependency graph — ZERO runtime deps
│   ├── compiler/        # Markdown/DSL → IR
│   ├── components/      # (Phase 2) plot/table component implementations
│   ├── data/            # (Phase 2+) dataset connectors + query abstraction
│   ├── sync/            # (Phase 3) event graph engine
│   └── renderers/
│       ├── web/         # stateless (IR, theme) → JSX
│       ├── pdf/         # (Phase 4)
│       ├── slides/      # (Phase 4)
│       └── course/      # (Phase 4)
└── apps/
    ├── studio/          # local preview + component workshop (editor mode)
    └── site/            # published reader page — the static build CI deploys
```

Rule: each layer is its own package. Cross-layer imports only through `ir` types — a renderer may never import from `data`, a component may never import from `sync`, etc.

## Knowledge IR Specification

### Document Structure

```yaml
id: document_id
nodes:
  - type: heading
    text: Linear Mixed Models
  - type: paragraph
    text: Repeated observations introduce dependence.
  - type: component
    ref: sprint_distribution
  - type: dataset
    ref: sprint_study
```

### Node Taxonomy

| Group        | Node types                                  |
| ------------ | ------------------------------------------- |
| Core         | `heading`, `paragraph`, `list`, `equation`, `callout` |
| Data-driven  | `dataset`, `table`, `plot`, `chart`         |
| Interaction  | `control` (slider, dropdown, toggle), `sync_binding` |
| Composition  | `section`, `layout_grid`, `tabs`            |

## Component Layer

Components are **declarative definitions** — no embedded logic, no hidden state.

```yaml
components:
  sprint_distribution:
    type: histogram
    data:
      ref: sprint_study
    encoding:
      x: sprint_time
    transforms:
      - filter: athlete_id
```

Allowed component types: `table`, `plot`, `chart`, `equation` renderer, `quiz`, `simulation`, `callout`, `diagram`.

## Data Layer

**Data is NEVER embedded in documents.** Always referenced.

```yaml
datasets:
  sprint_study:
    source: postgres
    connection: sport_science_db
    query: |
      SELECT *
      FROM sprint_sessions
```

Supported sources: Postgres, DuckDB, Parquet, CSV. MongoDB optional, later.

## Interaction Layer

Behavior is defined separately from components:

```yaml
interactions:
  athlete_filter:
    type: dropdown
    options: dynamic

bindings:
  - source: athlete_filter
    target: sprint_table
    action: filter
  - source: athlete_filter
    target: sprint_plot
    action: filter
```

## Synchronization Model

A declarative event graph:

```
UI Control → Event → Component Update
```

```yaml
sync:
  - from: training_load_slider
    to: regression_plot
    action: update
  - from: athlete_filter
    to: all_components
    action: filter
```

Implementation (Zustand / RxJS / custom event graph): ⚠️ **decision deferred to Phase 3** — do not pick one before then.

## Presentation Layer

Defines appearance ONLY. Never content, never data, never behavior.

```yaml
theme:
  plot:
    style: academic_dark
  table:
    density: compact
  callout:
    style: minimal_card
```

## Animation Layer (Optional)

Used only for slide/course rendering:

```yaml
animations:
  sprint_plot:
    entrance: fade
    duration: 400ms
```

## Renderer System

All targets are projections of the **same IR**:

```
                IR
                 ↓
   ┌──────┬──────┼──────┬──────┐
  Web   Slides  PDF  Course   API
                              Mobile
```

Targets: web app, reactive book or PDF, Slidev deck, course UI, dashboard mode, paper mode, headless API.

## Markdown Authoring Format

Markdown is ONLY a convenience syntax. The compiler transforms it into IR.

```markdown
# Linear Mixed Models

Repeated measurements introduce dependence.

::dataset sprint_study
::plot sprint_distribution
::control athlete_filter
```

## Compiler Responsibilities (Markdown → IR)

Must:

- resolve dataset references
- resolve component references
- validate against the IR schema
- build the dependency graph

Must NOT:

- embed runtime logic
- resolve styling
- execute queries

## Phase Plan

**Current phase: Phase 5 — built 2026-06-14** (live execution: DuckDB-WASM SQL with JOINs + WebR running lme4::lmer, both auto-run on load; `packages/runtime`). Verified live in the browser. Remaining Phase 5: reproducibility (dataset versioning, result-snapshot caching). Phase 4 — built 2026-06-13 (multi-renderer: read/slides/course/dashboard/paper modes in the reader, Slidev exporter, code blocks). Phase 3 built 2026-06-12; Phase 2 built 2026-06-12. Real components (visx), static data layer, anime.js animation layer, and the component workshop (Storybook-style editor over the Data / Style / Animation / Interaction / Sync layers with YAML write-back) are live in the studio. Outstanding Phase 2 items: more component types toward the ~100-component vocabulary, table polish, richer transforms. Phase 1 record: foundation built 2026-06-11, publish loop built 2026-06-12 — `packages/ir` (Zod schema, validator, dependency graph), `packages/compiler` (remark → IR, YAML sidecars), `packages/renderers/web` (stateless React projection), `apps/studio` (live preview at `npm run dev`), `apps/site` (published reader page, `npm run build:site`), `scripts/check-content.ts` (CI gate) and `.github/workflows/publish.yml` (Pages pipeline) exist and pass typecheck + 21 tests. Remaining Phase 1 polish before Phase 2: richer inline content model (bold/links are currently flattened to plain text) is an open design point.

| Phase | Goal | Deliverables | Decision points |
| ----- | ---- | ------------ | --------------- |
| 1 | IR Foundation | IR schema (Zod), Markdown parser, IR validator, basic web renderer | IR format (JSON vs YAML), AST structure design, node taxonomy |
| 2 | Components | Plot system (visx / D3 / Observable Plot — vivid, reactive; no Vega-Lite), table system (TanStack optional), static dataset connectors, component workshop (Storybook-style editor mode) with YAML write-back | visx vs D3 vs Observable Plot vs custom, query abstraction layer, workshop write-back design (browser → YAML files) |
| 3 | Reactivity | Sync graph engine, UI controls, state propagation | Zustand vs RxJS vs custom graph, event model design |
| 4 | Multi-Renderer | PDF exporter, Slidev generator, course mode, dashboard mode, paper mode | Rendering abstraction strategy, layout system design |
| 5 | Data + Reproducibility | Dataset versioning, caching layer, query snapshots | Execution model (live vs cached vs hybrid), reproducibility guarantees |

## Open Questions — Do NOT Decide in Phase 1

- IR: graph vs tree hybrid?
- Reactive engine choice?
- Dataset execution model?
- Caching strategy?
- Plugin system design?
- Schema extensibility rules?

When code touches one of these areas, write the minimal version that keeps the decision open, and flag it.

## Success Criteria

The system is successful when:

- A single dataset can power a book chapter, a lecture slide, AND an interactive dashboard
- No duplication of content is required
- Changing a dataset updates all outputs
- Authors never write UI code
- Developers never write content

## Code Style & Conventions

- TypeScript strict mode; no `any`
- `packages/ir` has zero runtime dependencies — types + Zod schemas + pure validators only
- Compiler is pure functions: `(markdown, registry) → IR | ValidationError[]` — no I/O inside the compile step
- Renderers are stateless: `(IR, theme) → output` — no fetching, no state mutation
- Every IR schema change ships with validator tests and a schema version bump
- Unit tests required for compiler and validator before merging

## Instructions for Claude (Execution Mode)

When working on this project:

1. **Always propose changes in IR first** — schema before implementation
2. **Never collapse layers** without explicit approval
3. **Present decisions as options, not defaults** — especially anything in Open Questions
4. **Separate clearly**: architecture proposals vs implementation code vs schema changes
5. **Maintain backward compatibility of the IR** — existing documents must keep validating
