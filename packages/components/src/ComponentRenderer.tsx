import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { ParentSize } from "@visx/responsive";
import type { AnimationDef, ComponentDef } from "@knowledge/ir";
import type { DataTable } from "@knowledge/data";
import { applyFilters } from "@knowledge/data";
import type { AggregateMode } from "@knowledge/data";
import { applyEffects, effectsFor } from "@knowledge/sync";
import { playEntrance } from "./animation";
import { CardView } from "./CardView";
import type { FlowEdge, FlowNode } from "./Flow";

// React Flow is heavy; lazy-load it so it stays out of the main chunk.
const FlowView = lazy(() => import("./Flow"));
import { CodeBlock } from "./CodeBlock";
import type { CellOutputData } from "./CellOutput";
import { HeroRender } from "./hero/HeroRender";
import { isHeroType } from "./hero/hero-specs";
import { SqlConsole } from "./SqlConsole";
import { useDocSync } from "./doc-sync";
import { useCsvMap } from "./runtime-context";
import { HierarchyDiagram } from "./diagram";
import {
  AreaClosedPlot,
  BandsPlot,
  BarsPlot,
  BoxPlot,
  CURVES,
  DensityPlot,
  DonutPlot,
  HistogramPlot,
  PanelsPlot,
  SparklinePlot,
  ThresholdPlot,
  ViolinPlot,
  XYPlot,
} from "./plots";
import type { CurveName, GridMode } from "./plots";
import { resolvedOptions } from "./option-specs";
import { CardSyncContext } from "./sync";
import type { CardSync } from "./sync";
import { SummaryTable } from "./SummaryTable";
import { TableView } from "./TableView";
import { COLORS } from "./theme";

/**
 * Declarative ComponentDef + rows → rendered component. Stateless except for
 * card composition: a card with children provides the card-scoped sync
 * context (hover highlight + click filter across its children, keyed by the
 * card's encoding.x) and applies its active filter to every child's rows.
 */

export interface ComponentRendererProps {
  name: string;
  def: ComponentDef;
  rows?: DataTable;
  animation?: AnimationDef;
  replayKey?: number;
  /** Full component registry — needed to resolve card children. */
  registry?: Record<string, ComponentDef>;
  /** Resolved dataset rows by dataset name — needed for card children. */
  dataMap?: Record<string, DataTable>;
  /** Dataset name → raw CSV text — for the Phase 5 DuckDB SQL engine. */
  csvMap?: Record<string, string>;
  /** Ancestor component names (cycle guard for composition). */
  visited?: string[];
  /** Render without the outer figure chrome (used for card children). */
  bare?: boolean;
  /**
   * Workshop-only: make this component (and card children) click-selectable on
   * the canvas. The reader never passes these, so its rendering is identical.
   */
  selectable?: boolean;
  /** Name of the currently-selected component (gets the active outline). */
  activeName?: string;
  /** Called with a component name when its element is clicked. */
  onPick?: (name: string) => void;
  /** Workshop-only: persist dragged flow node positions back to the IR. */
  onFlowNodes?: (name: string, nodes: FlowNode[]) => void;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return choices.includes(String(value) as T) ? (String(value) as T) : fallback;
}

function prettyName(name: string): string {
  return name.replace(/_/g, " ");
}

