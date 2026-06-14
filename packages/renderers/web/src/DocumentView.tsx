import { createElement } from "react";
import katex from "katex";
import { CodeBlock, ComponentRenderer, CsvContext, DocSyncProvider, LiveControl, useDocSync } from "@knowledge/components";
import type { DataTable } from "@knowledge/data";
import type {
  ControlDef,
  DatasetDef,
  IRDocument,
  IRNode,
} from "@knowledge/ir";

/**
 * Stateless web projection of an IR document: (IR, data) → JSX.
 * No fetching, no state, no business logic. Data is loaded upstream (static
 * connectors) and passed in; components without rows render their no-data
 * state. Controls are inert until the sync engine lands in Phase 3.
 */

export interface DocumentViewProps {
  document: IRDocument;
  /** Resolved dataset rows keyed by dataset name (from @knowledge/data). */
  data?: Record<string, DataTable>;
  /** Dataset name → raw CSV text, for the Phase 5 DuckDB SQL engine. */
  csvMap?: Record<string, string>;
}

export function DocumentView({ document: doc, data, csvMap }: DocumentViewProps) {
  const hasHero = Boolean(doc.subtitle || doc.chapter || doc.tags?.length || doc.breadcrumb?.length);
  // The hero replaces a leading H1 that duplicates the document title.
  const first = doc.nodes[0];
  const nodes =
    hasHero && first?.type === "heading" && first.level === 1 && first.text === doc.title
      ? doc.nodes.slice(1)
      : doc.nodes;
  const content = (
    <>
      {hasHero && <HeroHeader doc={doc} />}
      {nodes.map((node, index) => (
        <NodeView key={node.id ?? `${node.type}-${index}`} node={node} doc={doc} data={data} />
      ))}
    </>
  );
  // Provide csvMap (Phase 5 DuckDB) + mount the Phase 3 sync engine.
  const inner =
    Object.keys(doc.interactions).length > 0 ? (
      <DocSyncProvider doc={doc}>{content}</DocSyncProvider>
    ) : (
      content
    );
  return (
    <article className="kp-doc">
      <CsvContext.Provider value={csvMap ?? {}}>{inner}</CsvContext.Provider>
    </article>
  );
}

