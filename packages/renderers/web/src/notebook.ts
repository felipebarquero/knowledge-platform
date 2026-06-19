import type { ComponentDef, IRDocument, IRNode } from "@knowledge/ir";

/**
 * Notebook export — a stateless text projection of the IR (same philosophy as
 * the Slidev exporter): prose nodes become markdown cells; `code`/`sql` cells
 * become code cells carrying their **edited source + latest outputs**; every
 * other component becomes a labeled pointer (never silently dropped).
 *
 * `overrides` come from the live reader: each editable cell publishes its
 * current source + last run output, keyed by the component name. When a cell
 * has no override, the IR's recorded snapshot is used.
 *
 * Datasets are intentionally NOT bundled — the data lives in the web app; a
 * header cell makes that explicit. Both an `.ipynb` (Jupyter) and a Markdown
 * projection are produced from the same intermediate cell list.
 */

export interface NotebookCellOutputs {
  text?: string;
  table?: Record<string, unknown>[];
  /** Image data URI (e.g. data:image/png;base64,…). */
  plot?: string;
  info?: Record<string, unknown>;
  error?: string;
}

export interface NotebookOverride {
  source?: string;
  outputs?: NotebookCellOutputs;
}

/** cellId (component name) → live source + outputs captured from the reader. */
export type NotebookOverrides = Record<string, NotebookOverride>;

type NbCell =
  | { kind: "markdown"; source: string }
  | { kind: "code"; language: string; source: string; outputs?: NotebookCellOutputs };

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function rowsOf(value: unknown): Record<string, unknown>[] | undefined {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : undefined;
}

const DATA_NOTE =
  "> ⚠️ **Data is not bundled.** This notebook captures the code and the most recent " +
  "results from the Knowledge Platform web app. The datasets stay in the app — re-run the " +
  "cells there to reproduce with live data.";

/** Recorded outputs from a component def's authored snapshot. */
function recordedOutputs(def: ComponentDef): NotebookCellOutputs | undefined {
  const o = def.options ?? {};
  if (def.type === "sql") {
    const table = rowsOf(o.result);
    return table ? { table } : undefined;
  }
  const out: NotebookCellOutputs = {
    text: str(o.output),
    table: rowsOf(o.result),
    plot: str(o.plot),
    info: isRecord(o.info) ? o.info : undefined,
  };
  return out.text || out.table || out.plot || out.info ? out : undefined;
}

/** Emit a code/sql component as a code cell, applying any live override. */
function componentCodeCell(name: string, def: ComponentDef, overrides: NotebookOverrides): NbCell {
  const ov = overrides[name];
  const language = def.type === "sql" ? "sql" : (str(def.options?.language) ?? "text");
  return {
    kind: "code",
    language,
    source: ov?.source ?? def.description ?? "",
    outputs: ov?.outputs ?? recordedOutputs(def),
  };
}

/** Resolve a referenced component into notebook cells (recurses into cards). */
function componentCells(
  ref: string,
  doc: IRDocument,
  overrides: NotebookOverrides,
  seen: Set<string>,
): NbCell[] {
  const def = doc.components[ref];
  if (!def || seen.has(ref)) {
    return [{ kind: "markdown", source: `> 🧩 \`${ref}\` — interactive in the web app` }];
  }
  if (def.type === "code" || def.type === "sql") return [componentCodeCell(ref, def, overrides)];
  // Cards: a pointer + their code/sql children (other children stay pointers).
  if (def.children && def.children.length > 0) {
    const next = new Set([...seen, ref]);
    const title = str(def.options?.title) ?? ref;
    return [
      { kind: "markdown", source: `**${title}** — \`${def.type}\`` },
      ...def.children.flatMap((child) => componentCells(child, doc, overrides, next)),
    ];
  }
  return [{ kind: "markdown", source: `> 🧩 **${def.type}** \`${ref}\` — interactive in the web app` }];
}

function collectCells(
  nodes: readonly IRNode[],
  doc: IRDocument,
  overrides: NotebookOverrides,
  counter: { n: number },
): NbCell[] {
  const cells: NbCell[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "heading":
        cells.push({ kind: "markdown", source: `${"#".repeat(Math.min(node.level, 6))} ${node.text}` });
        break;
      case "paragraph":
        cells.push({ kind: "markdown", source: node.text });
        break;
      case "list":
        cells.push({
          kind: "markdown",
          source: node.items.map((item, i) => (node.ordered ? `${i + 1}. ${item}` : `- ${item}`)).join("\n"),
        });
        break;
      case "equation":
        cells.push({ kind: "markdown", source: `$$\n${node.tex}\n$$` });
        break;
      case "callout":
        cells.push({ kind: "markdown", source: `> **${(node.kind ?? "note").toUpperCase()}** — ${node.text.replace(/\n+/g, " ")}` });
        break;
      case "dataset":
        cells.push({ kind: "markdown", source: `> 🗄 **dataset** \`${node.ref}\` — lives in the web app` });
        break;
      case "code": {
        const id = `code#${counter.n++}`;
        const ov = overrides[id];
        cells.push({
          kind: "code",
          language: node.language ?? "text",
          source: ov?.source ?? node.value,
          outputs: ov?.outputs,
        });
        break;
      }
      case "component":
      case "plot":
      case "chart":
      case "table":
        cells.push(...componentCells(node.ref, doc, overrides, new Set()));
        break;
      case "control":
        cells.push({ kind: "markdown", source: `> 🎛 **control** \`${node.ref}\` — interactive in the web app` });
        break;
      case "section":
        if (node.title) cells.push({ kind: "markdown", source: `## ${node.title}` });
        cells.push(...collectCells(node.children, doc, overrides, counter));
        break;
      case "layout_grid":
        cells.push(...collectCells(node.children, doc, overrides, counter));
        break;
      case "tabs":
        for (const tab of node.tabs) {
          cells.push({ kind: "markdown", source: `**${tab.label}**` });
          cells.push(...collectCells(tab.children, doc, overrides, counter));
        }
        break;
      case "sync_binding":
        break;
    }
  }
  return cells;
}

