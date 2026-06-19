# HANDOFF — Knowledge Platform

> Onboarding + working knowledge for a fresh Claude session. Read this first,
> then `CLAUDE.md` (the running, dated decision log). This file explains the
> *what and why*; `CLAUDE.md` records *every decision in order*. When they
> disagree, the code wins — verify before asserting.

Project root: `/Users/felipebarquero/Documents/Learning/KnowledgePlatform`
(this is a separate project from the sibling `TempusTimeManagement` repo).

---

## 1. What this is

A **Multi-Target Reactive Knowledge Authoring Platform**. Academics/authors/
devs write books, articles, slides, dashboards and interactive materials from a
shared **Knowledge IR**, not Markdown. Markdown is only an authoring syntax.

**The non-negotiable rule:**

```
Markdown → IR → Everything else
```

- Markdown is **disposable**; the **IR is canonical** (immutable, validated).
- Renderers are **stateless projections** of the IR.
- **Never collapse the layers** (content ≠ data ≠ presentation ≠ interaction)
  without explicit user approval. This is what keeps it a "Knowledge OS" and
  not "Markdown with plugins."

**Author background:** strong Python, likes TypeScript and ReScript. The core
is TypeScript-first. Plots use **visx v4** (NOT Vega-Lite — explicitly ruled
out). Animations use **anime.js v4**. Reactivity uses **Zustand**. SQL uses
**DuckDB-WASM** + an on-prem gateway. R uses **WebR**. Flow/graph components use
**React Flow** (`@xyflow/react` v12). Icons use **Iconify** (`@iconify/react` +
offline `@iconify-json/*` collections). These were all the user's explicit picks
— respect them.

**How the user works with Claude:** they give terse, directive instructions and
expect a lot of working software per turn, fully verified in the browser before
you claim done. They like options presented for genuine architecture forks
(use `AskUserQuestion`), but otherwise want you to act. They author content in
real files (offline); the studio is a preview/editor, not the source of truth.

---

## 2. Status (all phases 1–5 built + a large studio/viz overhaul; 76 tests passing)

| Phase | What | State |
|------|------|-------|
| 1 | IR + compiler + validator + web renderer | done |
| 2 | Components (visx), data layer, anime.js, the Workshop | done |
| 3 | Reactivity — Zustand sync engine, live controls | done |
| 4 | Multi-renderer — read/slides/course/dashboard/paper, Slidev export, code blocks, hero header, HeroUI library | done |
| 5 | Execution — DuckDB-WASM SQL (+JOINs), WebR R (lme4 runs), a shared **kernel** (SQL↔R, persistent R session), on-prem **query gateway** | done |
| 6 | **Studio + viz overhaul** (see §19) — Builder-style direct-manipulation Workshop, editable cells + **document-scoped kernel** + **notebook (.ipynb/.md) export**, React Flow `flow` component, **Iconify** icons + searchable picker, liquid-glass + **style presets**, new visx charts (violin/box/threshold/bands/panels) | done |

Remaining Phase-5 work (open): **reproducibility** — dataset versioning,
query/result snapshot caching, deterministic re-runs. Execution works;
provenance/caching does not exist yet.

Git: the repo has had **no commits** the whole time (init only). Offer to
commit; don't do it unprompted. The §19 work is all uncommitted in the working
tree.

---

## 3. Repo layout

Monorepo, **npm workspaces** (NOT pnpm — not installed on the machine).
Everything is `.ts`/`.tsx`, strict TypeScript, run via Vite (apps) or tsx
(scripts/gateway). Source files are imported directly (`exports: "./src/index.ts"`) —
there is no per-package build step; Vite/tsx transpile on the fly.

