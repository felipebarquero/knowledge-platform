import { useId, useState } from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import {
  curveBasis,
  curveCardinal,
  curveLinear,
  curveMonotoneX,
  curveNatural,
  curveStep,
} from "@visx/curve";
import { LinearGradient } from "@visx/gradient";
import { GridColumns, GridRows } from "@visx/grid";
import { scaleBand, scaleLinear, scaleOrdinal, scaleTime } from "@visx/scale";
import { AreaClosed, Bar, Circle, LinePath, Pie } from "@visx/shape";
import { bin, extent } from "@visx/vendor/d3-array";
import type { DataTable } from "@knowledge/data";
import { aggregateBy, uniqueValues } from "@knowledge/data";
import type { AggregateMode } from "@knowledge/data";
import { isDimmed, useCardSync } from "./sync";
import { TipBox, fmtVal, useTip } from "./tooltip";
import { COLORS, PALETTE } from "./theme";

/**
 * visx chart primitives for the component layer. Imperative drawing code
 * lives HERE only — component definitions in the IR stay declarative.
 * Every plot is hoverable with a contextual tooltip; categorical marks
 * participate in card-scoped hover/filter sync (see sync.ts).
 */

const MARGIN = { top: 16, right: 16, bottom: 36, left: 52 };
const DIM_OPACITY = 0.22;

export const CURVES = {
  linear: curveLinear,
  monotoneX: curveMonotoneX,
  natural: curveNatural,
  step: curveStep,
  basis: curveBasis,
  cardinal: curveCardinal,
} as const;

export type CurveName = keyof typeof CURVES;

export type GridMode = "none" | "rows" | "columns" | "both";

const tickLabel = {
  fill: COLORS.muted,
  fontSize: 10,
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
} as const;

function numeric(rows: DataTable, field: string): number[] {
  return rows.map((row) => Number(row[field])).filter((v) => Number.isFinite(v));
}

function EmptyNote({ message }: { message: string }) {
  return <div className="kp-component__note">{message}</div>;
}

interface FrameProps {
  width: number;
  height: number;
  grid: GridMode;
  xTicks: number;
  yTicks: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  xScale: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  yScale: any;
}

function Frame({ width, height, grid, xTicks, yTicks, xScale, yScale }: FrameProps) {
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  return (
    <>
      {(grid === "rows" || grid === "both") && (
        <GridRows scale={yScale} left={MARGIN.left} width={innerWidth} stroke={COLORS.grid} strokeOpacity={0.5} numTicks={yTicks} />
      )}
      {(grid === "columns" || grid === "both") && (
        <GridColumns scale={xScale} top={MARGIN.top} height={innerHeight} stroke={COLORS.grid} strokeOpacity={0.5} numTicks={xTicks} />
      )}
      <AxisBottom
        top={height - MARGIN.bottom}
        scale={xScale}
        numTicks={xTicks}
        stroke={COLORS.grid}
        tickStroke={COLORS.grid}
        tickLabelProps={() => ({ ...tickLabel, textAnchor: "middle" as const })}
      />
      <AxisLeft
        left={MARGIN.left}
        scale={yScale}
        numTicks={yTicks}
        stroke={COLORS.grid}
        tickStroke={COLORS.grid}
        tickLabelProps={() => ({ ...tickLabel, textAnchor: "end" as const, dx: -4, dy: 3 })}
      />
    </>
  );
}

/* ── Histogram ──────────────────────────────────────────────────────── */

export interface HistogramPlotProps {
  rows: DataTable;
  x: string;
  width: number;
  height: number;
  color: string;
  fillOpacity: number;
  rx: number;
  stroke: string;
  bins: number;
  grid: GridMode;
  xTicks: number;
  yTicks: number;
}