/* ── .ipynb (nbformat 4.5) ──────────────────────────────────────────── */

/** nbformat `source`/`text`: array of lines, each terminated except the last. */
function nbLines(text: string): string[] {
  const lines = text.split("\n");
  return lines.map((line, i) => (i < lines.length - 1 ? `${line}\n` : line));
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function htmlTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "<p>(no rows)</p>";
  const cols = Object.keys(rows[0]!);
  const head = `<tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const body = rows
    .map((r) => `<tr>${cols.map((c) => `<td>${esc(String(r[c] ?? ""))}</td>`).join("")}</tr>`)
    .join("");
  return `<table>\n<thead>${head}</thead>\n<tbody>${body}</tbody>\n</table>`;
}

function plainTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "(no rows)";
  const cols = Object.keys(rows[0]!);
  const lines = [cols.join("\t"), ...rows.map((r) => cols.map((c) => String(r[c] ?? "")).join("\t"))];
  return lines.join("\n");
}

function nbOutputs(o: NotebookCellOutputs): unknown[] {
  const outputs: unknown[] = [];
  if (o.text) outputs.push({ output_type: "stream", name: "stdout", text: nbLines(o.text) });
  if (o.table) {
    outputs.push({
      output_type: "execute_result",
      execution_count: null,
      metadata: {},
      data: { "text/html": nbLines(htmlTable(o.table)), "text/plain": nbLines(plainTable(o.table)) },
    });
  }
  if (o.plot) {
    const b64 = o.plot.replace(/^data:image\/\w+;base64,/, "");
    outputs.push({ output_type: "display_data", metadata: {}, data: { "image/png": b64 } });
  }
  if (o.info && Object.keys(o.info).length) {
    const text = Object.entries(o.info)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join("\n");
    outputs.push({ output_type: "stream", name: "stdout", text: nbLines(text) });
  }
  if (o.error) outputs.push({ output_type: "stream", name: "stderr", text: nbLines(o.error) });
  return outputs;
}

export function irToNotebook(doc: IRDocument, overrides: NotebookOverrides = {}): unknown {
  const body = collectCells(doc.nodes, doc, overrides, { n: 0 });
  const cells = [
    { cell_type: "markdown", metadata: {}, source: nbLines(`# ${doc.title ?? doc.id}`) },
    { cell_type: "markdown", metadata: {}, source: nbLines(DATA_NOTE) },
    ...body.map((cell) =>
      cell.kind === "markdown"
        ? { cell_type: "markdown", metadata: {}, source: nbLines(cell.source) }
        : {
            cell_type: "code",
            metadata: cell.language && cell.language !== "r" ? { vscode: { languageId: cell.language } } : {},
            execution_count: null,
            source: nbLines(cell.source),
            outputs: cell.outputs ? nbOutputs(cell.outputs) : [],
          },
    ),
  ];
  return {
    cells,
    metadata: {
      kernelspec: { display_name: "R", language: "R", name: "ir" },
      language_info: { name: "R" },
      knowledge_platform: { scope: doc.id, generated_from: `Knowledge IR ${doc.irVersion}` },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

/* ── Markdown projection ────────────────────────────────────────────── */

function mdOutputs(o: NotebookCellOutputs): string {
  const parts: string[] = [];
  if (o.text) parts.push("```text\n" + o.text.replace(/\n$/, "") + "\n```");
  if (o.table && o.table.length > 0) {
    const cols = Object.keys(o.table[0]!);
    const header = `| ${cols.join(" | ")} |`;
    const rule = `| ${cols.map(() => "---").join(" | ")} |`;
    const body = o.table.map((r) => `| ${cols.map((c) => String(r[c] ?? "")).join(" | ")} |`).join("\n");
    parts.push([header, rule, body].join("\n"));
  }
  if (o.plot) parts.push(`![plot](${o.plot})`);
  if (o.info && Object.keys(o.info).length) {
    parts.push("```text\n" + Object.entries(o.info).map(([k, v]) => `${k}: ${String(v)}`).join("\n") + "\n```");
  }
  if (o.error) parts.push("```text\n" + o.error + "\n```");
  return parts.join("\n\n");
}

export function irToMarkdownDoc(doc: IRDocument, overrides: NotebookOverrides = {}): string {
  const parts: string[] = [`# ${doc.title ?? doc.id}`, DATA_NOTE];
  for (const cell of collectCells(doc.nodes, doc, overrides, { n: 0 })) {
    if (cell.kind === "markdown") {
      parts.push(cell.source);
    } else {
      const fence = ["```" + cell.language, cell.source.replace(/\n$/, ""), "```"].join("\n");
      const outputs = cell.outputs ? mdOutputs(cell.outputs) : "";
      parts.push(outputs ? `${fence}\n\n${outputs}` : fence);
    }
  }
  return parts.join("\n\n") + "\n";
}