```
packages/
  ir/            Zod schema = source of truth. nodes, definitions, document,
                 validate (2-stage: shape then referential + cycle checks),
                 graph (dependency graph). ZERO runtime deps besides Zod.
  compiler/      remark/unified: Markdown + YAML sidecar → IR. Pure function.
                 remark-directive (::plot foo / :::grid), remark-math, frontmatter.
  data/          Static data: parseCsv (d3-dsv), buildDataMap (name→rows),
                 buildCsvMap (name→raw CSV text, for DuckDB), aggregateBy,
                 summarizeBy, and a static recursive-descent SQL engine
                 (src/sql.ts — tests/author-time only, NOT the live path).
  sync/          Phase 3 reactivity engine. Zustand vanilla store + pure
                 resolution (effectsFor/applyEffects). Framework-free.
  runtime/       Phase 5 execution. duckdb.ts (DuckDB-WASM), webr.ts (WebR
                 helpers), kernel.ts (shared session: SQL↔R + persistent R),
                 server-sql.ts (calls the gateway). Heavy libs dynamic-imported.
  query-server/  The on-prem SQL gateway (node:http). Adapters: sqlite
                 (node:sqlite, zero-dep, demo `local` conn over content CSVs),
                 postgres (pg), mysql (mysql2), duckdb (@duckdb/node-api).
                 Read-only guard, CORS. Run with `npm run gateway`.
  components/    The React component layer (see §8). ComponentRenderer dispatches
                 every component type. option-specs.ts is the parameter registry.
                 hero/ is the HeroUI library. Flow.tsx (React Flow), Icon.tsx
                 (Iconify), CodeEditor.tsx (editable cells). Depends on
                 data/ir/sync/runtime.
  renderers/
    web/         DocumentView / NodeView — stateless (IR,data,csvMap) → JSX.
                 Owns styles.css (all .kp-* and .hui-* CSS). notebook.ts =
                 IR → .ipynb / .md exporter (§19).
    slides/      irToSlidev — pure IR → Slidev markdown text exporter.
apps/
  studio/        :5173. Preview + Workshop (the authoring GUI). Vite dev server
                 with the workshop write-back middleware + COOP/COEP headers.
                 Workshop helpers: friendly.ts, style-presets.ts, IconPicker.tsx.
  site/          The reader. `npm run read` → :4400 (dev), built preview :4173.
                 5 view modes by URL hash. This is what gets published.
content/         The book. document.md (Markdown) + definitions.yaml (sidecar)
                 + data/*.csv. THIS is the source of truth for the demo content.
scripts/         check-content.ts (the CI gate), export-slidev.ts.
CLAUDE.md        Running dated decision log (large, append-only).
```

---

## 4. How to run

```bash
npm install                 # workspaces
npm run dev                 # studio (Preview + Workshop)  → http://localhost:5173
npm run read                # reader (the book)            → http://localhost:4400
npm run gateway             # on-prem SQL gateway          → http://localhost:8787
npm test                    # vitest (76 tests)
npm run typecheck           # tsc --noEmit (strict)
npm run check:content       # the GATE: compile content → IR, fail on errors
npm run build:site          # gate + production build of the reader
npm run export:slidev       # content → dist/slides.md (present with `npx slidev`)
```

**Always run `npm run typecheck`, `npm test`, and `npm run check:content` before
claiming done.** For anything visible, also verify in the browser with the
preview tools (start the relevant server, snapshot/screenshot, check console).

The launch config for the preview tools lives at
`/Users/felipebarquero/Documents/Learning/TempusTimeManagement/.claude/launch.json`
(note: in the *other* repo). It defines servers `studio` (5173), `site`/preview
(4173), `reader` (4400). Use `preview_start({name})`.

**Ports:** studio 5173, reader 4400, built-site preview 4173, gateway 8787.

---

## 5. The IR (source of truth) — `packages/ir`

An `IRDocument` (see `document.ts`):

```
irVersion, id, title?, subtitle?, chapter?, tags?[], breadcrumb?[]   # hero meta
nodes: IRNode[]                  # the content (ordered)
components: Record<name, ComponentDef>   # the component layer
datasets:   Record<name, DatasetDef>
interactions: Record<name, ControlDef>   # the controls (sliders/dropdowns/toggles)
bindings: Binding[]   sync: SyncRule[]    # the reactivity graph
theme?, animations?
```

**Node types** (`nodes.ts`, a Zod `discriminatedUnion`): heading, paragraph,
list, equation, callout, **code** (fenced blocks compile here), dataset,
component, table, plot, chart, control, sync_binding, section, layout_grid
(`:::grid{columns=N gap=M}`), tabs.