export function HistogramPlot(props: HistogramPlotProps) {
  const { rows, x, width, height, color, fillOpacity, rx, stroke, bins: binCount } = props;
  const { ref, tip, show, hide } = useTip();
  const values = numeric(rows, x);
  if (values.length === 0) return <EmptyNote message={`no numeric values in "${x}"`} />;
  const [lo, hi] = extent(values) as [number, number];
  const buckets = bin().domain([lo, hi]).thresholds(binCount)(values);
  const xs = scaleLinear({ domain: [lo, hi], range: [MARGIN.left, width - MARGIN.right] });
  const maxCount = Math.max(...buckets.map((b) => b.length));
  const ys = scaleLinear({ domain: [0, maxCount], range: [height - MARGIN.bottom, MARGIN.top], nice: true });
  return (
    <TipBox boxRef={ref} tip={tip}>
      <svg width={width} height={height} role="img" aria-label={`Histogram of ${x}`} onMouseLeave={hide}>
        <Frame {...props} xScale={xs} yScale={ys} />
        {buckets.map((bucket, i) =>
          bucket.x0 === undefined || bucket.x1 === undefined ? null : (
            <Bar
              key={i}
              x={xs(bucket.x0) ?? 0}
              y={ys(bucket.length) ?? 0}
              width={Math.max(1, (xs(bucket.x1) ?? 0) - (xs(bucket.x0) ?? 0) - 1.5)}
              height={Math.max(0, height - MARGIN.bottom - (ys(bucket.length) ?? 0))}
              fill={color}
              opacity={fillOpacity}
              stroke={stroke}
              rx={rx}
              onMouseMove={(e) =>
                show(e, [
                  `${x} ${fmtVal(bucket.x0)} – ${fmtVal(bucket.x1)}`,
                  `${bucket.length} observation${bucket.length === 1 ? "" : "s"}`,
                ])
              }
            />
          ),
        )}
      </svg>
    </TipBox>
  );
}

/* ── Bars (categorical) ─────────────────────────────────────────────── */

export interface BarsPlotProps {
  rows: DataTable;
  x: string;
  y?: string;
  width: number;
  height: number;
  color: string;
  fillOpacity: number;
  rx: number;
  bandPadding: number;
  stroke: string;
  strokeWidth: number;
  aggregate: AggregateMode;
  grid: GridMode;
  xTicks: number;
  yTicks: number;
}

