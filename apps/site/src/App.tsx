import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compile } from "@knowledge/compiler";
import { CellSessionContext, CsvContext, DocSyncProvider } from "@knowledge/components";
import type { CellSession, NotebookCellData } from "@knowledge/components";
import { buildCsvMap, buildDataMap } from "@knowledge/data";
import type { DataTable } from "@knowledge/data";
import type { IRDocument, IRNode } from "@knowledge/ir";
import { DocumentView, NodeView, irToMarkdownDoc, irToNotebook } from "@knowledge/renderer-web";
import type { NotebookOverrides } from "@knowledge/renderer-web";
import documentSource from "../../../content/document.md?raw";
import definitionsSource from "../../../content/definitions.yaml?raw";
import { AuthProvider, useAuth } from "./auth";
import { LoginPage } from "./LoginPage";
import { TopBar } from "./TopBar";
import type { AppNotification } from "./TopBar";

/**
 * Phase 4 multi-renderer: the reader is five stateless projections of the
 * same compiled IR, selected by URL hash — #read (default), #slides,
 * #course, #dashboard, #paper. Rendering abstraction decision: in-app
 * projections share the React component layer; external targets (Slidev,
 * print-PDF) are text/print projections of the same IR.
 */

const dataFiles = import.meta.glob("../../../content/data/*.csv", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

type ViewMode = "read" | "slides" | "course" | "dashboard" | "paper";

const MODES: { id: ViewMode; label: string }[] = [
  { id: "read", label: "Read" },
  { id: "slides", label: "Slides" },
  { id: "course", label: "Course" },
  { id: "dashboard", label: "Dashboard" },
  { id: "paper", label: "Paper" },
];

function modeFromHash(): ViewMode {
  const hash = window.location.hash.replace("#", "");
  return (MODES.some((m) => m.id === hash) ? hash : "read") as ViewMode;
}

/** Slide/lesson pagination: split at heading level ≤ maxLevel, overflow at maxBlocks. */
interface Page {
  title: string;
  nodes: IRNode[];
}

function paginate(doc: IRDocument, maxLevel: number, maxBlocks: number): Page[] {
  const pages: Page[] = [];
  let current: Page = { title: doc.title ?? doc.id, nodes: [] };
  const flush = () => {
    if (current.nodes.length > 0) pages.push(current);
  };
  for (const node of doc.nodes) {
    if (node.type === "heading" && node.level <= maxLevel) {
      flush();
      current = { title: node.text, nodes: [node] };
      continue;
    }
    if (maxBlocks > 0 && current.nodes.length >= maxBlocks) {
      flush();
      current = { title: `${current.title} (cont.)`, nodes: [] };
    }
    current.nodes.push(node);
  }
  flush();
  return pages;
}

/** Trigger a client-side download of generated text (notebook / markdown). */
function downloadBlob(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

/** Auth gate: hold render until the session is read, then login or reader. */
function Gate() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? <Reader /> : <LoginPage />;
}

function Reader() {
  const [mode, setMode] = useState<ViewMode>(modeFromHash);

  useEffect(() => {
    const onHash = () => setMode(modeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("paper-mode", mode === "paper");
  }, [mode]);

  const result = useMemo(() => compile(documentSource, { definitions: definitionsSource }), []);
  const data = useMemo(
    () => (result.document ? buildDataMap(result.document.datasets, dataFiles).data : {}),
    [result.document],
  );
  const csvMap = useMemo(
    () => (result.document ? buildCsvMap(result.document.datasets, dataFiles) : {}),
    [result.document],
  );

  // Notebook-export registry: each editable cell publishes its current source +
  // last output here (mutating a ref, no re-render); the export reads it.
  const registry = useRef<Map<string, NotebookCellData>>(new Map());
  const register = useCallback((cellId: string, data: NotebookCellData) => {
    registry.current.set(cellId, data);
  }, []);
  // Cells are editable in the interactive reading modes, read-only in paper/slides.
  const editable = mode === "read" || mode === "course" || mode === "dashboard";
  const session = useMemo<CellSession>(
    () => ({ scope: result.document?.id ?? "default", editable, register }),
    [result.document, editable, register],
  );

  // Course-derived notifications: unfinished lessons → homework + a study tip.
  const notifications = useMemo<AppNotification[]>(() => {
    const d = result.document;
    if (!d) return [];
    const lessons = paginate(d, 2, 0);
    let done: string[] = [];
    try {
      done = JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]") as string[];
    } catch {
      /* ignore corrupt progress */
    }
    const items: AppNotification[] = lessons
      .filter((l) => !done.includes(l.title))
      .slice(0, 4)
      .map((l, i): AppNotification => ({
        id: `hw-${i}`,
        kind: "homework",
        title: `Homework: ${l.title}`,
        detail: "Open this lesson in course mode to complete it.",
      }));
    items.push({
      id: "study-1",
      kind: "study",
      title: "New study available",
      detail: "Mixed-effects models — recommended next.",
    });
    return items;
  }, [result.document]);

  useEffect(() => {
    if (result.document?.title) document.title = result.document.title;
  }, [result.document]);

  if (!result.document) {
    return (
      <pre className="site-error">
        {`Content failed IR validation:\n\n${JSON.stringify(result.issues, null, 2)}`}
      </pre>
    );
  }
  const doc = result.document;

  const overrides = (): NotebookOverrides => Object.fromEntries(registry.current);
  const exportNotebook = () =>
    downloadBlob(`${doc.id}.ipynb`, JSON.stringify(irToNotebook(doc, overrides()), null, 1), "application/json");
  const exportMarkdown = () =>
    downloadBlob(`${doc.id}.md`, irToMarkdownDoc(doc, overrides()), "text/markdown;charset=utf-8");

  return (
    <CsvContext.Provider value={csvMap}>
      <CellSessionContext.Provider value={session}>
        <nav className="reader-switcher" aria-label="View mode">
          {MODES.map((m) => (
            <a key={m.id} href={`#${m.id}`} className={mode === m.id ? "active" : ""}>
              {m.label}
            </a>
          ))}
        </nav>
        <TopBar notifications={notifications} />
        {mode === "read" && <ReadView doc={doc} data={data} csvMap={csvMap} />}
        {mode === "slides" && <SlidesView doc={doc} data={data} csvMap={csvMap} />}
        {mode === "course" && <CourseView doc={doc} data={data} csvMap={csvMap} />}
        {mode === "dashboard" && <DashboardView doc={doc} data={data} csvMap={csvMap} />}
        {mode === "paper" && <PaperView doc={doc} data={data} csvMap={csvMap} />}
        <div className="reader-exportbar" aria-label="Download this document">
          <span className="reader-exportbar__label">Keep your work</span>
          <button
            type="button"
            className="reader-export"
            onClick={exportNotebook}
            title="Download a Jupyter notebook (.ipynb) — code + latest results; datasets stay in the app"
          >
            ⬇ .ipynb
          </button>
          <button
            type="button"
            className="reader-export"
            onClick={exportMarkdown}
            title="Download a Markdown copy — prose + code + results"
          >
            ⬇ .md
          </button>
        </div>
      </CellSessionContext.Provider>
    </CsvContext.Provider>
  );
}

interface ViewProps {
  doc: IRDocument;
  data: Record<string, DataTable>;
  csvMap: Record<string, string>;
}

function ReadView({ doc, data, csvMap }: ViewProps) {
  return (
    <div className="site">
      <DocumentView document={doc} data={data} csvMap={csvMap} />
      <footer className="site__footer">Compiled from Knowledge IR {doc.irVersion}</footer>
    </div>
  );
}

/* ── Slides ─────────────────────────────────────────────────────────── */

function SlidesView({ doc, data, csvMap }: ViewProps) {
  const slides = useMemo(() => paginate(doc, 2, 4), [doc]);
  const [index, setIndex] = useState(0);
  const slide = slides[Math.min(index, slides.length - 1)]!;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") setIndex((i) => Math.min(i + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

  return (
    <DocSyncProvider doc={doc}>
      <div className="slides">
        <div className="slides__stage">
          <article className="kp-doc slides__slide" key={index}>
            {slide.nodes.map((node, i) => (
              <NodeView key={i} node={node} doc={doc} data={data} />
            ))}
          </article>
        </div>
        <footer className="slides__bar">
          <button type="button" onClick={() => setIndex((i) => Math.max(i - 1, 0))} disabled={index === 0}>
            ←
          </button>
          <span>
            {index + 1} / {slides.length} · {slide.title}
          </span>
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(i + 1, slides.length - 1))}
            disabled={index === slides.length - 1}
          >
            →
          </button>
        </footer>
      </div>
    </DocSyncProvider>
  );
}