**Component types** (`definitions.ts` `componentTypeSchema` enum): the native
set (table, plot, chart, histogram, bars, area, dots, card, donut, density,
sparkline, summary_table, code, sql, diagram, **flow**, **violin**, **box**,
**threshold**, **bands**, **panels**, …) **plus all HeroUI types** (button, chip, badge,
avatar, alert, tabs, … — see `hero/hero-specs.ts`). `ComponentDef` = `{ type,
data?{ref}, encoding?, transforms?, options?, description?, children?[] }`.
`encoding` carries x/y/**y2**/fill channels (y2 = the second series, used by
`threshold` and `bands`). `options` is a free `Record<string,unknown>` — that's
where almost all per-component config lives.

**Validation** (`validate.ts`) is two-stage: Zod shape, then referential
(every ref resolves; unused defs warn; **composition cycles error**; bindings
need a resolvable field). The compiler returns `{ document, graph, issues }`.

**Backward compatibility:** existing documents must keep validating. Add fields
as optional/additive within `0.1`; bump `IR_VERSION` only on breaking changes.

---

## 6. Authoring model

- Authoring is **OFFLINE**: edit `content/document.md` + `content/definitions.yaml`
  (+ `content/data/*.csv`) in your own editor. The studio reloads on save.
- `definitions.yaml` is the **shared layer** between the human author, the
  Workshop GUI, and AI (you). Keep it human-readable; the Workshop writes it
  back comment-preserving (yaml `parseDocument` round-trip).