export function BarsPlot(props: BarsPlotProps) {
  const { rows, x, y, width, height, color, fillOpacity, rx, bandPadding, stroke, strokeWidth, aggregate } = props;
  const { ref, tip, show, hide } = useTip();
  const sync = useCardSync();
  const data = aggregateBy(rows, x, y, aggregate);
  if (data.length === 0) return <EmptyNote message={`no groups in "${x}"`} />;
  const xs = scaleBand({
    domain: data.map((d) => d.key),
    range: [MARGIN.left, width - MARGIN.right],
    paddingInner: bandPadding,
    paddingOuter: bandPadding / 2,
  });
  const maxValue = Math.max(...data.map((d) => d.value));
  const ys = scaleLinear({ domain: [0, maxValue], range: [height - MARGIN.bottom, MARGIN.top], nice: true });
  const syncable = sync.syncField !== null && sync.syncField === x;
  return (
    <TipBox boxRef={ref} tip={tip}>
      <svg width={width} height={height} role="img" aria-label={`Bar chart of ${aggregate}(${y ?? "rows"}) by ${x}`} onMouseLeave={() => { hide(); if (syncable) sync.setHoverValue(null); }}>
        <Frame {...props} xScale={xs} yScale={ys} xTicks={data.length} />
        {data.map((d) => (
          <Bar
            key={d.key}
            x={xs(d.key) ?? 0}
            y={ys(d.value) ?? 0}
            width={xs.bandwidth()}
            height={Math.max(0, height - MARGIN.bottom - (ys(d.value) ?? 0))}
            fill={color}
            opacity={isDimmed(sync, syncable ? d.key : null) ? DIM_OPACITY : fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            rx={rx}
            style={{ cursor: syncable ? "pointer" : "default", transition: "opacity 0.15s ease" }}
            onMouseMove={(e) => {
              show(e, [
                d.key,
                `${aggregate}(${y ?? "rows"}) = ${fmtVal(d.value)}`,
                ...(syncable ? ["click to filter siblings"] : []),
              ]);
              if (syncable) sync.setHoverValue(d.key);
            }}
            onClick={() => {
              if (syncable) sync.setFilterValue(sync.filterValue === d.key ? null : d.key);
            }}
          />
        ))}
      </svg>
    </TipBox>
  );
}

/* ── Closed Area ────────────────────────────────────────────────────── */

export interface AreaClosedPlotProps {
  rows: DataTable;
  x: string;
  y: string;
  width: number;
  height: number;
  color: string;
  fillOpacity: number;
  gradient: boolean;
  stroke: string;
  strokeWidth: number;
  curve: CurveName;
  showDots: boolean;
  dotRadius: number;
  grid: GridMode;
  xTicks: number;
  yTicks: number;
}

export function AreaClosedPlot(props: AreaClosedPlotProps) {
  const { rows, x, y, width, height, color, fillOpacity, gradient, stroke, strokeWidth, curve, showDots, dotRadius } = props;
  const gradientId = useId();
  const { ref, tip, show, hide } = useTip();
  const [marker, setMarker] = useState<{ cx: number; cy: number } | null>(null);
  const isTime = rows.some((row) => row[x] instanceof Date);
  const points = rows
    .map((row) => ({ x: isTime ? (row[x] as Date) : Number(row[x]), y: Number(row[y]) }))
    .filter((p) => (isTime ? p.x instanceof Date : Number.isFinite(p.x as number)) && Number.isFinite(p.y))
    .sort((a, b) => Number(a.x) - Number(b.x));
  if (points.length === 0) return <EmptyNote message={`no (${x}, ${y}) pairs`} />;

  const [xLo, xHi] = extent(points, (p) => p.x as number | Date) as [number | Date, number | Date];
  const yHi = (extent(points, (p) => p.y) as [number, number])[1];
  const yLo = Math.min(0, (extent(points, (p) => p.y) as [number, number])[0]);
  const xs = isTime
    ? scaleTime({ domain: [xLo as Date, xHi as Date], range: [MARGIN.left, width - MARGIN.right] })
    : scaleLinear({ domain: [xLo as number, xHi as number], range: [MARGIN.left, width - MARGIN.right], nice: true });
  const ys = scaleLinear({ domain: [yLo, yHi], range: [height - MARGIN.bottom, MARGIN.top], nice: true });

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    points.forEach((p, i) => {
      const d = Math.abs((xs(p.x as never) ?? 0) - px);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    const p = points[best]!;
    setMarker({ cx: xs(p.x as never) ?? 0, cy: ys(p.y) ?? 0 });
    show(e, [`${x}: ${fmtVal(p.x)}`, `${y}: ${fmtVal(p.y)}`]);
  };

  return (
    <TipBox boxRef={ref} tip={tip}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Area chart of ${y} over ${x}`}
        onMouseMove={onMove}
        onMouseLeave={() => {
          hide();
          setMarker(null);
        }}
      >
        {gradient && <LinearGradient id={gradientId} from={color} to={color} fromOpacity={fillOpacity} toOpacity={0.02} />}
        <Frame {...props} xScale={xs} yScale={ys} />
        <AreaClosed
          data={points}
          x={(p) => xs(p.x as never) ?? 0}
          y={(p) => ys(p.y) ?? 0}
          yScale={ys}
          curve={CURVES[curve] ?? curveMonotoneX}
          fill={gradient ? `url(#${gradientId})` : color}
          fillOpacity={gradient ? 1 : fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        {showDots &&
          points.map((p, i) => <Circle key={i} cx={xs(p.x as never) ?? 0} cy={ys(p.y) ?? 0} r={dotRadius} fill={stroke} />)}
        {marker && (
          <>
            <line x1={marker.cx} x2={marker.cx} y1={MARGIN.top} y2={height - MARGIN.bottom} stroke={COLORS.muted} strokeDasharray="3,3" strokeOpacity={0.6} />
            <Circle cx={marker.cx} cy={marker.cy} r={4} fill={stroke} stroke="#fff" strokeWidth={1.5} />
          </>
        )}
      </svg>
    </TipBox>
  );
}

/* ── Dots / scatter / line ──────────────────────────────────────────── */

export interface XYPlotProps {
  rows: DataTable;
  x: string;
  y: string;
  width: number;
  height: number;
  color: string;
  colorField?: string;
  mark: "dot" | "line";
  radius: number;
  opacity: number;
  stroke: string;
  strokeWidth: number;
  curve: CurveName;
  lineWidth: number;
  grid: GridMode;
  xTicks: number;
  yTicks: number;
  /** none | zero (y = 0) | diagonal (y = x) reference line. */
  refLine?: "none" | "zero" | "diagonal";
}

export function XYPlot(props: XYPlotProps) {
  const { rows, x, y, width, height, color, colorField, mark, radius, opacity, stroke, strokeWidth, curve, lineWidth, refLine = "none" } = props;
  const { ref, tip, show, hide } = useTip();
  const sync = useCardSync();
  const points = rows
    .map((row) => ({
      x: Number(row[x]),
      y: Number(row[y]),
      c: colorField ? String(row[colorField]) : "",
      s: sync.syncField ? String(row[sync.syncField] ?? "") : null,
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (points.length === 0) return <EmptyNote message={`no numeric (${x}, ${y}) pairs`} />;

  const [xLo, xHi] = extent(points, (p) => p.x) as [number, number];
  const [yLo, yHi] = extent(points, (p) => p.y) as [number, number];
  const xs = scaleLinear({ domain: [xLo, xHi], range: [MARGIN.left, width - MARGIN.right], nice: true });
  const ys = scaleLinear({ domain: [refLine === "zero" ? Math.min(yLo, 0) : yLo, refLine === "zero" ? Math.max(yHi, 0) : yHi], range: [height - MARGIN.bottom, MARGIN.top], nice: true });

  const categories = colorField ? uniqueValues(rows, colorField).map(String) : [];
  const colorScale = scaleOrdinal({ domain: categories, range: PALETTE });
  const colorOf = (c: string) => (colorField && categories.length > 0 ? colorScale(c) : color);

  const sorted = [...points].sort((a, b) => a.x - b.x);

  return (
    <TipBox boxRef={ref} tip={tip}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${mark === "dot" ? "Scatter" : "Line"} plot of ${y} by ${x}`}
        onMouseLeave={() => {
          hide();
          if (sync.syncField) sync.setHoverValue(null);
        }}
      >
        <Frame {...props} xScale={xs} yScale={ys} />
        {refLine === "zero" && (
          <line x1={MARGIN.left} x2={width - MARGIN.right} y1={ys(0) ?? 0} y2={ys(0) ?? 0} stroke={COLORS.muted} strokeDasharray="4,4" strokeOpacity={0.7} />
        )}
        {refLine === "diagonal" && (
          <line
            x1={xs(Math.max(xLo, yLo)) ?? 0}
            y1={ys(Math.max(xLo, yLo)) ?? 0}
            x2={xs(Math.min(xHi, yHi)) ?? 0}
            y2={ys(Math.min(xHi, yHi)) ?? 0}
            stroke={COLORS.muted}
            strokeDasharray="4,4"
            strokeOpacity={0.7}
          />
        )}
        {mark === "line" &&
          (categories.length > 0 ? categories : [""]).map((category) => (
            <LinePath
              key={category || "series"}
              data={sorted.filter((p) => !category || p.c === category)}
              x={(p) => xs(p.x) ?? 0}
              y={(p) => ys(p.y) ?? 0}
              stroke={colorOf(category)}
              strokeWidth={lineWidth}
              curve={CURVES[curve] ?? curveMonotoneX}
            />
          ))}
        {mark === "dot" &&
          points.map((p, i) => (
            <Circle
              key={i}
              cx={xs(p.x) ?? 0}
              cy={ys(p.y) ?? 0}
              r={radius}
              fill={colorOf(p.c)}
              opacity={isDimmed(sync, p.s) ? DIM_OPACITY : opacity}
              stroke={stroke}
              strokeWidth={strokeWidth}
              style={{ transition: "opacity 0.15s ease" }}
              onMouseMove={(e) => {
                show(e, [
                  ...(p.c ? [p.c] : []),
                  `${x}: ${fmtVal(p.x)}`,
                  `${y}: ${fmtVal(p.y)}`,
                ]);
                if (p.s !== null) sync.setHoverValue(p.s);
              }}
            />
          ))}
      </svg>
      {categories.length > 0 && (
        <div className="kp-plot-legend">
          {categories.slice(0, 8).map((category) => (
            <span key={category} className="kp-plot-legend__item">
              <i style={{ background: colorScale(category) }} />
              {category}
            </span>
          ))}
        </div>
      )}
    </TipBox>
  );
}

/* ── Donut ──────────────────────────────────────────────────────────── */

export interface DonutPlotProps {
  rows: DataTable;
  x: string;
  y?: string;
  width: number;
  height: number;
  valueMode: "count" | "sum";
  innerRadius: number;
  padAngle: number;
  showLegend: boolean;
}

export function DonutPlot({ rows, x, y, width, height, valueMode, innerRadius, padAngle, showLegend }: DonutPlotProps) {
  const { ref, tip, show, hide } = useTip();
  const sync = useCardSync();
  const data = aggregateBy(rows, x, valueMode === "sum" ? y : undefined, valueMode === "sum" ? "sum" : "count");
  if (data.length === 0) return <EmptyNote message={`no groups in "${x}"`} />;
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const size = Math.min(height, showLegend ? width * 0.5 : width);
  const radius = size / 2 - 6;
  const colorScale = scaleOrdinal({ domain: data.map((d) => d.key), range: PALETTE });
  const syncable = sync.syncField !== null && sync.syncField === x;
  const pct = (v: number) => (total === 0 ? 0 : (v / total) * 100);

  return (
    <TipBox boxRef={ref} tip={tip}>
      <div className="kp-donut" onMouseLeave={() => { hide(); if (syncable) sync.setHoverValue(null); }}>
        <svg width={size} height={size} role="img" aria-label={`Donut chart of ${x}`}>
          <g transform={`translate(${size / 2},${size / 2})`}>
            <Pie data={data} pieValue={(d) => d.value} outerRadius={radius} innerRadius={radius * innerRadius} padAngle={padAngle}>
              {(pie) =>
                pie.arcs.map((arc) => (
                  <path
                    key={arc.data.key}
                    d={pie.path(arc) ?? ""}
                    fill={colorScale(arc.data.key)}
                    opacity={isDimmed(sync, syncable ? arc.data.key : null) ? DIM_OPACITY : 0.95}
                    style={{ cursor: syncable ? "pointer" : "default", transition: "opacity 0.15s ease" }}
                    onMouseMove={(e) => {
                      show(e, [
                        arc.data.key,
                        `${valueMode === "sum" ? `sum(${y})` : "count"}: ${fmtVal(arc.data.value)}`,
                        `${pct(arc.data.value).toFixed(1)}% of total`,
                        ...(syncable ? ["click to filter siblings"] : []),
                      ]);
                      if (syncable) sync.setHoverValue(arc.data.key);
                    }}
                    onClick={() => {
                      if (syncable) sync.setFilterValue(sync.filterValue === arc.data.key ? null : arc.data.key);
                    }}
                  />
                ))
              }
            </Pie>
          </g>
        </svg>
        {showLegend && (
          <ul className="kp-donut__legend">
            {data.map((d) => (
              <li
                key={d.key}
                className={isDimmed(sync, syncable ? d.key : null) ? "kp-donut__item kp-donut__item--dim" : "kp-donut__item"}
                onMouseEnter={() => syncable && sync.setHoverValue(d.key)}
                onClick={() => syncable && sync.setFilterValue(sync.filterValue === d.key ? null : d.key)}
                style={{ cursor: syncable ? "pointer" : "default" }}
              >
                <i style={{ background: colorScale(d.key) }} />
                <span className="kp-donut__key">{d.key}</span>
                <span className="kp-donut__pct">{pct(d.value).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </TipBox>
  );
}

/* ── Density (smoothed distribution) ────────────────────────────────── */

export interface DensityPlotProps {
  rows: DataTable;
  x: string;
  width: number;
  height: number;
  color: string;
  fillOpacity: number;
  gradient: boolean;
  smooth: number;
  showAxis: boolean;
}

function smoothCounts(counts: number[], passes: number): number[] {
  let out = counts;
  const kernel = [1, 2, 3, 2, 1];
  for (let p = 0; p < passes; p++) {
    const next = out.map((_, i) => {
      let acc = 0;
      let weight = 0;
      for (let j = -2; j <= 2; j++) {
        const v = out[i + j];
        if (v !== undefined) {
          acc += v * kernel[j + 2]!;
          weight += kernel[j + 2]!;
        }
      }
      return weight === 0 ? 0 : acc / weight;
    });
    out = next;
  }
  return out;
}

export function DensityPlot({ rows, x, width, height, color, fillOpacity, gradient, smooth, showAxis }: DensityPlotProps) {
  const gradientId = useId();
  const { ref, tip, show, hide } = useTip();
  const [marker, setMarker] = useState<{ cx: number; cy: number } | null>(null);
  const values = numeric(rows, x);
  if (values.length === 0) return <EmptyNote message={`no numeric values in "${x}"`} />;
  const [lo, hi] = extent(values) as [number, number];
  const pad = (hi - lo || 1) * 0.08;
  const buckets = bin().domain([lo - pad, hi + pad]).thresholds(40)(values);
  const counts = smoothCounts(buckets.map((b) => b.length), Math.max(0, smooth));
  const points = buckets.map((b, i) => ({ x: ((b.x0 ?? 0) + (b.x1 ?? 0)) / 2, y: counts[i] ?? 0 }));
  const bottom = height - (showAxis ? MARGIN.bottom : 8);
  const xs = scaleLinear({ domain: [lo - pad, hi + pad], range: [12, width - 12] });
  const ys = scaleLinear({ domain: [0, Math.max(...counts, 1)], range: [bottom, 10] });

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    points.forEach((p, i) => {
      const d = Math.abs((xs(p.x) ?? 0) - px);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    const p = points[best]!;
    const bucket = buckets[best];
    setMarker({ cx: xs(p.x) ?? 0, cy: ys(p.y) ?? 0 });
    show(e, [`${x} ≈ ${fmtVal(p.x)}`, `${bucket?.length ?? 0} observation${(bucket?.length ?? 0) === 1 ? "" : "s"} in bin`]);
  };

  return (
    <TipBox boxRef={ref} tip={tip}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Density of ${x}`}
        onMouseMove={onMove}
        onMouseLeave={() => {
          hide();
          setMarker(null);
        }}
      >
        {gradient && <LinearGradient id={gradientId} from={color} to={color} fromOpacity={fillOpacity} toOpacity={0.03} />}
        <AreaClosed
          data={points}
          x={(p) => xs(p.x) ?? 0}
          y={(p) => ys(p.y) ?? 0}
          yScale={ys}
          curve={curveBasis}
          fill={gradient ? `url(#${gradientId})` : color}
          fillOpacity={gradient ? 1 : fillOpacity}
          stroke={color}
          strokeWidth={1.5}
        />
        {showAxis && (
          <AxisBottom
            top={bottom}
            scale={xs}
            numTicks={5}
            stroke={COLORS.grid}
            tickStroke={COLORS.grid}
            tickLabelProps={() => ({ ...tickLabel, textAnchor: "middle" as const })}
          />
        )}
        {marker && <Circle cx={marker.cx} cy={marker.cy} r={3.5} fill={color} stroke="#fff" strokeWidth={1.2} />}
      </svg>
    </TipBox>
  );
}

/* ── Sparkline ──────────────────────────────────────────────────────── */

export function sparkPoints(values: number[], width: number, height: number, pad = 3): { x: number; y: number }[] {
  if (values.length === 0) return [];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  return values.map((v, i) => ({
    x: pad + (i / Math.max(1, values.length - 1)) * (width - 2 * pad),
    y: height - pad - ((v - lo) / span) * (height - 2 * pad),
  }));
}

export interface SparklinePlotProps {
  rows: DataTable;
  y: string;
  /** Optional x column used only for tooltip labels (e.g. a date column). */
  x?: string;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
  fillArea: boolean;
}

export function SparklinePlot({ rows, y, x, width, height, color, strokeWidth, fillArea }: SparklinePlotProps) {
  const gradientId = useId();
  const { ref, tip, show, hide } = useTip();
  const [marker, setMarker] = useState<{ cx: number; cy: number } | null>(null);
  const values = numeric(rows, y);
  if (values.length === 0) return <EmptyNote message={`no numeric values in "${y}"`} />;
  const points = sparkPoints(values, width, height);
  const ysBaseline = scaleLinear({ domain: [0, 1], range: [height - 3, 3] });

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - px);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    const p = points[best]!;
    const label = x ? fmtVal(rows[best]?.[x]) : `#${best + 1}`;
    setMarker({ cx: p.x, cy: p.y });
    show(e, [label, `${y}: ${fmtVal(values[best])}`]);
  };

  return (
    <TipBox boxRef={ref} tip={tip}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Sparkline of ${y}`}
        onMouseMove={onMove}
        onMouseLeave={() => {
          hide();
          setMarker(null);
        }}
      >
        {fillArea && <LinearGradient id={gradientId} from={color} to={color} fromOpacity={0.35} toOpacity={0.02} />}
        {fillArea && (
          <AreaClosed
            data={points}
            x={(p) => p.x}
            y={(p) => p.y}
            yScale={ysBaseline}
            curve={curveMonotoneX}
            fill={`url(#${gradientId})`}
          />
        )}
        <LinePath data={points} x={(p) => p.x} y={(p) => p.y} stroke={color} strokeWidth={strokeWidth} curve={curveMonotoneX} />
        {marker && <Circle cx={marker.cx} cy={marker.cy} r={3} fill={color} stroke="#fff" strokeWidth={1.2} />}
      </svg>
    </TipBox>
  );
}
