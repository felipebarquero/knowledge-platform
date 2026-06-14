import { useEffect, useMemo, useState } from "react";
import { compile } from "@knowledge/compiler";
import type { CompileResult } from "@knowledge/compiler";
import { buildCsvMap, buildDataMap } from "@knowledge/data";
import type {
  ComponentDef,
  ControlDef,
  DatasetDef,
  DependencyGraph,
  IRDocument,
  ValidationIssue,
} from "@knowledge/ir";
import { DocumentView } from "@knowledge/renderer-web";
import { Workshop } from "./Workshop";
import documentSource from "../../../content/document.md?raw";
import definitionsSource from "../../../content/definitions.yaml?raw";

/**
 * Studio = preview + component workshop. NOT an editing surface.
 * Authoring happens offline: edit content/*.md and content/*.yaml in your own
 * editor; Vite reloads this preview on save. The source panes are read-only.
 */

const dataFiles = import.meta.glob("../../../content/data/*.csv", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

type Mode = "preview" | "workshop";
type SourceTab = "document" | "definitions";
type ViewTab = "preview" | "components" | "ir" | "issues" | "graph";

export default function App() {
  const [mode, setMode] = useState<Mode>(() =>
    sessionStorage.getItem("kp.studio.mode") === "workshop" ? "workshop" : "preview",
  );
  const [sourceTab, setSourceTab] = useState<SourceTab>("document");
  const [viewTab, setViewTab] = useState<ViewTab>("preview");

  useEffect(() => {
    sessionStorage.setItem("kp.studio.mode", mode);
  }, [mode]);

  const result = useMemo<CompileResult>(() => {
    try {
      return compile(documentSource, { definitions: definitionsSource });
    } catch (error) {
      return {
        document: null,
        graph: null,
        issues: [
          {
            severity: "error",
            code: "COMPILER_CRASH",
            path: "",
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }, []);

  const dataResult = useMemo(
    () =>
      result.document
        ? buildDataMap(result.document.datasets, dataFiles)
        : { data: {}, issues: [] },
    [result.document],
  );
  const csvMap = useMemo(
    () => (result.document ? buildCsvMap(result.document.datasets, dataFiles) : {}),
    [result.document],
  );

  const allIssues = [...result.issues, ...dataResult.issues];
  const errors = allIssues.filter((i) => i.severity === "error");
  const warnings = allIssues.filter((i) => i.severity === "warning");

  return (
    <div className="studio">
      <header className="studio__header">
        <h1>
          Knowledge Studio{" "}
          <span className="studio__phase">Phase 2 · IR {result.document?.irVersion ?? "—"}</span>
        </h1>
        <nav className="studio__modes">
          <button
            type="button"
            className={`tab ${mode === "preview" ? "tab--active" : ""}`}
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
          <button
            type="button"
            className={`tab ${mode === "workshop" ? "tab--active" : ""}`}
            onClick={() => setMode("workshop")}
          >
            Workshop
          </button>
        </nav>
        <div className="studio__status">
          <span className={`pill ${errors.length ? "pill--error" : "pill--ok"}`}>
            {errors.length ? `${errors.length} error${errors.length > 1 ? "s" : ""}` : "valid IR"}
          </span>
          {warnings.length > 0 && (
            <span className="pill pill--warn">
              {warnings.length} warning{warnings.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </header>

      {mode === "workshop" ? (
        result.document ? (
          <Workshop
            doc={result.document}
            documentSource={documentSource}
            definitionsSource={definitionsSource}
            data={dataResult.data}
            csvMap={csvMap}
          />
        ) : (
          <p className="empty" style={{ padding: "2rem" }}>
            Fix compile errors before opening the workshop — see Issues in Preview mode.
          </p>
        )
      ) : (
      <main className="studio__main">
        <section className="pane">
          <nav className="pane__tabs">
            <Tab active={sourceTab === "document"} onClick={() => setSourceTab("document")}>
              content/document.md
            </Tab>
            <Tab active={sourceTab === "definitions"} onClick={() => setSourceTab("definitions")}>
              content/definitions.yaml
            </Tab>
          </nav>
          <p className="pane__hint">
            Offline authoring — edit these files in your own editor; the preview reloads on save.
          </p>
          <pre className="source-view">
            {sourceTab === "document" ? documentSource : definitionsSource}
          </pre>
        </section>

        <section className="pane">
          <nav className="pane__tabs">
            <Tab active={viewTab === "preview"} onClick={() => setViewTab("preview")}>
              Preview
            </Tab>
            <Tab active={viewTab === "components"} onClick={() => setViewTab("components")}>
              Components
            </Tab>
            <Tab active={viewTab === "ir"} onClick={() => setViewTab("ir")}>
              IR
            </Tab>
            <Tab active={viewTab === "issues"} onClick={() => setViewTab("issues")}>
              Issues{allIssues.length ? ` (${allIssues.length})` : ""}
            </Tab>
            <Tab active={viewTab === "graph"} onClick={() => setViewTab("graph")}>
              Graph
            </Tab>
          </nav>
          <div className="pane__body">
            {viewTab === "preview" &&
              (result.document ? (
                <DocumentView document={result.document} data={dataResult.data} csvMap={csvMap} />
              ) : (
                <Empty>Document failed schema validation — see Issues.</Empty>
              ))}
            {viewTab === "components" && <RegistryView document={result.document} />}
            {viewTab === "ir" && (
              <pre className="ir-json">
                {result.document ? JSON.stringify(result.document, null, 2) : "null"}
              </pre>
            )}
            {viewTab === "issues" && <IssueList issues={allIssues} />}
            {viewTab === "graph" && <GraphView graph={result.graph} />}
          </div>
        </section>
      </main>
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={`tab ${active ? "tab--active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}

/**
 * Seed of the graphical component configurator (Phase 2 deliverable).
 * Read-only today; write-back to content/definitions.yaml is the Phase 2
 * decision point recorded in CLAUDE.md.
 */
function RegistryView({ document: doc }: { document: IRDocument | null }) {
  if (!doc) return <Empty>Fix compile errors to inspect the registries.</Empty>;
  const components = Object.entries(doc.components);
  const interactions = Object.entries(doc.interactions);
  const datasets = Object.entries(doc.datasets);
  return (
    <div className="registry">
      <p className="registry__hint">
        Read-only inspector — graphical configuration with write-back to{" "}
        <code>content/definitions.yaml</code> arrives in Phase 2. Until then, edit the YAML by hand
        or let an AI assistant do it.
      </p>

      <h3>Components ({components.length})</h3>
      {components.map(([name, def]) => (
        <ComponentCard key={name} name={name} def={def} />
      ))}

      <h3>Interactions ({interactions.length})</h3>
      {interactions.map(([name, def]) => (
        <ControlCard key={name} name={name} def={def} />
      ))}

      <h3>Datasets ({datasets.length})</h3>
      {datasets.map(([name, def]) => (
        <DatasetCard key={name} name={name} def={def} />
      ))}
    </div>
  );
}

function ComponentCard({ name, def }: { name: string; def: ComponentDef }) {
  return (
    <div className="reg-card">
      <header className="reg-card__head">
        <code className="reg-card__name">{name}</code>
        <span className="reg-card__type">{def.type}</span>
      </header>
      <Row label="data">{def.data ? <code>{def.data.ref}</code> : "—"}</Row>
      {def.encoding && (
        <Row label="encoding">
          {Object.entries(def.encoding)
            .map(([channel, field]) => `${channel} → ${field}`)
            .join(", ")}
        </Row>
      )}
      {def.transforms && def.transforms.length > 0 && (
        <Row label="transforms">{def.transforms.length} step(s)</Row>
      )}
    </div>
  );
}

function ControlCard({ name, def }: { name: string; def: ControlDef }) {
  return (
    <div className="reg-card">
      <header className="reg-card__head">
        <code className="reg-card__name">{name}</code>
        <span className="reg-card__type">{def.type}</span>
      </header>
      {def.label && <Row label="label">{def.label}</Row>}
      {def.options !== undefined && (
        <Row label="options">
          {def.options === "dynamic" ? "dynamic" : def.options.map(String).join(", ")}
        </Row>
      )}
    </div>
  );
}

function DatasetCard({ name, def }: { name: string; def: DatasetDef }) {
  return (
    <div className="reg-card">
      <header className="reg-card__head">
        <code className="reg-card__name">{name}</code>
        <span className="reg-card__type">{def.source}</span>
      </header>
      {def.path && <Row label="path">{def.path}</Row>}
      {def.connection && <Row label="connection">{def.connection}</Row>}
      {def.query && <Row label="query">{def.query.trim()}</Row>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="reg-card__row">
      <span className="reg-card__label">{label}</span>
      <span className="reg-card__value">{children}</span>
    </div>
  );
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return <Empty>No issues — the IR is clean.</Empty>;
  return (
    <ul className="issues">
      {issues.map((issue, index) => (
        <li key={index} className={`issue issue--${issue.severity}`}>
          <span className="issue__severity">{issue.severity}</span>
          <code className="issue__code">{issue.code}</code>
          {issue.path && <code className="issue__path">{issue.path}</code>}
          <span className="issue__message">{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

function GraphView({ graph }: { graph: DependencyGraph | null }) {
  if (!graph) return <Empty>No dependency graph — fix compile errors first.</Empty>;
  const byKind = (kind: string) => graph.nodes.filter((n) => n.kind === kind);
  return (
    <div className="graph">
      <div className="graph__registries">
        {(["dataset", "component", "control"] as const).map((kind) => (
          <div key={kind} className="graph__column">
            <h3>{kind}s</h3>
            {byKind(kind).length === 0 ? (
              <span className="graph__none">none</span>
            ) : (
              byKind(kind).map((node) => (
                <code key={node.id} className={`graph__node graph__node--${kind}`}>
                  {node.id}
                </code>
              ))
            )}
          </div>
        ))}
      </div>
      <h3>Edges</h3>
      {graph.edges.length === 0 ? (
        <Empty>No edges.</Empty>
      ) : (
        <ul className="graph__edges">
          {graph.edges.map((edge, index) => (
            <li key={index}>
              <code>{edge.from}</code>
              <span className={`graph__edge-kind graph__edge-kind--${edge.kind}`}>
                ─{edge.kind}
                {edge.action ? `:${edge.action}` : ""}→
              </span>
              <code>{edge.to}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