- IR serialization is **JSON-canonical**; YAML is only the human sidecar.
- Markdown directives: `::plot foo` / `::plot[foo]` (component ref),
  `::dataset foo`, `::control foo`, `:::grid{columns=2}…:::` (layout),
  `:::note … :::` (callout). Fenced ` ```r ` → a `code` node.

---

## 7. Compile pipeline — `packages/compiler`

`compile(markdown, { definitions })`:
1. remark parses Markdown → mdast; frontmatter read (id/title/chapter/…).
2. `transformRoot` maps mdast → IR nodes (pure; no I/O, no styling, no queries).
3. YAML sidecar parsed → registries.
4. `validateDocument` validates + builds the dependency graph.
Returns `{ document, graph, issues }`. **Pure** — same inputs, same output.

---

## 8. Component system — `packages/components`

The heart of the rendering. Key files:

- **`option-specs.ts`** — the parameter registry. `COMPONENT_OPTION_SPECS[type]`
  = an `OptionSpec[]` (key, control kind color/number/range/select/toggle/text,
  group, default, min/max/choices). The Workshop's Figma inspector and the
  defaults in `resolvedOptions(def)` are generated from this. **To make a
  component param customizable, add an OptionSpec.** HeroUI specs come from
  `hero/hero-specs.ts` (merged in via `specsFor`).
- **`ComponentRenderer.tsx`** — the dispatcher: `(name, def, rows, dataMap,
  csvMap, …) → JSX`. Reads `resolvedOptions(def)`. Branches: HeroUI types →
  `HeroRender`; `card`/`callout` → `CardView` + composition; `code` → `CodeBlock`;
  `sql` → `SqlConsole`; chart types → `plots.tsx`; etc. `code`/`sql`/`card` are
  **self-contained** (no outer figure caption — they own their chrome).
- **Charts** (`plots.tsx`, `diagram.tsx`, `SummaryTable.tsx`) — visx v4. ALL
  imperative drawing lives here; IR component defs stay declarative. Every plot
  is hoverable via the shared **tooltip** system.
- **`tooltip.tsx`** — `useTip`/`ChartTip`/`TipBox`. The tooltip renders in a
  **React portal to `document.body`** with `position: fixed` at the cursor's
  viewport coords, so it is never clipped by a component's size/overflow (it
  flips near viewport edges). `.kp-tip` CSS is `position: fixed; z-index: 9999`.
- **Card composition + card-scoped sync** (`sync.ts` `CardSyncContext`): a card
  with `children: [names]` embeds other components on an internal grid. The
  card's `encoding.x` is a **sync key**: children whose key/badge column matches
  hover-highlight (dim siblings) and click-filter (card-wide). This is
  CARD-scoped presentation, distinct from the Phase-3 document engine.
- **`CodeBlock.tsx`** — JetBrains/Darcula syntax highlighting
  (`highlightLine`, token classes keyword/function/constant/string/number/
  comment; IntelliJ-light in paper mode). Jupyter-cell mode: code above a
  tabbed output pane (`CellOutput.tsx` — Table/Plot/Text/Info tabs, only those
  with content). **Line numbers on code only, never output.** R cells run live
  via the kernel (§13).
- **`SqlConsole.tsx`** — runs SQL live (wasm or server engine). Publishes its
  result to the kernel (§13).
- **`CellOutput.tsx`** — the Table/Plot/Text/Info output pane. `CellOutputData`
  = `{ text?, table?(rows), plot?(img src), info?(key→val) }`.
- **`runtime-context.tsx`** — `CsvContext` provides dataset-name → CSV text to
  SQL components anywhere in the tree (avoids prop-drilling). Also
  `CellSessionContext`/`useCellSession` — carries the kernel **scope** (doc id),
  the `editable` flag, an `onSourceChange` write-back, and a `register` hook so
  cells enroll in **notebook export** (§19).
- **`Flow.tsx`** — the `flow` component (lazy-loaded `@xyflow/react` v12).
  `FlowView` + a custom `KpNode` (Iconify icon tile + label + sublabel + an
  optional **embedded component** rendered inside the node). Hovering a node dims
  the non-neighborhood; `onNodesPersist` writes drag positions back to the def;
  sync inside nodes runs through `CardSyncContext`.
- **`Icon.tsx`** — `Icon` (renders an Iconify glyph by name — the className is on
  the `<svg>`) + `loadIconCatalog()` which lazy-loads the offline collections
  (`@iconify-json/lucide`, `@iconify-json/logos`). Used by Flow nodes, the
  iconized tree, and the studio icon picker.
- **`CodeEditor.tsx`** — the editable-cell editor: a transparent `<textarea>`
  layered over the highlighted `<pre>`, so `code`/`sql` cells are editable in both
  the Workshop and the live reader (reader edits are **ephemeral** — lost on
  reload; persist only via notebook export).

### Component catalog (two families)

1. **Native** (charts/data): histogram, bars, area, dots, donut, density,
   sparkline, plot, chart, table (datatable), summary_table, diagram, code, sql,
   card, **flow** (React Flow graph), **violin** + **box** (visx statistical
   distributions), **threshold** (visx difference/area), **bands** (visx
   mean ± CI/SE/SD ribbons), **panels** (faceted small-multiples of paired glow
   profiles + inset difference box plots + synced crosshair + pan/zoom toolbar).
   The new visx charts live in `plots.tsx` (`ViolinPlot`/`BoxPlot`,
   `ThresholdPlot`, `BandsPlot`, `PanelsPlot`); `flow` is `Flow.tsx`. See §19.
2. **HeroUI library** (`hero/`): ~38 presentational components (button, chip,
   badge, avatar, user, image, link, kbd, divider, spacer, skeleton, spinner,
   progress, circular_progress, input, textarea, number_input, checkbox,
   radio_group, input_otp, autocomplete, alert, tooltip, popover, modal, toast,
   drawer, accordion, tabs, breadcrumbs, pagination, navbar, listbox, dropdown,
   scroll_shadow, calendar, date_input). Props were **scraped from the HeroUI
   theme source on GitHub** (the docs site 404s to fetchers — use raw theme .ts
   files). `hero-specs.ts` is the prop catalog; `HeroRender.tsx` is the
   **attribute-driven** renderer (`data-color` sets `--c`/`--cf` tokens;
   `data-variant/size/radius` select the rest in CSS, no per-combination JS).
   `hero.test.ts` guards that the IR enum and the catalog stay in sync.

---

## 9. The Workshop — `apps/studio/src/Workshop.tsx`

The authoring GUI (Storybook×Figma, with a Builder.io-style direct-manipulation
layer added in §19). Two modes via the studio header pill: **Preview** (renders
the book via DocumentView) and **Workshop**. A **Simple / Advanced** pill
(`friendly.ts`) gates complexity: Simple surfaces the essentials; Advanced
reveals YAML, transforms and the raw option groups.

- **Iconized sidebar tree** (Figma-layers style): every row gets a type glyph via
  `typeIconName` (Iconify); components nest their card/flow children; controls
  list in a separate "Controls" section. `WorkshopSidebar` is shared between the
  component and control editors. `editing: "component" | "control"` switches them.
- **Wizard** (`CreateWizard` + `KindThumb` + `HeroThumb`): a visual catalog
  (shadcn-style thumbnails) grouped Containers/Charts/Data/Controls/HeroUI·*.
  Picking a kind + name creates a component with **type-aware seeding**
  (classifies the first dataset's columns numeric/categorical/temporal and
  pre-fills encodings).
- **Inspector**: Figma-style collapsible sections (Data, Component, per-spec-group
  Style sections, Animation, Interaction, Sync, YAML) generated from
  `option-specs`. Each row = control + reset (↺ removes the key).
- **In-context editing**: selecting a card child renders the parent card live
  with the draft injected (Solo / In-card toggle + breadcrumbs).
- **Click-to-select / drag-to-compose** (Builder.io-style): clicking a rendered
  child in the live card selects it (`selectable`/`activeName`/`onPick` thread
  through ComponentRenderer); dragging a catalog kind onto a card appends it to
  `children`. `CardComposer` manages the child list.
- **Selection → code panel** (bottom): the selected component shown as editable
  JSX-ish source (`defToJsx`) for power users — a text projection of the same def
  the inspector edits (Lunagraph-inspired).
- **Style presets** (`style-presets.ts`): a Nomad-Sculpt-style panel of named,
  one-click style bundles — Liquid Glass · Tahoe, Frosted, Flat, Bordered, Soft
  Dark — applied via `setOption`, then still tweakable per-option. `presetsFor(type)`
  picks the relevant set.
- **Icon picker** (`IconPicker.tsx`): a searchable grid over the loaded Iconify
  collections, for any `"icon"`-kind option (e.g. flow-node icons).
- **Flow editor** (`FlowEditor`): edit a `flow` component's nodes/edges visually —
  add/label nodes, set a per-node icon + embedded component, drag to lay out;
  positions persist back to the def.
- **Controls are first-class** (`ControlEditor`): creating a slider/selector/
  toggle makes a standalone control with its own live preview (`LiveControl`) +
  inspector (Control/Appearance/Behavior/YAML), saved to `interactions`.
- **Write-back**: `POST /__workshop/save { yaml }` (vite middleware in
  `apps/studio/vite.config.ts`) writes `content/definitions.yaml`. Fixed path,
  YAML-validated, comment-preserving; the UI blocks saving while the IR has
  errors.

---

## 10. Reactivity (Phase 3) — `packages/sync`

A **Zustand** vanilla store holds one value per control. Everything else is
derived from the document's `bindings` + `sync` rules: `effectsFor(doc,
component, values)` → filters/highlight; `applyEffects(rows, effects)` (pure).
React adapter in `components/doc-sync.tsx`: `DocSyncProvider`, `useDocSync`,
`LiveControl`. Control semantics (additive ControlDef fields): `field` (column
acted on), slider `mode` (≤/≥), toggle `value` (kept value). Actions: `filter`
removes rows; `update` ≡ filter for now; `highlight` dims non-matching marks.
**Filters on columns a dataset lacks are no-ops** (so `all_components` rules
don't blank unrelated datasets).

---

## 11. Multi-renderer (Phase 4) — `apps/site/src/App.tsx`

The reader is **5 stateless projections of the same compiled IR**, by URL hash:
`#read` (default), `#slides` (paginate at heading ≤2, arrow keys), `#course`
(lesson sidebar + localStorage progress), `#dashboard` (controls row + 2-col
widget grid), `#paper` (light serif + print CSS → PDF via browser print).
External targets: `packages/renderers/slides` `irToSlidev` (pure text exporter;
components become labeled pointers, never silently dropped) and
`packages/renderers/web/notebook.ts` `irToNotebook`/`irToMarkdownDoc` — the
reader's bottom **export bar** downloads the document's code/SQL cells (source +
recorded results, **no datasets**) as a Jupyter `.ipynb` or Markdown. A dedicated
PDF engine (Typst/Paged.js) is an open decision.