/* ── Course ─────────────────────────────────────────────────────────── */

const DONE_KEY = "kp.course.done";

function CourseView({ doc, data }: ViewProps) {
  const lessons = useMemo(() => paginate(doc, 2, 0), [doc]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const lesson = lessons[Math.min(index, lessons.length - 1)]!;

  const markDone = (title: string) => {
    setDone((d) => {
      const next = d.includes(title) ? d : [...d, title];
      localStorage.setItem(DONE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const progress = Math.round((done.filter((t) => lessons.some((l) => l.title === t)).length / lessons.length) * 100);

  return (
    <DocSyncProvider doc={doc}>
      <div className="course">
        <aside className="course__nav">
          <h2>{doc.title ?? doc.id}</h2>
          <div className="course__progress">
            <i style={{ width: `${progress}%` }} />
          </div>
          <span className="course__progress-label">{progress}% complete</span>
          <ol>
            {lessons.map((l, i) => (
              <li key={i}>
                <button type="button" className={i === index ? "active" : ""} onClick={() => setIndex(i)}>
                  <span className="course__check">{done.includes(l.title) ? "✓" : i + 1}</span>
                  {l.title}
                </button>
              </li>
            ))}
          </ol>
        </aside>
        <main className="course__lesson">
          <article className="kp-doc">
            {lesson.nodes.map((node, i) => (
              <NodeView key={i} node={node} doc={doc} data={data} />
            ))}
          </article>
          <footer className="course__footer">
            <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              ← Previous
            </button>
            <button
              type="button"
              className="course__done"
              onClick={() => {
                markDone(lesson.title);
                if (index < lessons.length - 1) setIndex(index + 1);
              }}
            >
              {index === lessons.length - 1 ? "Mark complete" : "Complete & continue →"}
            </button>
          </footer>
        </main>
      </div>
    </DocSyncProvider>
  );
}

/* ── Dashboard ──────────────────────────────────────────────────────── */

const DASHBOARD_TYPES = new Set(["component", "plot", "chart", "table", "control"]);

function flattenForDashboard(nodes: IRNode[]): IRNode[] {
  const out: IRNode[] = [];
  for (const node of nodes) {
    if (DASHBOARD_TYPES.has(node.type)) out.push(node);
    else if (node.type === "section" || node.type === "layout_grid") out.push(...flattenForDashboard(node.children));
  }
  return out;
}

function DashboardView({ doc, data }: ViewProps) {
  const nodes = useMemo(() => flattenForDashboard(doc.nodes), [doc]);
  const controls = nodes.filter((n) => n.type === "control");
  const widgets = nodes.filter((n) => n.type !== "control");
  return (
    <DocSyncProvider doc={doc}>
      <div className="dashboard">
        <header className="dashboard__head">
          <h1>{doc.title ?? doc.id}</h1>
          <div className="dashboard__controls kp-doc">
            {controls.map((node, i) => (
              <NodeView key={i} node={node} doc={doc} data={data} />
            ))}
          </div>
        </header>
        <div className="dashboard__grid kp-doc">
          {widgets.map((node, i) => (
            <div key={i} className="dashboard__cell">
              <NodeView node={node} doc={doc} data={data} />
            </div>
          ))}
        </div>
      </div>
    </DocSyncProvider>
  );
}

/* ── Paper ──────────────────────────────────────────────────────────── */

function PaperView({ doc, data, csvMap }: ViewProps) {
  return (
    <div className="kp-paper">
      <button type="button" className="kp-paper__printbtn" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
      <DocumentView document={doc} data={data} csvMap={csvMap} />
      <footer className="site__footer">Compiled from Knowledge IR {doc.irVersion}</footer>
    </div>
  );
}