function HeroHeader({ doc }: { doc: IRDocument }) {
  return (
    <header className="kp-hero">
      {doc.breadcrumb && doc.breadcrumb.length > 0 && (
        <nav className="kp-hero__crumbs" aria-label="Breadcrumb">
          {doc.breadcrumb.map((crumb, i) => (
            <span key={i}>
              {crumb}
              <i aria-hidden="true">›</i>
            </span>
          ))}
          <strong>
            {doc.chapter ? `${doc.chapter} ` : ""}
            {doc.title}
          </strong>
        </nav>
      )}
      <div className="kp-hero__main">
        {doc.chapter && <span className="kp-hero__chapter">{doc.chapter}</span>}
        <h1 className="kp-hero__title">{doc.title}</h1>
        {doc.subtitle && <p className="kp-hero__subtitle">{doc.subtitle}</p>}
        {doc.tags && doc.tags.length > 0 && (
          <ul className="kp-hero__tags">
            {doc.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
      </div>
    </header>
  );
}

export function NodeView({
  node,
  doc,
  data,
}: {
  node: IRNode;
  doc: IRDocument;
  data?: Record<string, DataTable>;
}) {
  switch (node.type) {
    case "heading":
      return createElement(`h${Math.min(node.level, 6)}`, { className: "kp-heading" }, node.text);
    case "paragraph":
      return <p className="kp-paragraph">{node.text}</p>;
    case "list": {
      const items = node.items.map((item, i) => <li key={i}>{item}</li>);
      return node.ordered ? (
        <ol className="kp-list">{items}</ol>
      ) : (
        <ul className="kp-list">{items}</ul>
      );
    }
    case "equation":
      return <Equation tex={node.tex} display={node.display} />;
    case "code":
      return <CodeBlock code={node.value} language={node.language ?? "text"} />;
    case "callout":
      return (
        <aside className={`kp-callout kp-callout--${node.kind ?? "note"}`}>
          <span className="kp-callout__kind">{node.kind ?? "note"}</span>
          <div className="kp-callout__body">
            {node.text.split("\n\n").map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </aside>
      );
    case "dataset":
      return <DatasetView refId={node.ref} def={doc.datasets[node.ref]} />;
    case "component":
    case "table":
    case "plot":
    case "chart": {
      const def = doc.components[node.ref];
      if (!def) return <Unresolved kind={node.type} refId={node.ref} />;
      return (
        <ComponentRenderer
          name={node.ref}
          def={def}
          rows={def.data ? data?.[def.data.ref] : undefined}
          animation={doc.animations?.[node.ref]}
          registry={doc.components}
          dataMap={data}
          visited={[node.ref]}
        />
      );
    }
    case "control":
      return <ControlView refId={node.ref} def={doc.interactions[node.ref]} doc={doc} data={data} />;
    case "sync_binding":
      return null;
    case "section":
      return (
        <section className="kp-section">
          {node.title ? <h2 className="kp-heading">{node.title}</h2> : null}
          {node.children.map((child, i) => (
            <NodeView key={child.id ?? `${child.type}-${i}`} node={child} doc={doc} data={data} />
          ))}
        </section>
      );
    case "layout_grid":
      return (
        <div
          className="kp-grid"
          style={{
            gridTemplateColumns: `repeat(${node.columns}, minmax(0, 1fr))`,
            gap: node.gap ?? 16,
            padding: node.padding,
          }}
        >
          {node.children.map((child, i) => (
            <NodeView key={child.id ?? `${child.type}-${i}`} node={child} doc={doc} data={data} />
          ))}
        </div>
      );
    case "tabs":
      return (
        <div className="kp-tabs">
          {node.tabs.map((tab, i) => (
            <section key={i} className="kp-tabs__panel">
              <h3 className="kp-tabs__label">{tab.label}</h3>
              {tab.children.map((child, j) => (
                <NodeView key={child.id ?? `${child.type}-${j}`} node={child} doc={doc} data={data} />
              ))}
            </section>
          ))}
        </div>
      );
    default:
      return null;
  }
}

function Equation({ tex, display }: { tex: string; display: boolean }) {
  const html = katex.renderToString(tex, { displayMode: display, throwOnError: false });
  return display ? (
    <div className="kp-equation" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className="kp-equation kp-equation--inline" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function DatasetView({ refId, def }: { refId: string; def: DatasetDef | undefined }) {
  if (!def) return <Unresolved kind="dataset" refId={refId} />;
  const location = def.path ?? def.connection ?? "";
  return (
    <div className="kp-card kp-dataset">
      <span className="kp-card__tag kp-card__tag--dataset">dataset</span>
      <code className="kp-card__name">{refId}</code>
      <span className="kp-card__meta">
        {def.source}
        {location ? ` · ${location}` : ""}
      </span>
      {def.query ? <pre className="kp-card__query">{def.query.trim()}</pre> : null}
    </div>
  );
}

function ControlView({
  refId,
  def,
  doc,
  data,
}: {
  refId: string;
  def: ControlDef | undefined;
  doc: IRDocument;
  data?: Record<string, DataTable>;
}) {
  const sync = useDocSync();
  if (!def) return <Unresolved kind="control" refId={refId} />;
  if (sync.active) return <LiveControl name={refId} def={def} doc={doc} dataMap={data} />;
  const variant = def.variant ?? "glass";
  const size = def.size ?? "md";
  const radius = def.radius ?? "full";
  const placement = def.labelPlacement ?? "left";
  return (
    <div
      className={`kp-control kp-control--${variant} kp-control--${size} kp-control--r-${radius} kp-control--label-${placement}`}
    >
      <span className="kp-control__label">{def.label ?? refId}</span>
      {def.type === "slider" ? (
        <input type="range" disabled min={def.min} max={def.max} step={def.step} />
      ) : null}
      {def.type === "dropdown" ? (
        <select disabled>
          <option>
            {def.placeholder ??
              (def.options === "dynamic" ? "dynamic options" : String(def.options?.[0] ?? "—"))}
          </option>
        </select>
      ) : null}
      {def.type === "toggle" ? <input type="checkbox" disabled /> : null}
      <span className="kp-control__note">reactive in Phase 3</span>
      {def.description ? <span className="kp-control__desc">{def.description}</span> : null}
    </div>
  );
}

function Unresolved({ kind, refId }: { kind: string; refId: string }) {
  return (
    <div className="kp-card kp-card--error">
      <span className="kp-card__tag">{kind}</span>
      <code className="kp-card__name">{refId}</code>
      <span className="kp-card__meta">unresolved reference</span>
    </div>
  );
}