---

## 12. Execution (Phase 5) — `packages/runtime` + `packages/query-server`

**Execution model = live auto-run on load** (the user's pick). Recorded
snapshots (`options.result` for SQL, `options.output`/etc. for code) show
instantly and are the fallback where execution isn't available.

- **SQL in-browser**: `runDuckSql(sql, csvMap)` — DuckDB-WASM registers each
  dataset's CSV as a table, full JOIN/CTE/window SQL. `SqlConsole engine: wasm`.
- **SQL on-prem** (for big tables): `SqlConsole engine: server`, `connection:
  <name>`. `runServerSql` POSTs to the **gateway** (`packages/query-server`,
  `npm run gateway`, :8787). Adapters: sqlite (zero-dep demo `local` over
  content CSVs), postgres/mysql/duckdb (drivers dynamically imported/optional).
  **Credentials live server-side only** (env `KP_CONNECTIONS` JSON); the IR
  references a connection by name. Read-only guard + CORS.
- **R**: WebR (R→WASM). Installs packages on demand from the WebR repo
  (**lme4 is available** for R 4.3–4.5 → `lmer` runs for real). First run ~30s
  (download R + install; cached after).
- **Cross-origin isolation**: both Vite servers + the site `preview` send
  `COOP: same-origin` / `COEP: credentialless` for SharedArrayBuffer. **A
  production host must send these too** — GitHub Pages can't (falls back to
  recorded), Vercel/Netlify can. The heavy WASM libs are dynamic-imported →
  code-split into separate chunks; `optimizeDeps.exclude` keeps Vite from
  pre-bundling them.