export function ComponentRenderer({
  name,
  def,
  rows,
  animation,
  replayKey = 0,
  registry,
  dataMap,
  csvMap: csvMapProp,
  visited = [],
  bare = false,
  selectable = false,
  activeName,
  onPick,
  onFlowNodes,
}: ComponentRendererProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Workshop click-to-select: spread onto each branch's outermost element.
  // stopPropagation makes the innermost element win (a card child over its card).
  const pickClass = selectable ? ` kp-pick${name === activeName ? " kp-pick--active" : ""}` : "";
  const pickAttrs: { "data-kp-name"?: string; onClick?: (e: ReactMouseEvent) => void } = selectable
    ? {
        "data-kp-name": name,
        onClick: (e) => {
          e.stopPropagation();
          onPick?.(name);
        },
      }
    : {};
  // Card-scoped sync state (only used when this component is a card).
  const [cardHover, setCardHover] = useState<string | null>(null);
  const [cardFilter, setCardFilter] = useState<string | null>(null);

  // Phase 3: document-wide sync engine — re-derive rows from control state.
  const docSync = useDocSync();
  // csvMap comes from the prop (workshop) or the document-root context (reader).
  const ctxCsv = useCsvMap();
  const csvMap = csvMapProp ?? ctxCsv;
  const engineEffects =
    docSync.active && docSync.doc ? effectsFor(docSync.doc, name, docSync.values) : null;
  rows = rows && engineEffects ? applyEffects(rows, engineEffects) : rows;

  useEffect(() => {
    if (ref.current && animation) playEntrance(ref.current, animation);
  }, [animation, replayKey]);

  const encoding = def.encoding ?? {};
  const o = resolvedOptions(def);
  const color = str(o.color) ?? COLORS.accent;
  const height = num(o.height) ?? 260;
  const grid = oneOf(o.grid, ["none", "rows", "columns", "both"] as const, "rows") as GridMode;
  const xTicks = num(o.xTicks) ?? 6;
  const yTicks = num(o.yTicks) ?? 4;
  const curve = (typeof o.curve === "string" && o.curve in CURVES ? o.curve : "monotoneX") as CurveName;
  const frame = { grid, xTicks, yTicks };

  const chartBox = (extra: number, render: (width: number) => ReactNode) => (
    // ParentSize measures via an absolutely-positioned, overflow-hidden inner
    // div, so its container must own an explicit height.
    <div style={{ height: height + extra }}>
      <ParentSize debounceTime={50}>{({ width }) => (width > 0 ? render(width) : null)}</ParentSize>
    </div>
  );

  /* ── Card: composition + sync provider, no figure chrome ──────────── */
  if (def.type === "card" || def.type === "callout") {
    const syncField = str(encoding.x) ?? null;
    const children = def.children ?? [];
    const columns = Math.max(1, Math.min(4, num(o.columns) ?? 1));
    const gap = num(o.gap) ?? 14;
    const sync: CardSync = {
      syncField,
      hoverValue: cardHover,
      setHoverValue: setCardHover,
      filterValue: cardFilter,
      setFilterValue: setCardFilter,
    };
    return (
      <div ref={ref} className={`kp-cardwrap${pickClass}`} {...pickAttrs}>
        <CardView
          title={str(o.title)}
          body={def.description}
          variant={oneOf(o.variant, ["glass", "flat", "bordered"] as const, "glass")}
          radius={oneOf(o.radius, ["sm", "md", "lg", "xl"] as const, "lg")}
          shadow={oneOf(o.shadow, ["none", "sm", "md", "lg"] as const, "md")}
          blur={num(o.blur) ?? 24}
          padding={num(o.padding) ?? 20}
          isHoverable={bool(o.isHoverable, false)}
          fullWidth={bool(o.fullWidth, true)}
          code={str(o.code)}
          headerExtra={
            cardFilter && syncField ? (
              <button type="button" className="kp-uicard__filterchip" onClick={() => setCardFilter(null)}>
                {syncField} = <code>{cardFilter}</code> ✕
              </button>
            ) : undefined
          }
        >
          {children.length > 0 && (
            <CardSyncContext.Provider value={sync}>
              <div
                className="kp-uicard__grid"
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap }}
              >
                {children.map((childName) => {
                  if (visited.includes(childName) || childName === name) {
                    return (
                      <div key={childName} className="kp-component__note">
                        composition cycle at “{childName}”
                      </div>
                    );
                  }
                  const childDef = registry?.[childName];
                  if (!childDef) {
                    return (
                      <div key={childName} className="kp-component__note">
                        unknown component “{childName}”
                      </div>
                    );
                  }
                  let childRows = childDef.data ? dataMap?.[childDef.data.ref] : undefined;
                  if (childRows && syncField && cardFilter) {
                    childRows = applyFilters(childRows, { [syncField]: cardFilter });
                  }
                  const span = Math.min(num(childDef.options?.span) ?? 1, columns);
                  return (
                    <div key={childName} style={{ gridColumn: `span ${span}` }}>
                      <ComponentRenderer
                        name={childName}
                        def={childDef}
                        rows={childRows}
                        registry={registry}
                        dataMap={dataMap}
                        csvMap={csvMap}
                        visited={[...visited, name]}
                        bare
                        selectable={selectable}
                        activeName={activeName}
                        onPick={onPick}
                        onFlowNodes={onFlowNodes}
                      />
                    </div>
                  );
                })}
              </div>
            </CardSyncContext.Provider>
          )}
        </CardView>
      </div>
    );
  }

  // HeroUI component family — self-contained presentational widgets.
  if (isHeroType(def.type)) {
    return (
      <div className={`kp-selfcontained hui-host${pickClass}`} ref={ref} {...pickAttrs}>
        <HeroRender type={def.type} o={o} />
      </div>
    );
  }

  /* ── Data-driven types ─────────────────────────────────────────────── */
  let body: ReactNode;
  if (def.type === "code") {
    // Recorded REPL output: text (stdout), table (dataframe), plot (image),
    // info (variable values). Each is an authored snapshot until Phase 5.
    const cellOutput: CellOutputData = {
      text: str(o.output),
      table: Array.isArray(o.result) ? (o.result as DataTable) : undefined,
      plot: str(o.plot),
      info: isRecord(o.info) ? o.info : undefined,
    };
    const hasOutput = cellOutput.text || cellOutput.table || cellOutput.plot || cellOutput.info;
    // Phase 5: R cells run live in WebR, injecting their dataset as a data frame.
    const isR = str(o.language) === "r";
    const injectRows = def.data ? dataMap?.[def.data.ref] : undefined;
    body = (
      <CodeBlock
        code={def.description ?? "# add code in the component's description field"}
        language={str(o.language) ?? "text"}
        title={str(o.title)}
        lineNumbers={bool(o.lineNumbers, true)}
        wrap={bool(o.wrap, false)}
        fontSize={num(o.fontSize) ?? 13}
        elapsed={str(o.elapsed)}
        output={hasOutput ? cellOutput : undefined}
        runtime={isR ? "r" : undefined}
        inject={isR && def.data && injectRows ? { name: def.data.ref, rows: injectRows } : undefined}
        uses={Array.isArray(o.uses) ? (o.uses.filter((u) => typeof u === "string") as string[]) : undefined}
        autoRun={bool(o.autoRun, true)}
        cellId={name}
      />
    );
  } else if (def.type === "sql") {
    const recorded = Array.isArray(o.result) ? (o.result as DataTable) : undefined;
    body = (
      <SqlConsole
        query={def.description ?? "SELECT * FROM dataset LIMIT 5"}
        name={name}
        result={recorded}
        csvMap={csvMap}
        engine={str(o.engine) === "server" ? "server" : "wasm"}
        connection={str(o.connection)}
        gateway={str(o.gateway)}
        title={str(o.title)}
        elapsed={str(o.elapsed)}
        maxRows={num(o.maxRows) ?? 50}
        autoRun={bool(o.autoRun, true)}
      />
    );
  } else if (def.type === "flow") {
    const flowNodes = Array.isArray(o.nodes) ? (o.nodes as FlowNode[]) : [];
    const flowEdges = Array.isArray(o.edges) ? (o.edges as FlowEdge[]) : [];
    body = (
      <div className="kp-flow-host" style={{ height: num(o.height) ?? 360 }}>
        <Suspense fallback={<div className="kp-component__canvas"><span>loading flow…</span></div>}>
          <FlowView
            nodes={flowNodes}
            edges={flowEdges}
            options={o}
            onNodesPersist={onFlowNodes ? (nodes) => onFlowNodes(name, nodes) : undefined}
            renderEmbed={(childName) => {
              const childDef = registry?.[childName];
              if (!childDef || visited.includes(childName) || childName === name) return null;
              const childRows = childDef.data ? dataMap?.[childDef.data.ref] : undefined;
              return (
                <ComponentRenderer
                  name={childName}
                  def={childDef}
                  rows={childRows}
                  registry={registry}
                  dataMap={dataMap}
                  csvMap={csvMap}
                  visited={[...visited, name]}
                  bare
                />
              );
            }}
          />
        </Suspense>
      </div>
    );
  } else if (!rows) {
    body = (
      <div className="kp-component__canvas">
        <span>
          no static data for <code>{def.data?.ref ?? "—"}</code> — live connectors arrive in Phase 5
        </span>
      </div>
    );
  } else {
    switch (def.type) {
      case "histogram":
        body = encoding.x
          ? chartBox(0, (width) => (
              <HistogramPlot
                rows={rows}
                x={encoding.x!}
                width={width}
                height={height}
                color={color}
                fillOpacity={num(o.fillOpacity) ?? 0.85}
                rx={num(o.rx) ?? 2}
                stroke={str(o.stroke) ?? "transparent"}
                bins={num(o.bins) ?? 20}
                {...frame}
              />
            ))
          : <Misconfigured message="histogram needs encoding.x" />;
        break;

      case "bars": {
        const aggregate = oneOf(o.aggregate, ["count", "mean", "sum"] as const, "mean") as AggregateMode;
        if (!encoding.x) {
          body = <Misconfigured message="bars needs encoding.x (a categorical column)" />;
        } else if (aggregate !== "count" && !encoding.y) {
          body = <Misconfigured message={`bars with aggregate "${aggregate}" needs encoding.y`} />;
        } else {
          body = chartBox(0, (width) => (
            <BarsPlot
              rows={rows}
              x={encoding.x!}
              y={encoding.y}
              width={width}
              height={height}
              color={color}
              fillOpacity={num(o.fillOpacity) ?? 0.9}
              rx={num(o.rx) ?? 6}
              bandPadding={num(o.bandPadding) ?? 0.25}
              stroke={str(o.stroke) ?? "transparent"}
              strokeWidth={num(o.strokeWidth) ?? 0}
              aggregate={aggregate}
              {...frame}
            />
          ));
        }
        break;
      }

      case "area":
        body =
          encoding.x && encoding.y
            ? chartBox(0, (width) => (
                <AreaClosedPlot
                  rows={rows}
                  x={encoding.x!}
                  y={encoding.y!}
                  width={width}
                  height={height}
                  color={color}
                  fillOpacity={num(o.fillOpacity) ?? 0.5}
                  gradient={bool(o.gradient, true)}
                  stroke={str(o.stroke) ?? color}
                  strokeWidth={num(o.strokeWidth) ?? 2}
                  curve={curve}
                  showDots={bool(o.showDots, false)}
                  dotRadius={num(o.dotRadius) ?? 3}
                  {...frame}
                />
              ))
            : <Misconfigured message="area needs encoding.x and encoding.y" />;
        break;

      case "dots":
      case "plot":
      case "chart": {
        const mark: "dot" | "line" =
          def.type === "chart" ? "line" : def.type === "dots" ? "dot" : str(o.mark) === "line" ? "line" : "dot";
        const colorField = str(encoding.fill) ?? str(encoding.color);
        body =
          encoding.x && encoding.y
            ? chartBox(colorField ? 30 : 0, (width) => (
                <XYPlot
                  rows={rows}
                  x={encoding.x!}
                  y={encoding.y!}
                  width={width}
                  height={height}
                  color={color}
                  colorField={colorField}
                  mark={mark}
                  radius={num(o.radius) ?? 4}
                  opacity={num(o.opacity) ?? 0.8}
                  stroke={str(o.stroke) ?? "transparent"}
                  strokeWidth={mark === "dot" ? (num(o.strokeWidth) ?? 0) : 0}
                  curve={curve}
                  lineWidth={mark === "line" ? (num(o.strokeWidth) ?? 2) : 2}
                  refLine={oneOf(o.refLine, ["none", "zero", "diagonal"] as const, "none")}
                  {...frame}
                />
              ))
            : <Misconfigured message={`${def.type} needs encoding.x and encoding.y`} />;
        break;
      }

      case "donut":
        body = encoding.x
          ? chartBox(0, (width) => (
              <DonutPlot
                rows={rows}
                x={encoding.x!}
                y={encoding.y}
                width={width}
                height={height}
                valueMode={oneOf(o.valueMode, ["count", "sum"] as const, "count")}
                innerRadius={num(o.innerRadius) ?? 0.62}
                padAngle={num(o.padAngle) ?? 0.02}
                showLegend={bool(o.showLegend, true)}
              />
            ))
          : <Misconfigured message="donut needs encoding.x (a categorical column)" />;
        break;

      case "density":
        body = encoding.x
          ? chartBox(0, (width) => (
              <DensityPlot
                rows={rows}
                x={encoding.x!}
                width={width}
                height={height}
                color={color}
                fillOpacity={num(o.fillOpacity) ?? 0.45}
                gradient={bool(o.gradient, true)}
                smooth={num(o.smooth) ?? 2}
                showAxis={bool(o.showAxis, true)}
              />
            ))
          : <Misconfigured message="density needs encoding.x (a numeric column)" />;
        break;

      case "violin":
        body =
          encoding.x && encoding.y ? (
            chartBox(0, (width) => (
              <ViolinPlot
                rows={rows}
                x={encoding.x!}
                y={encoding.y!}
                fill={str(encoding.fill)}
                width={width}
                height={height}
                split={bool(o.split, true)}
                showBox={bool(o.showBox, true)}
                showMean={bool(o.showMean, true)}
                showPoints={bool(o.showPoints, true)}
                bandwidth={num(o.bandwidth) ?? 2}
                fillOpacity={num(o.fillOpacity) ?? 0.55}
                grid={grid}
                yTicks={yTicks}
              />
            ))
          ) : (
            <Misconfigured message="violin needs encoding.x (category) and encoding.y (value)" />
          );
        break;

      case "box":
        body =
          encoding.x && encoding.y ? (
            chartBox(0, (width) => (
              <BoxPlot
                rows={rows}
                x={encoding.x!}
                y={encoding.y!}
                fill={str(encoding.fill)}
                width={width}
                height={height}
                showMean={bool(o.showMean, true)}
                showPoints={bool(o.showPoints, true)}
                fillOpacity={num(o.fillOpacity) ?? 0.6}
                grid={grid}
                yTicks={yTicks}
              />
            ))
          ) : (
            <Misconfigured message="box needs encoding.x (category) and encoding.y (value)" />
          );
        break;

      case "threshold": {
        const y2 = str(encoding.y2);
        body =
          encoding.x && encoding.y && y2 ? (
            chartBox(0, (width) => (
              <ThresholdPlot
                rows={rows}
                x={encoding.x!}
                y={encoding.y!}
                y2={y2}
                width={width}
                height={height}
                curve={curve}
                aboveColor={str(o.aboveColor) ?? "#7fd1b9"}
                aboveOpacity={num(o.aboveOpacity) ?? 0.55}
                belowColor={str(o.belowColor) ?? "#e0aaff"}
                belowOpacity={num(o.belowOpacity) ?? 0.55}
                line1Color={str(o.line1Color) ?? "#e2e8f0"}
                line1Width={num(o.line1Width) ?? 2}
                line1Dash={bool(o.line1Dash, false)}
                showLine1={bool(o.showLine1, true)}
                line2Color={str(o.line2Color) ?? "#94a3b8"}
                line2Width={num(o.line2Width) ?? 1.5}
                line2Dash={bool(o.line2Dash, true)}
                showLine2={bool(o.showLine2, true)}
                grid={grid}
                xTicks={xTicks}
                yTicks={yTicks}
              />
            ))
          ) : (
            <Misconfigured message="threshold needs encoding.x, encoding.y (series 1) and encoding.y2 (series 2)" />
          );
        break;
      }

      case "bands":
        body =
          encoding.x && encoding.y ? (
            chartBox(0, (width) => (
              <BandsPlot
                rows={rows}
                x={encoding.x!}
                y={encoding.y!}
                fill={str(encoding.fill)}
                width={width}
                height={height}
                band={oneOf(o.band, ["none", "sd", "se", "ci95"] as const, "ci95")}
                bandOpacity={num(o.bandOpacity) ?? 0.18}
                lineWidth={num(o.lineWidth) ?? 2.5}
                glow={bool(o.glow, true)}
                glowStrength={num(o.glowStrength) ?? 3}
                curve={curve}
                showLegend={bool(o.showLegend, true)}
                showPoints={bool(o.showPoints, false)}
                crosshair={bool(o.crosshair, true)}
                grid={grid}
                xTicks={xTicks}
                yTicks={yTicks}
                bandGradient={bool(o.bandGradient, false)}
                palette={str(o.palette)}
                xLabel={str(o.xLabel)}
              />
            ))
          ) : (
            <Misconfigured message="bands needs encoding.x, encoding.y and (optional) encoding.fill for series" />
          );
        break;

      case "panels": {
        const insetRef = str(o.insetRef);
        body =
          encoding.x && encoding.y && encoding.facet ? (
            <PanelsPlot
              rows={rows}
              x={encoding.x}
              y={encoding.y}
              seriesField={str(encoding.fill)}
              facetField={encoding.facet}
              insetRows={insetRef ? dataMap?.[insetRef] : undefined}
              insetPanelField={str(o.insetPanelField) ?? "panel"}
              insetMetricField={str(o.insetMetricField) ?? "metric"}
              insetValueField={str(o.insetValueField) ?? "diff"}
              perPanelHeight={num(o.height) ?? 230}
              initialCols={num(o.columns) ?? 2}
              solidSeries={str(o.solidSeries) ?? "Bounce"}
              band={oneOf(o.band, ["none", "sd", "se", "ci95"] as const, "none")}
              bandOpacity={num(o.bandOpacity) ?? 0.14}
              lineWidth={num(o.lineWidth) ?? 2}
              glow={bool(o.glow, true)}
              glowStrength={num(o.glowStrength) ?? 2.6}
              curve={curve}
              showInset={bool(o.showInset, true)}
              showLegend={bool(o.showLegend, true)}
              crosshair={bool(o.crosshair, true)}
              toolbar={bool(o.toolbar, true)}
              grid={grid}
              yTicks={yTicks}
              palette={str(o.palette)}
            />
          ) : (
            <Misconfigured message="panels needs encoding.x, encoding.y and encoding.facet (encoding.fill = the paired series)" />
          );
        break;
      }

      case "sparkline": {
        const valueField = encoding.y ?? encoding.x;
        body = valueField
          ? chartBox(0, (width) => (
              <SparklinePlot
                rows={rows}
                y={valueField}
                x={encoding.y ? encoding.x : undefined}
                width={width}
                height={height}
                color={color}
                strokeWidth={num(o.strokeWidth) ?? 1.8}
                fillArea={bool(o.fillArea, true)}
              />
            ))
          : <Misconfigured message="sparkline needs encoding.y (a numeric column)" />;
        break;
      }

      case "summary_table":
        body =
          encoding.x && encoding.y ? (
            <SummaryTable
              rows={rows}
              x={encoding.x}
              y={encoding.y}
              badgeField={str(encoding.fill)}
              bestMode={oneOf(o.bestMode, ["min", "max"] as const, "min")}
              showBadges={bool(o.badges, true)}
              showSparkline={bool(o.sparkline, true)}
              density={oneOf(o.density, ["compact", "comfortable"] as const, "compact")}
              striped={bool(o.striped, true)}
            />
          ) : (
            <Misconfigured message="summary_table needs encoding.x (group) and encoding.y (value)" />
          );
        break;

      case "diagram":
        body = encoding.x
          ? chartBox(0, (width) => (
              <HierarchyDiagram
                rows={rows}
                x={encoding.x!}
                width={width}
                height={height}
                color={color}
                maxGroups={num(o.maxGroups) ?? 4}
                maxLeaves={num(o.maxLeaves) ?? 3}
                rootLabel={str(o.rootLabel) ?? "Population"}
              />
            ))
          : <Misconfigured message="diagram needs encoding.x (the grouping column)" />;
        break;

      case "table":
        body = (
          <TableView
            rows={rows}
            limit={num(o.limit) ?? 8}
            density={oneOf(o.density, ["compact", "comfortable"] as const, "compact")}
            striped={bool(o.striped, false)}
          />
        );
        break;

      default:
        body = (
          <div className="kp-component__canvas">
            <span>component type “{def.type}” is not implemented yet</span>
          </div>
        );
    }
  }

  // Document-level highlight rides the same dim mechanism as card hover sync.
  const wrappedBody = engineEffects?.highlight ? (
    <CardSyncContext.Provider
      value={{
        syncField: engineEffects.highlight.field,
        hoverValue: engineEffects.highlight.value,
        setHoverValue: () => undefined,
        filterValue: null,
        setFilterValue: () => undefined,
      }}
    >
      {body}
    </CardSyncContext.Provider>
  ) : (
    body
  );

  // Self-contained surfaces (their own window chrome) skip the figure caption.
  if (def.type === "code" || def.type === "sql" || def.type === "flow") {
    return (
      <div className={`kp-selfcontained${pickClass}`} ref={ref} {...pickAttrs}>
        {wrappedBody}
      </div>
    );
  }

  if (bare) {
    return (
      <div className={`kp-mini${pickClass}`} ref={ref} {...pickAttrs}>
        <h4 className="kp-mini__title">{str(o.title) ?? prettyName(name)}</h4>
        {wrappedBody}
      </div>
    );
  }

  const encodingLabel = Object.entries(encoding)
    .map(([channel, field]) => `${channel} → ${field}`)
    .join(", ");

  return (
    <figure className={`kp-card kp-component${pickClass}`} ref={ref} {...pickAttrs}>
      <span className="kp-card__tag kp-card__tag--component">{def.type}</span>
      <code className="kp-card__name">{name}</code>
      <div className="kp-component__plot">{wrappedBody}</div>
      <figcaption className="kp-card__meta">
        {def.data ? (
          <>
            data: <code>{def.data.ref}</code>
          </>
        ) : (
          "no data source"
        )}
        {encodingLabel ? <> · {encodingLabel}</> : null}
      </figcaption>
    </figure>
  );
}

function Misconfigured({ message }: { message: string }) {
  return (
    <div className="kp-component__canvas kp-component__canvas--warn">
      <span>{message}</span>
    </div>
  );
}