---

## 13. The kernel (SQL↔R + persistent R) — `packages/runtime/src/kernel.ts`

**Scoped** — `getKernel(scope)` returns the session for a scope key (the document
id, so a chapter/article shares one kernel while different docs stay isolated); a
`Map` caches them. `CellSessionContext` (§8) threads the scope to every cell.
Within a scope it is a **shared notebook-style session**:
1. **Shared table registry.** SQL cells call `kernel.provideTable(name, rows)`;
   the kernel materializes every table as a real R **data frame**, so an R cell
   uses a SQL result directly (e.g. `sprint_query$mean_time`). Recorded
   snapshots are published eagerly so dependents resolve early; a cell can
   declare `options.uses: [name]` to wait.
2. **Persistent R session.** R runs in WebR's global env → variables persist
   across cells (`model <- lmer(...)` in one cell, used in the next). Runs are
   **serialized through a queue** → deterministic top-to-bottom order, no
   concurrent WebR access. Tables are version-gated (re-synced only when
   changed). `kernel.reset()` clears the session.

`webr.ts` has the low-level helpers (`getWebR`, `installPackages`,
`bindDataFrame` — type-preserving + temp-var cleanup, `captureR` — uses
`cap.result`, NOT `.Last.value`). `CodeBlock` calls `kernel.runR`; `SqlConsole`
takes a `name` prop and publishes its result. Demo: `model_fit` then
`model_effects` (uses `model` + `sprint_query`).

> **Caveat:** execution order relies on React firing cells' mount effects in
> document order + the run queue. A future improvement is explicit
> dependency-driven scheduling rather than mount-order.

---

## 14. Conventions & gotchas

- **visx v4** (not 3.x — 3.x lacks React-19 peers). visx `ParentSize` measures
  via an absolutely-positioned overflow-hidden div → **its container needs an
  explicit height** or charts clip to 0. See `chartBox()` in ComponentRenderer.
- **CSS lives in `renderers/web/src/styles.css`** (`.kp-*`) and the studio's
  `studio.css` (`.ws-*`, glass). The components package renders class names; it
  doesn't own CSS. macOS-Tahoe liquid-glass is the design language (wallpaper
  gradient + backdrop-blur panels).
- **Self-contained components** (`code`/`sql`/`card`) skip the figure caption.
- **The gate** (`check:content`) only compiles IR — it does NOT run SQL/R.
  `athlete_meta` shows a benign UNUSED_DATASET warning because it's referenced
  only inside a SQL string the validator can't see. Warnings don't fail the gate.
- **Recorded snapshots** are authored in YAML and are the fallback for SQL/R;
  keep them roughly matching what live execution produces.
- The `ir` package cannot import from `components` (dependency direction). The
  HeroUI type names are listed in BOTH the IR enum and `hero-specs.ts`;
  `hero.test.ts` guards they match.
- A **background gateway process** may be running from earlier
  (`/tmp/kp-gateway.log`); `lsof -ti:8787 | xargs kill` to stop it.

---

## 15. Recipes (how to add things)

**A new native component type:**
1. Add the type name to `componentTypeSchema` (ir/definitions.ts).
2. Add an `OptionSpec[]` under `COMPONENT_OPTION_SPECS[type]` (option-specs.ts).
3. Add a render branch in `ComponentRenderer.tsx` (+ a drawing fn in plots.tsx
   if it's a chart — keep imperative code there, every plot hoverable via useTip).
4. Add a Workshop wizard catalog entry + `KindThumb` case + a `seedComponent`
   case (Workshop.tsx). Add CSS to styles.css.
5. typecheck + test + gate + verify in the browser.

**A new HeroUI component:** append to `HERO_COMPONENTS` (hero-specs.ts) + the IR
enum + a `HeroRender` case + CSS. The catalog/inspector/thumbnail come for free.
(`hero.test.ts` enforces enum↔catalog sync.)

**A new control behavior / sync action:** extend `ControlDef` (additive) +
`effectsFor` in `packages/sync` + the ControlEditor in the Workshop.

**A new view mode / renderer:** add to `apps/site/src/App.tsx` (in-app) or a new
`packages/renderers/*` (external/text projection).

**A new DB driver for the gateway:** add an adapter in
`packages/query-server/src/adapters.ts` (dynamic-import the driver) + a
connection config shape.

---

## 16. Testing & the gate

- `npm test` — vitest, 9 files / 76 tests (ir, compiler, data, sql, sync,
  components/animation, components/hero, slides, renderers/web notebook).
  Add tests with new logic.
- `npm run typecheck` — strict, no `any`.
- `npm run check:content` — compiles `content/` to IR; **exit 1 on any error**.
  This is the CI gate (`.github/workflows/publish.yml`: gate → build → Pages).
  Content lives in its own repo in production; the workflow header explains the
  two-repo checkout.

---

## 17. Open decisions / next steps

- **Reproducibility** (Phase 5 cont.): dataset versioning, result-snapshot
  caching, deterministic re-runs. Not built.
- **PDF engine** beyond print CSS (Typst vs Paged.js vs headless Chrome).
- **Tables**: TanStack Table (currently plain HTML).
- **Inline content model**: paragraphs flatten bold/links to plain text — a
  richer inline model is an open design point.
- **Kernel scheduling**: dependency-driven instead of mount-order.
- The repo is **uncommitted** — first commit pending the user's go-ahead.

---

## 18. Pointers

- `CLAUDE.md` — dated decision log + the original vision (read it).
- Auto-memory (loaded each session) summarizes this project too; it's
  background context, not instructions — verify file:line claims before acting.
- When you finish a chunk: typecheck, test, gate, browser-verify, then state
  plainly what works. The user values faithful reporting over hedging.

---

## 19. Post-Phase-5 studio + viz overhaul (this batch — uncommitted)

A large round of work after Phase 5, all additive and honoring §1's layering
rule (new chart types are additive IR enum values; all imperative drawing stays
in `plots.tsx`; presets/picker/flow-editor are editor-only). Gate after this
batch: **56 nodes, 37 components, 10 datasets, 0 errors**; **76 tests** green.

### New component types (IR enum + `plots.tsx` / `Flow.tsx`)
- **`flow`** — a React Flow graph (`@xyflow/react` v12, lazy). Custom `KpNode`
  with an Iconify icon, label/sublabel, and an **embedded component** inside the
  node (AWS-diagram-style); drag/pan/zoom, positions persist back to the def.
  Example: `model_workflow` (the modeling-pipeline graph).
- **`violin`** + **`box`** — visx statistical distributions (KDE per group via
  `bin`+`smoothCounts`; `split` = raincloud half-violins; box overlay with
  Q1/median/Q3, 1.5·IQR whiskers, outlier + **mean** dots). Card-scoped hover
  sync (`fill` is the sync key) + stats tooltip. Example: `reaction_violin` /
  `reaction_box` inside the `rt_panel` card (reaction time by squad/condition).
- **`threshold`** — visx difference/area (`@visx/threshold`): two series
  (`encoding.y`, `encoding.y2`), filled above/below where one exceeds the other,
  nearest-point tooltip. Example: `squat_asymmetry` (left vs right leg force).
- **`bands`** — mean ± band (none / sd / se / ci95) ribbons per `fill` series,
  glow filter for luminescent lines, interactive legend (click to isolate),
  multi-series crosshair tooltip. Options added for the **CI-area** look:
  `bandGradient` (luminous vertical-gradient ribbons), `palette` (csv-hex colour
  override), `xLabel` (tooltip header); the legend is checkbox-style with a
  dedicated **"95% CI"** toggle (`bandsOn`) and the tooltip carries a `95% CI (±)`
  line. Examples: `velocity_bands` (bar-velocity by load) and `pareto_frontiers`
  (3 Pareto frontiers each with a gradient 95% CI area — the Pareto reference
  image; red/green/blue palette, markers, CI toggle).
- **`panels`** — faceted small-multiples (`PanelsPlot`). One panel per
  `encoding.facet` value; within each, the `encoding.fill` series split into a
  **solid + dashed** pair of glowing mean profiles (`solidSeries` option). Each
  panel carries an **inset difference box plot** from a second dataset
  (`options.insetRef`, resolved via `dataMap`) with a significance `*` (CI₉₅
  excludes 0). A **crosshair syncs across all panels**; the glass **toolbar** is
  live (Interact gate, Pan-drag, Zoom-brush, Reset, View 1↔2 col via
  ResizeObserver, Export CSV). Self-measures width (no `chartBox`). Example:
  `neuromuscular_panels` (bounce vs no-bounce velocity, the multi-panel
  reference image).

### Editable cells + scoped kernel + notebook export
- **Editable `code`/`sql` cells** everywhere (`CodeEditor.tsx`): transparent
  textarea over highlighted pre. Reader edits are **ephemeral** (lost on reload).
- **Document-scoped kernel** (`getKernel(scope)`, §13) keyed by doc id;
  `CellSessionContext` threads scope + the `editable`/`onSourceChange`/`register`
  hooks to every cell.
- **Notebook export** (`renderers/web/notebook.ts`): the reader's bottom export
  bar downloads `.ipynb` / `.md` with cell **source + recorded results but NOT
  datasets** (data stays in the page). 5 tests in `notebook.test.ts`.

### Icons (Iconify)
- `Icon.tsx` + `loadIconCatalog()` lazy-load offline `@iconify-json/lucide` and
  `@iconify-json/logos`. Searchable studio picker (`IconPicker.tsx`) for any
  `"icon"`-kind option; the sidebar tree is iconized via `typeIconName`. (Chose
  Iconify over react-icons: offline collections, render-by-name. The `Icon`
  className lands on the `<svg>`.)

### Builder.io-style Workshop + style presets (§9)
- Click-to-select rendered children, drag-catalog-onto-card to compose,
  **Simple / Advanced** mode (`friendly.ts`), a **Selection → code** (`defToJsx`)
  bottom panel, the iconized tree, and **style presets** (`style-presets.ts`:
  Tahoe liquid glass, Frosted, Flat, Bordered, Soft Dark — one click, still
  tweakable; Nomad-Sculpt-inspired panel).

### New dependencies
`@xyflow/react`, `@iconify/react`, `@iconify-json/lucide`, `@iconify-json/logos`,
`@visx/threshold`. `packages/components/src/css.d.ts` declares `*.css` and the
iconify-json `*.json` modules for TS.

### New files
`components/src/{Flow,Icon,CodeEditor}.tsx`, `components/src/css.d.ts`,
`renderers/web/src/notebook.ts` (+ `test/notebook.test.ts`),
`studio/src/{friendly.ts,style-presets.ts,IconPicker.tsx}`.

### New content (deterministically generated)
`content/data/{reaction_times,squat_force,velocity_profiles,velocity_paired,velocity_diffs,pareto_fronts}.csv`;
`definitions.yaml` defs `model_workflow`, `coef_spark` (currently unused →
warning), `reaction_violin`/`reaction_box`, `rt_panel`, `squat_asymmetry`,
`velocity_bands`, `neuromuscular_panels` (the `panels` example; its
`velocity_diffs` inset dataset shows a benign UNUSED_DATASET warning since it is
referenced via `options.insetRef`, not a `data.ref`), `pareto_frontiers` (the
`bands` CI-area example); new `document.md` sections (modeling pipeline,
reaction-time distributions, limb asymmetry, neuromuscular response, bounce vs
no-bounce, pareto frontiers).

### Gotcha (dev-only)
A **cold-start Vite reload storm** (optimizing `@xyflow/react` / iconify / duckdb
on first load) can leave a stale chunk → a flow renders 0 edges or tree icons
don't paint. **Restart the reader server** (clean rebuild) before judging — it's
not a code bug.
