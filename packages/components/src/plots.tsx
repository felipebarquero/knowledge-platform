import { useEffect, useId, useMemo, useRef, useState } from "react";
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
import { Threshold } from "@visx/threshold";
import { bin, extent } from "@visx/vendor/d3-array";
import type { DataTable } from "@knowledge/data";
import { aggregateBy, uniqueValues } from "@knowledge/data";
import type { AggregateMode } from "@knowledge/data";
import { isDimmed, useCardSync } from "./sync";
import { ChartTip, TipBox, fmtVal, useTip } from "./tooltip";
import { COLORS, PALETTE } from "./theme";
import { Icon } from "./Icon";

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

/* ── Violin + Box (statistical distributions) ───────────────────────── */

interface BoxStats {
  q1: number;
  median: number;
  q3: number;
  whiskLo: number;
  whiskHi: number;
  mean: number;
  n: number;
  outliers: number[];
}

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const lo = sorted[base]!;
  const hi = sorted[base + 1];
  return hi === undefined ? lo : lo + (pos - base) * (hi - lo);
}

function boxStats(values: number[]): BoxStats {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantileSorted(sorted, 0.25);
  const median = quantileSorted(sorted, 0.5);
  const q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;
  const loFence = q1 - 1.5 * iqr;
  const hiFence = q3 + 1.5 * iqr;
  const within = sorted.filter((v) => v >= loFence && v <= hiFence);
  const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
  return {
    q1,
    median,
    q3,
    whiskLo: within.length ? within[0]! : q1,
    whiskHi: within.length ? within[within.length - 1]! : q3,
    mean,
    n: sorted.length,
    outliers: sorted.filter((v) => v < loFence || v > hiFence),
  };
}

/** Smoothed, peak-normalised density profile over a shared value domain. */
function densityProfile(values: number[], domain: [number, number], smooth: number): { v: number; d: number }[] {
  if (values.length === 0) return [];
  const buckets = bin().domain(domain).thresholds(32)(values);
  const counts = smoothCounts(
    buckets.map((b) => b.length),
    Math.max(0, smooth),
  );
  const max = Math.max(...counts, 1);
  return buckets.map((b, i) => ({ v: ((b.x0 ?? 0) + (b.x1 ?? 0)) / 2, d: (counts[i] ?? 0) / max }));
}

/** SVG path for a violin: full ("both") or a single mirrored half. */
function violinPath(
  profile: { v: number; d: number }[],
  cx: number,
  hw: number,
  y: (v: number) => number,
  side: "both" | "left" | "right",
): string {
  if (profile.length === 0) return "";
  const f = (x: number) => x.toFixed(1);
  if (side === "both") {
    const right = profile.map((p) => `${f(cx + p.d * hw)},${f(y(p.v))}`);
    const left = [...profile].reverse().map((p) => `${f(cx - p.d * hw)},${f(y(p.v))}`);
    return `M${right.join("L")}L${left.join("L")}Z`;
  }
  const sign = side === "right" ? 1 : -1;
  const edge = profile.map((p) => `${f(cx + sign * p.d * hw)},${f(y(p.v))}`);
  return `M${f(cx)},${f(y(profile[0]!.v))}L${edge.join("L")}L${f(cx)},${f(y(profile[profile.length - 1]!.v))}Z`;
}

/** Box-and-whisker glyph (quartiles, 1.5·IQR whiskers, median, mean, outliers). */
function BoxGlyph({
  cx,
  bw,
  stats,
  y,
  color,
  showMean,
  showPoints,
}: {
  cx: number;
  bw: number;
  stats: BoxStats;
  y: (v: number) => number;
  color: string;
  showMean: boolean;
  showPoints: boolean;
}) {
  const cap = bw * 0.34;
  return (
    <g>
      <line x1={cx} x2={cx} y1={y(stats.whiskLo)} y2={y(stats.whiskHi)} stroke={color} strokeWidth={1.2} />
      <line x1={cx - cap} x2={cx + cap} y1={y(stats.whiskHi)} y2={y(stats.whiskHi)} stroke={color} strokeWidth={1.2} />
      <line x1={cx - cap} x2={cx + cap} y1={y(stats.whiskLo)} y2={y(stats.whiskLo)} stroke={color} strokeWidth={1.2} />
      <rect
        x={cx - bw / 2}
        width={bw}
        y={y(stats.q3)}
        height={Math.max(1, y(stats.q1) - y(stats.q3))}
        rx={2}
        fill={color}
        fillOpacity={0.6}
        stroke={color}
        strokeWidth={1}
      />
      <line x1={cx - bw / 2} x2={cx + bw / 2} y1={y(stats.median)} y2={y(stats.median)} stroke="#fff" strokeWidth={1.6} />
      {showMean && <circle cx={cx} cy={y(stats.mean)} r={3.6} fill="#0e1116" stroke="#fff" strokeWidth={1.3} />}
      {showPoints &&
        stats.outliers.map((o, i) => (
          <circle key={i} cx={cx} cy={y(o)} r={2.6} fill="none" stroke={color} strokeWidth={1.1} opacity={0.85} />
        ))}
    </g>
  );
}

export interface DistPlotProps {
  rows: DataTable;
  x: string;
  y: string;
  fill?: string;
  width: number;
  height: number;
  split: boolean;
  showViolin: boolean;
  showBox: boolean;
  showMean: boolean;
  showPoints: boolean;
  bandwidth: number;
  fillOpacity: number;
  grid: GridMode;
  yTicks: number;
}

function DistPlot({
  rows,
  x,
  y,
  fill,
  width,
  height,
  split,
  showViolin,
  showBox,
  showMean,
  showPoints,
  bandwidth,
  fillOpacity,
  grid,
  yTicks,
}: DistPlotProps) {
  const { ref, tip, show, hide } = useTip();
  const sync = useCardSync();
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const categories = uniqueValues(rows, x).map(String);
  const groups = fill ? uniqueValues(rows, fill).map(String) : [""];
  const allValues = numeric(rows, y);
  if (categories.length === 0 || allValues.length === 0) {
    return <EmptyNote message={`violin/box needs a category (${x}) and numeric values (${y})`} />;
  }
  const [yLo, yHi] = extent(allValues) as [number, number];
  const pad = (yHi - yLo || 1) * 0.06;
  const domain: [number, number] = [yLo - pad, yHi + pad];

  const ys = scaleLinear({ domain, range: [height - MARGIN.bottom, MARGIN.top] });
  const xs = scaleBand<string>({ domain: categories, range: [MARGIN.left, width - MARGIN.right], padding: 0.35 });
  const bw = xs.bandwidth();
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const yv = (v: number) => ys(v) ?? 0;

  const valuesFor = (cat: string, group: string): number[] =>
    numeric(
      rows.filter((r) => String(r[x]) === cat && (group === "" || String(r[fill as string]) === group)),
      y,
    );

  const splitMode = split && groups.length === 2 && fill !== undefined;
  const dimmed = (key: string, group: string) =>
    (hoverKey !== null && hoverKey !== key) || (fill !== undefined && isDimmed(sync, group));

  return (
    <TipBox boxRef={ref} tip={tip}>
      <svg width={width} height={height} role="img" aria-label={`Distribution of ${y} by ${x}`} onMouseLeave={() => { hide(); setHoverKey(null); sync.setHoverValue(null); }}>
        {(grid === "rows" || grid === "both") && (
          <GridRows scale={ys} left={MARGIN.left} width={innerWidth} stroke={COLORS.grid} strokeOpacity={0.5} numTicks={yTicks} />
        )}
        {categories.map((cat) => {
          const start = xs(cat) ?? 0;
          const center = start + bw / 2;
          return groups.map((group, gi) => {
            const vals = valuesFor(cat, group);
            if (vals.length === 0) return null;
            const profile = densityProfile(vals, domain, bandwidth);
            const stats = boxStats(vals);
            const color = fill ? PALETTE[gi % PALETTE.length]! : COLORS.accent;
            const key = `${cat}::${group}`;
            let cx: number;
            let side: "both" | "left" | "right";
            let hw: number;
            let boxCx: number;
            let boxW: number;
            if (splitMode) {
              cx = center;
              side = gi === 0 ? "left" : "right";
              hw = bw * 0.46;
              boxCx = center + (gi === 0 ? -bw * 0.14 : bw * 0.14);
              boxW = bw * 0.16;
            } else {
              const subW = bw / groups.length;
              cx = start + subW * (gi + 0.5);
              side = "both";
              hw = subW * 0.42;
              boxCx = cx;
              boxW = Math.min(subW * 0.34, 16);
            }
            return (
              <g
                key={key}
                opacity={dimmed(key, group) ? DIM_OPACITY : 1}
                style={{ transition: "opacity 0.15s ease", cursor: "default" }}
                onMouseEnter={() => {
                  setHoverKey(key);
                  if (fill) sync.setHoverValue(group);
                }}
                onMouseLeave={() => {
                  setHoverKey(null);
                  sync.setHoverValue(null);
                }}
                onMouseMove={(e) =>
                  show(e, [
                    `${cat}${group ? ` · ${group}` : ""}`,
                    `n = ${stats.n} · median ${fmtVal(stats.median)}`,
                    `IQR ${fmtVal(stats.q1)}–${fmtVal(stats.q3)} · mean ${fmtVal(stats.mean)}`,
                  ])
                }
              >
                {showViolin && (
                  <path
                    d={violinPath(profile, cx, hw, yv, side)}
                    fill={color}
                    fillOpacity={fillOpacity}
                    stroke={color}
                    strokeWidth={1}
                    strokeOpacity={0.7}
                  />
                )}
                {showBox && (
                  <BoxGlyph cx={boxCx} bw={boxW} stats={stats} y={yv} color={color} showMean={showMean} showPoints={showPoints} />
                )}
              </g>
            );
          });
        })}
        <AxisLeft
          left={MARGIN.left}
          scale={ys}
          numTicks={yTicks}
          stroke={COLORS.grid}
          tickStroke={COLORS.grid}
          tickLabelProps={() => ({ ...tickLabel, textAnchor: "end" as const, dx: -4, dy: 3 })}
        />
        <line x1={MARGIN.left} x2={width - MARGIN.right} y1={height - MARGIN.bottom} y2={height - MARGIN.bottom} stroke={COLORS.grid} />
        {categories.map((cat) => (
          <text
            key={cat}
            x={(xs(cat) ?? 0) + bw / 2}
            y={height - MARGIN.bottom + 18}
            textAnchor="middle"
            fill={COLORS.muted}
            fontSize={11}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {cat}
          </text>
        ))}
        {fill &&
          groups.map((group, gi) => (
            <g key={group} transform={`translate(${width - MARGIN.right - 8}, ${MARGIN.top + 4 + gi * 16})`}>
              <rect x={-92} y={-9} width={12} height={12} rx={3} fill={PALETTE[gi % PALETTE.length]} />
              <text x={-76} y={1} fill={COLORS.text} fontSize={11} fontFamily="ui-sans-serif, system-ui, sans-serif">
                {group}
              </text>
            </g>
          ))}
      </svg>
    </TipBox>
  );
}

export type ViolinPlotProps = Omit<DistPlotProps, "showViolin" | "showBox"> & { showBox: boolean };
export function ViolinPlot(props: ViolinPlotProps) {
  return <DistPlot {...props} showViolin />;
}

export type BoxPlotProps = Omit<DistPlotProps, "showViolin" | "split" | "bandwidth" | "showBox">;
export function BoxPlot(props: BoxPlotProps) {
  return <DistPlot {...props} showViolin={false} showBox split={false} bandwidth={0} />;
}

/* ── Threshold / difference area (two series, above/below fill) ──────── */

export interface ThresholdPlotProps {
  rows: DataTable;
  x: string;
  /** First series (y0) — drawn as line 1, the reference curve. */
  y: string;
  /** Second series (y1) — drawn as line 2, the comparison curve. */
  y2: string;
  width: number;
  height: number;
  /** Fill where y > y2 (series 1 above). */
  aboveColor: string;
  aboveOpacity: number;
  /** Fill where y < y2 (series 1 below). */
  belowColor: string;
  belowOpacity: number;
  curve: CurveName;
  line1Color: string;
  line1Width: number;
  line1Dash: boolean;
  line2Color: string;
  line2Width: number;
  line2Dash: boolean;
  showLine1: boolean;
  showLine2: boolean;
  grid: GridMode;
  xTicks: number;
  yTicks: number;
}

interface TPoint {
  xv: number;
  isDate: boolean;
  raw: unknown;
  y: number;
  y2: number;
}

export function ThresholdPlot({
  rows,
  x,
  y,
  y2,
  width,
  height,
  aboveColor,
  aboveOpacity,
  belowColor,
  belowOpacity,
  curve,
  line1Color,
  line1Width,
  line1Dash,
  line2Color,
  line2Width,
  line2Dash,
  showLine1,
  showLine2,
  grid,
  xTicks,
  yTicks,
}: ThresholdPlotProps) {
  const clipId = useId();
  const { ref, tip, show, hide } = useTip();
  const [marker, setMarker] = useState<{ px: number; cy1: number; cy2: number } | null>(null);

  const points: TPoint[] = rows
    .map((r) => {
      const xRaw = r[x];
      const isDate = xRaw instanceof Date;
      const xv = isDate ? (xRaw as Date).getTime() : Number(xRaw);
      return { xv, isDate, raw: xRaw, y: Number(r[y]), y2: Number(r[y2]) };
    })
    .filter((p) => Number.isFinite(p.xv) && Number.isFinite(p.y) && Number.isFinite(p.y2))
    .sort((a, b) => a.xv - b.xv);
  if (points.length < 2) {
    return <EmptyNote message={`threshold needs x, y (${y}) and y2 (${y2}) numeric over ≥ 2 rows`} />;
  }

  const [xLo, xHi] = extent(points, (p) => p.xv) as [number, number];
  const yAll = points.flatMap((p) => [p.y, p.y2]);
  const [yLo, yHi] = extent(yAll) as [number, number];
  const yPad = (yHi - yLo || 1) * 0.06;
  const xs = scaleLinear({ domain: [xLo, xHi], range: [MARGIN.left, width - MARGIN.right] });
  const ys = scaleLinear({ domain: [yLo - yPad, yHi + yPad], range: [height - MARGIN.bottom, MARGIN.top], nice: true });
  const c = CURVES[curve];
  const px = (p: TPoint) => xs(p.xv) ?? 0;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    points.forEach((p, i) => {
      const d = Math.abs(px(p) - mx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const p = points[best]!;
    const xLabel = p.isDate ? (p.raw as Date).toLocaleDateString() : fmtVal(p.xv);
    const delta = p.y - p.y2;
    setMarker({ px: px(p), cy1: ys(p.y) ?? 0, cy2: ys(p.y2) ?? 0 });
    show(e, [
      `${x}: ${xLabel}`,
      `${y}: ${fmtVal(p.y)}`,
      `${y2}: ${fmtVal(p.y2)}`,
      `Δ ${delta >= 0 ? "+" : ""}${fmtVal(delta)}`,
    ]);
  };

  return (
    <TipBox boxRef={ref} tip={tip}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Difference between ${y} and ${y2} over ${x}`}
        onMouseMove={onMove}
        onMouseLeave={() => {
          hide();
          setMarker(null);
        }}
      >
        <Frame width={width} height={height} grid={grid} xTicks={xTicks} yTicks={yTicks} xScale={xs} yScale={ys} />
        <Threshold<TPoint>
          id={clipId}
          data={points}
          x={px}
          y0={(p) => ys(p.y) ?? 0}
          y1={(p) => ys(p.y2) ?? 0}
          clipAboveTo={MARGIN.top}
          clipBelowTo={height - MARGIN.bottom}
          curve={c}
          aboveAreaProps={{ fill: aboveColor, fillOpacity: aboveOpacity }}
          belowAreaProps={{ fill: belowColor, fillOpacity: belowOpacity }}
        />
        {showLine2 && (
          <LinePath
            data={points}
            x={px}
            y={(p) => ys(p.y2) ?? 0}
            stroke={line2Color}
            strokeWidth={line2Width}
            strokeDasharray={line2Dash ? "3 3" : undefined}
            curve={c}
          />
        )}
        {showLine1 && (
          <LinePath
            data={points}
            x={px}
            y={(p) => ys(p.y) ?? 0}
            stroke={line1Color}
            strokeWidth={line1Width}
            strokeDasharray={line1Dash ? "6 3" : undefined}
            curve={c}
          />
        )}
        {marker && (
          <>
            <line x1={marker.px} x2={marker.px} y1={MARGIN.top} y2={height - MARGIN.bottom} stroke={COLORS.grid} strokeDasharray="2 2" />
            <Circle cx={marker.px} cy={marker.cy2} r={3.4} fill={line2Color} stroke="#fff" strokeWidth={1.2} />
            <Circle cx={marker.px} cy={marker.cy1} r={3.4} fill={line1Color} stroke="#fff" strokeWidth={1.2} />
          </>
        )}
      </svg>
    </TipBox>
  );
}

/* ── Bands: glowing multi-series mean profiles + confidence bands ────── */

interface BPoint {
  x: number;
  mean: number;
  lo: number;
  hi: number;
  n: number;
}
interface BSeries {
  name: string;
  color: string;
  points: BPoint[];
}

function bandHalf(ys: number[], mean: number, band: "none" | "sd" | "se" | "ci95"): number {
  if (band === "none" || ys.length < 2) return 0;
  const variance = ys.reduce((a, b) => a + (b - mean) ** 2, 0) / (ys.length - 1);
  const sd = Math.sqrt(variance);
  if (band === "sd") return sd;
  const se = sd / Math.sqrt(ys.length);
  return band === "ci95" ? 1.96 * se : se;
}

function ribbonPath(points: BPoint[], xs: (n: number) => number, ys: (n: number) => number): string {
  if (points.length === 0) return "";
  const f = (n: number) => n.toFixed(1);
  const top = points.map((p) => `${f(xs(p.x))},${f(ys(p.hi))}`);
  const bot = [...points].reverse().map((p) => `${f(xs(p.x))},${f(ys(p.lo))}`);
  return `M${top.join("L")}L${bot.join("L")}Z`;
}

export interface BandsPlotProps {
  rows: DataTable;
  x: string;
  y: string;
  /** Series channel — one glowing line + band per category. */
  fill?: string;
  width: number;
  height: number;
  band: "none" | "sd" | "se" | "ci95";
  bandOpacity: number;
  lineWidth: number;
  glow: boolean;
  glowStrength: number;
  curve: CurveName;
  showLegend: boolean;
  showPoints: boolean;
  crosshair: boolean;
  grid: GridMode;
  xTicks: number;
  yTicks: number;
  /** Fill the confidence ribbon with a vertical luminous gradient (fan look). */
  bandGradient: boolean;
  /** Optional comma-separated colour override for the series (else PALETTE). */
  palette?: string;
  /** Optional friendly label for the x channel in the tooltip header. */
  xLabel?: string;
}

export function BandsPlot({
  rows,
  x,
  y,
  fill,
  width,
  height,
  band,
  bandOpacity,
  lineWidth,
  glow,
  glowStrength,
  curve,
  showLegend,
  showPoints,
  crosshair,
  grid,
  xTicks,
  yTicks,
  bandGradient,
  palette,
  xLabel,
}: BandsPlotProps) {
  const glowId = useId();
  const gradId = useId();
  const { ref, tip, show, hide } = useTip();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [bandsOn, setBandsOn] = useState(true);
  const [cross, setCross] = useState<{ px: number; dots: { cy: number; color: string }[] } | null>(null);

  const customColors = palette ? palette.split(",").map((s) => s.trim()).filter(Boolean) : null;
  const seriesNames = fill ? uniqueValues(rows, fill).map(String) : ["series"];
  const series: BSeries[] = seriesNames.map((name, si) => {
    const subset = fill ? rows.filter((r) => String(r[fill]) === name) : rows;
    const byX = new Map<number, number[]>();
    for (const r of subset) {
      const xv = Number(r[x]);
      const yv = Number(r[y]);
      if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
      const arr = byX.get(xv) ?? [];
      arr.push(yv);
      byX.set(xv, arr);
    }
    const points: BPoint[] = [...byX.entries()]
      .map(([xv, ys]) => {
        const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
        const half = bandHalf(ys, mean, band);
        return { x: xv, mean, lo: mean - half, hi: mean + half, n: ys.length };
      })
      .sort((a, b) => a.x - b.x);
    return { name, color: customColors?.[si] ?? PALETTE[si % PALETTE.length]!, points };
  });

  const visible = series.filter((s) => !hidden.has(s.name) && s.points.length > 0);
  const allPts = visible.flatMap((s) => s.points);
  if (allPts.length === 0) {
    return <EmptyNote message={`bands needs numeric x (${x}) and y (${y})`} />;
  }
  const [xLo, xHi] = extent(allPts, (p) => p.x) as [number, number];
  const [yLo, yHi] = extent(allPts.flatMap((p) => [p.lo, p.hi])) as [number, number];
  const yPad = (yHi - yLo || 1) * 0.06;
  const xScale = scaleLinear({ domain: [xLo, xHi], range: [MARGIN.left, width - MARGIN.right] });
  const yScale = scaleLinear({ domain: [yLo - yPad, yHi + yPad], range: [height - MARGIN.bottom, MARGIN.top], nice: true });
  const xs = (n: number) => xScale(n) ?? 0;
  const ys = (n: number) => yScale(n) ?? 0;
  const c = CURVES[curve];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dataX = xScale.invert(e.clientX - rect.left);
    const lines: string[] = [];
    const dots: { cy: number; color: string }[] = [];
    const halves: number[] = [];
    let anchorX: number | null = null;
    for (const s of visible) {
      let best = s.points[0]!;
      let bd = Number.POSITIVE_INFINITY;
      for (const p of s.points) {
        const d = Math.abs(p.x - dataX);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (anchorX === null) anchorX = best.x;
      dots.push({ cy: ys(best.mean), color: s.color });
      lines.push(`${s.name}: ${fmtVal(best.mean)}`);
      halves.push(best.hi - best.mean);
    }
    setCross({ px: xs(anchorX ?? dataX), dots });
    const tipLines = [`${xLabel ?? x}: ${fmtVal(anchorX ?? dataX)}`, ...lines];
    if (band !== "none" && bandsOn && halves.length) {
      const meanHalf = halves.reduce((a, b) => a + b, 0) / halves.length;
      const ciLabel = band === "ci95" ? "95% CI (±)" : band === "se" ? "±1 SE" : "±1 SD";
      tipLines.push(`${ciLabel}: ${fmtVal(meanHalf)}`);
    }
    show(e, tipLines);
  };

  return (
    <TipBox boxRef={ref} tip={tip}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Mean profiles of ${y} over ${x}`}
        onMouseMove={crosshair ? onMove : undefined}
        onMouseLeave={() => {
          hide();
          setCross(null);
        }}
      >
        {glow && (
          <defs>
            <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation={glowStrength} result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        )}
        {bandGradient && band !== "none" && (
          <defs>
            {visible.map((s, si) => (
              <linearGradient key={si} id={`${gradId}-${si}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={Math.min(0.85, bandOpacity * 0.5)} />
                <stop offset="50%" stopColor={s.color} stopOpacity={Math.min(0.95, bandOpacity * 2.2)} />
                <stop offset="100%" stopColor={s.color} stopOpacity={Math.min(0.85, bandOpacity * 0.5)} />
              </linearGradient>
            ))}
          </defs>
        )}
        <Frame width={width} height={height} grid={grid} xTicks={xTicks} yTicks={yTicks} xScale={xScale} yScale={yScale} />
        {band !== "none" &&
          bandsOn &&
          visible.map((s, si) => (
            <path
              key={`${s.name}-band`}
              d={ribbonPath(s.points, xs, ys)}
              fill={bandGradient ? `url(#${gradId}-${si})` : s.color}
              fillOpacity={bandGradient ? 1 : bandOpacity}
              stroke="none"
            />
          ))}
        {visible.map((s) => (
          <LinePath
            key={s.name}
            data={s.points}
            x={(p) => xs(p.x)}
            y={(p) => ys(p.mean)}
            stroke={s.color}
            strokeWidth={lineWidth}
            curve={c}
            filter={glow ? `url(#${glowId})` : undefined}
          />
        ))}
        {showPoints &&
          visible.flatMap((s) =>
            s.points.map((p, i) => (
              <Circle key={`${s.name}-${i}`} cx={xs(p.x)} cy={ys(p.mean)} r={2.4} fill={s.color} stroke="#0e1116" strokeWidth={0.8} />
            )),
          )}
        {cross && (
          <>
            <line x1={cross.px} x2={cross.px} y1={MARGIN.top} y2={height - MARGIN.bottom} stroke={COLORS.muted} strokeOpacity={0.5} strokeDasharray="3 3" />
            {cross.dots.map((d, i) => (
              <Circle key={i} cx={cross.px} cy={d.cy} r={4} fill={d.color} stroke="#fff" strokeWidth={1.4} style={{ filter: glow ? `url(#${glowId})` : undefined }} />
            ))}
          </>
        )}
      </svg>
      {showLegend && (fill || band !== "none") && (
        <div className="kp-bands__legend">
          {fill &&
            series.map((s) => {
              const off = hidden.has(s.name);
              return (
                <button
                  key={s.name}
                  type="button"
                  className={`kp-bands__legend-item ${off ? "kp-bands__legend-item--off" : ""}`}
                  onClick={() =>
                    setHidden((h) => {
                      const next = new Set(h);
                      if (next.has(s.name)) next.delete(s.name);
                      else next.add(s.name);
                      return next;
                    })
                  }
                >
                  <span
                    className="kp-bands__check"
                    style={{
                      background: off ? "transparent" : s.color,
                      borderColor: s.color,
                      boxShadow: off ? "none" : `0 0 8px ${s.color}`,
                    }}
                  >
                    {!off && (
                      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden>
                        <path d="M2.5 6.5 5 9 9.5 3.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  {s.name}
                </button>
              );
            })}
          {band !== "none" && (
            <button
              type="button"
              className={`kp-bands__legend-item ${!bandsOn ? "kp-bands__legend-item--off" : ""}`}
              onClick={() => setBandsOn((v) => !v)}
            >
              <span className="kp-bands__swatch kp-bands__swatch--ci" />
              {band === "ci95" ? "95% CI" : band === "se" ? "±1 SE" : "±1 SD"}
            </button>
          )}
        </div>
      )}
    </TipBox>
  );
}

/* ── Panels: faceted paired profiles + inset DIFF box plots + toolbar ── */

const PANEL_MARGIN = { top: 30, right: 14, bottom: 26, left: 40 };
const PANEL_LABELS = "ABCDEFGHIJKL";

interface PanelSeries {
  name: string;
  pts: { x: number; mean: number; lo: number; hi: number }[];
  meanAt: Map<number, number>;
}
interface PanelInset {
  metric: string;
  stats: BoxStats;
  sig: boolean;
}
interface PanelDatum {
  key: string;
  color: string;
  series: PanelSeries[];
  xs: number[];
  insets: PanelInset[];
}

function ci95ExcludesZero(values: number[]): boolean {
  if (values.length < 2) return false;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  const se = Math.sqrt(variance) / Math.sqrt(values.length);
  return Math.abs(mean) > 1.96 * se;
}

function niceTop(maxAbs: number): number {
  const steps = [0.1, 0.2, 0.3, 0.5, 1, 2, 5];
  for (const s of steps) if (maxAbs <= s) return s;
  return Math.ceil(maxAbs);
}

function clampDomain(lo: number, hi: number, fLo: number, fHi: number): [number, number] {
  let span = hi - lo;
  const fSpan = fHi - fLo;
  if (span >= fSpan) return [fLo, fHi];
  if (span < fSpan * 0.04) span = fSpan * 0.04;
  let nlo = lo;
  let nhi = lo + span;
  if (nlo < fLo) {
    nlo = fLo;
    nhi = fLo + span;
  }
  if (nhi > fHi) {
    nhi = fHi;
    nlo = fHi - span;
  }
  return [nlo, nhi];
}

export interface PanelsPlotProps {
  rows: DataTable;
  x: string;
  y: string;
  seriesField?: string;
  facetField: string;
  insetRows?: DataTable;
  insetPanelField: string;
  insetMetricField: string;
  insetValueField: string;
  perPanelHeight: number;
  initialCols: number;
  solidSeries: string;
  band: "none" | "sd" | "se" | "ci95";
  bandOpacity: number;
  lineWidth: number;
  glow: boolean;
  glowStrength: number;
  curve: CurveName;
  showInset: boolean;
  showLegend: boolean;
  crosshair: boolean;
  toolbar: boolean;
  grid: GridMode;
  yTicks: number;
  /** Optional comma-separated colour override for the panels (else PALETTE). */
  palette?: string;
}

export function PanelsPlot(props: PanelsPlotProps) {
  const {
    rows,
    x,
    y,
    seriesField,
    facetField,
    insetRows,
    insetPanelField,
    insetMetricField,
    insetValueField,
    perPanelHeight,
    initialCols,
    solidSeries,
    band,
    bandOpacity,
    lineWidth,
    glow,
    glowStrength,
    curve,
    showInset,
    showLegend,
    crosshair,
    toolbar,
    grid,
    yTicks,
    palette,
  } = props;

  const customColors = palette ? palette.split(",").map((s) => s.trim()).filter(Boolean) : null;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  const [cols, setCols] = useState(Math.max(1, Math.min(3, initialCols)));
  const [interact, setInteract] = useState(true);
  const [mode, setMode] = useState<"none" | "pan" | "zoom">("none");
  const [xDomain, setXDomain] = useState<[number, number] | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [brush, setBrush] = useState<{ panel: string; a: number; b: number } | null>(null);
  const glowId = useId();
  const { ref: tipRef, tip, show, hide } = useTip();
  const drag = useRef<{
    kind: "pan" | "zoom";
    panel: string;
    left: number;
    width: number;
    lo: number;
    hi: number;
    startData: number;
    startLocal: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width ?? 0;
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const orderedSeries = useMemo(() => {
    if (!seriesField) return ["series"];
    const all = uniqueValues(rows, seriesField).map(String);
    const solidFirst = all.filter((s) => s === solidSeries);
    const rest = all.filter((s) => s !== solidSeries);
    return [...solidFirst, ...rest];
  }, [rows, seriesField, solidSeries]);

  const panels = useMemo<PanelDatum[]>(() => {
    const facets = uniqueValues(rows, facetField).map(String);
    const insetByPanel = new Map<string, Map<string, number[]>>();
    if (insetRows) {
      for (const r of insetRows) {
        const p = String(r[insetPanelField]);
        const m = String(r[insetMetricField]);
        const v = Number(r[insetValueField]);
        if (!Number.isFinite(v)) continue;
        const byM = insetByPanel.get(p) ?? new Map<string, number[]>();
        const arr = byM.get(m) ?? [];
        arr.push(v);
        byM.set(m, arr);
        insetByPanel.set(p, byM);
      }
    }
    return facets.map((key, fi) => {
      const facetRows = rows.filter((r) => String(r[facetField]) === key);
      const series: PanelSeries[] = orderedSeries.map((sname) => {
        const subset = seriesField ? facetRows.filter((r) => String(r[seriesField]) === sname) : facetRows;
        const byX = new Map<number, number[]>();
        for (const r of subset) {
          const xv = Number(r[x]);
          const yv = Number(r[y]);
          if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
          const arr = byX.get(xv) ?? [];
          arr.push(yv);
          byX.set(xv, arr);
        }
        const meanAt = new Map<number, number>();
        const pts = [...byX.entries()]
          .map(([xv, ys]) => {
            const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
            const half = bandHalf(ys, mean, band);
            meanAt.set(xv, mean);
            return { x: xv, mean, lo: mean - half, hi: mean + half };
          })
          .sort((a, b) => a.x - b.x);
        return { name: sname, pts, meanAt };
      });
      const xs = [...new Set(series.flatMap((s) => s.pts.map((p) => p.x)))].sort((a, b) => a - b);
      const byM = insetByPanel.get(key);
      const insets: PanelInset[] = byM
        ? [...byM.entries()].map(([metric, vals]) => ({
            metric,
            stats: boxStats(vals),
            sig: ci95ExcludesZero(vals),
          }))
        : [];
      return { key, color: customColors?.[fi] ?? PALETTE[fi % PALETTE.length]!, series, xs, insets };
    });
  }, [rows, facetField, orderedSeries, seriesField, x, y, band, insetRows, insetPanelField, insetMetricField, insetValueField, palette]);

  const fullX = useMemo<[number, number]>(() => {
    const all = panels.flatMap((p) => p.xs);
    return all.length ? [Math.min(...all), Math.max(...all)] : [0, 1];
  }, [panels]);
  const fullY = useMemo<[number, number]>(() => {
    const vals = panels.flatMap((p) => p.series.flatMap((s) => s.pts.flatMap((pt) => [pt.lo, pt.hi])));
    if (!vals.length) return [0, 1];
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo || 1) * 0.08;
    return [lo - pad, hi + pad];
  }, [panels]);
  const insetTop = useMemo(() => {
    const maxAbs = Math.max(
      0.05,
      ...panels.flatMap((p) => p.insets.flatMap((i) => [Math.abs(i.stats.whiskLo), Math.abs(i.stats.whiskHi), ...i.stats.outliers.map(Math.abs)])),
    );
    return niceTop(maxAbs);
  }, [panels]);

  const curX = xDomain ?? fullX;
  const gap = 14;
  const panelW = cols > 0 && w > 0 ? Math.max(220, (w - gap * (cols - 1)) / cols) : 0;
  const panelH = perPanelHeight;
  const c = CURVES[curve];

  const resetView = () => {
    setXDomain(null);
    setMode("none");
    setBrush(null);
  };

  const exportCsv = () => {
    if (typeof document === "undefined") return;
    const cols2 = [x, y, ...(seriesField ? [seriesField] : []), facetField];
    const head = cols2.join(",");
    const lines = rows.map((r) => cols2.map((col) => String(r[col] ?? "")).join(","));
    const blob = new Blob([[head, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "panels_data.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderPanel = (panel: PanelDatum, idx: number) => {
    const innerL = PANEL_MARGIN.left;
    const innerR = panelW - PANEL_MARGIN.right;
    const innerT = PANEL_MARGIN.top;
    const innerB = panelH - PANEL_MARGIN.bottom;
    const innerW = innerR - innerL;
    const innerH = innerB - innerT;
    const xScale = scaleLinear({ domain: curX, range: [innerL, innerR] });
    const yScale = scaleLinear({ domain: fullY, range: [innerB, innerT] });
    const xs = (n: number) => xScale(n) ?? 0;
    const ys = (n: number) => yScale(n) ?? 0;
    const inDomain = (n: number) => n >= curX[0] - 1e-9 && n <= curX[1] + 1e-9;

    const dataAt = (local: number) => curX[0] + (local / innerW) * (curX[1] - curX[0]);
    const nearestX = (dx: number) => {
      let best = panel.xs[0] ?? dx;
      let bd = Number.POSITIVE_INFINITY;
      for (const xv of panel.xs) {
        if (!inDomain(xv)) continue;
        const d = Math.abs(xv - dx);
        if (d < bd) {
          bd = d;
          best = xv;
        }
      }
      return best;
    };

    const onDown = (e: React.PointerEvent<SVGRectElement>) => {
      if (!interact || mode === "none") return;
      const box = e.currentTarget.getBoundingClientRect();
      const local = Math.max(0, Math.min(innerW, e.clientX - box.left));
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { kind: mode, panel: panel.key, left: box.left, width: innerW, lo: curX[0], hi: curX[1], startData: dataAt(local), startLocal: local, moved: false };
      if (mode === "zoom") setBrush({ panel: panel.key, a: local, b: local });
    };
    const onMoveRect = (e: React.PointerEvent<SVGRectElement>) => {
      const box = e.currentTarget.getBoundingClientRect();
      const local = Math.max(0, Math.min(innerW, e.clientX - box.left));
      const d = drag.current;
      if (d) {
        if (Math.abs(local - d.startLocal) > 3) d.moved = true;
        if (d.kind === "pan") {
          const cursorData = d.lo + (local / d.width) * (d.hi - d.lo);
          const delta = d.startData - cursorData;
          setXDomain(clampDomain(d.lo + delta, d.hi + delta, fullX[0], fullX[1]));
        } else {
          setBrush({ panel: d.panel, a: d.startLocal, b: local });
        }
        return;
      }
      if (!interact || !crosshair) return;
      const snap = nearestX(dataAt(local));
      setHoverX(snap);
      const lines = panel.series.map((s) => {
        const mv = s.meanAt.get(snap);
        return `${s.name}: ${x} ${fmtVal(snap)} → ${mv === undefined ? "—" : fmtVal(mv)} m/s`;
      });
      show(e, [prettyLabel(panel.key), ...lines]);
    };
    const onUp = (e: React.PointerEvent<SVGRectElement>) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (d.kind === "zoom") {
        const box = e.currentTarget.getBoundingClientRect();
        const local = Math.max(0, Math.min(innerW, e.clientX - box.left));
        const a = Math.min(d.startLocal, local);
        const b = Math.max(d.startLocal, local);
        if (b - a > 6) {
          setXDomain(clampDomain(dataAt(a), dataAt(b), fullX[0], fullX[1]));
        } else {
          const center = dataAt(d.startLocal);
          const span = (curX[1] - curX[0]) * 0.6;
          setXDomain(clampDomain(center - span / 2, center + span / 2, fullX[0], fullX[1]));
        }
        setBrush(null);
      }
    };

    const pGlow = `${glowId}-${idx}`;
    const yticks = yScale.ticks(yTicks);
    const xticks = xScale.ticks(3);

    // Inset geometry (centre-right of the panel, overlapping the curves).
    const iw = innerW * 0.5;
    const ih = innerH * 0.46;
    const ix = innerL + innerW * 0.45;
    const iy = innerT + innerH * 0.18;
    const iAxisX = ix + 22;
    const iScaleY = scaleLinear({ domain: [-insetTop * 1.18, insetTop * 1.18], range: [iy + ih, iy] });
    const iBand = scaleBand<string>({ domain: panel.insets.map((m) => m.metric), range: [iAxisX, ix + iw], padding: 0.45 });
    const iy0 = iScaleY(0) ?? 0;

    return (
      <div className="kp-panels__cell" key={panel.key}>
        <svg width={panelW} height={panelH} role="img" aria-label={`${panel.key} profile`}>
          {glow && (
            <defs>
              <filter id={pGlow} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation={glowStrength} result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
          )}
          {/* frame */}
          <g pointerEvents="none">
            {(grid === "rows" || grid === "both") &&
              yticks.map((t) => (
                <line key={`gr${t}`} x1={innerL} x2={innerR} y1={ys(t)} y2={ys(t)} stroke={COLORS.grid} strokeOpacity={0.45} />
              ))}
            {fullY[0] < 0 && fullY[1] > 0 && (
              <line x1={innerL} x2={innerR} y1={ys(0)} y2={ys(0)} stroke={COLORS.muted} strokeOpacity={0.5} strokeDasharray="3 3" />
            )}
            <line x1={innerL} x2={innerL} y1={innerT} y2={innerB} stroke={COLORS.grid} />
            <line x1={innerL} x2={innerR} y1={innerB} y2={innerB} stroke={COLORS.grid} />
            {yticks.map((t) => (
              <text key={`yt${t}`} x={innerL - 6} y={ys(t)} textAnchor="end" dominantBaseline="middle" fontSize={9} fontFamily="ui-monospace, monospace" fill={COLORS.muted}>
                {t}
              </text>
            ))}
            {xticks.map((t) => (
              <text key={`xt${t}`} x={xs(t)} y={innerB + 14} textAnchor="middle" fontSize={9} fontFamily="ui-monospace, monospace" fill={COLORS.muted}>
                {t}
              </text>
            ))}
          </g>
          {/* ribbons */}
          {band !== "none" &&
            panel.series.map((s) => (
              <path key={`${s.name}-band`} d={ribbonPath(s.pts.map((p) => ({ x: p.x, mean: p.mean, lo: p.lo, hi: p.hi, n: 0 })), xs, ys)} fill={panel.color} fillOpacity={bandOpacity} stroke="none" pointerEvents="none" />
            ))}
          {/* lines */}
          {panel.series.map((s, si) => (
            <LinePath
              key={s.name}
              data={s.pts.filter((p) => inDomain(p.x))}
              x={(p) => xs(p.x)}
              y={(p) => ys(p.mean)}
              stroke={panel.color}
              strokeWidth={lineWidth}
              strokeDasharray={si === 0 ? undefined : "5 4"}
              curve={c}
              filter={glow ? `url(#${pGlow})` : undefined}
              pointerEvents="none"
            />
          ))}
          {/* crosshair */}
          {hoverX !== null && inDomain(hoverX) && (
            <g pointerEvents="none">
              <line x1={xs(hoverX)} x2={xs(hoverX)} y1={innerT} y2={innerB} stroke={COLORS.muted} strokeOpacity={0.5} strokeDasharray="3 3" />
              {panel.series.map((s, si) => {
                const mv = s.meanAt.get(hoverX);
                if (mv === undefined) return null;
                return si === 0 ? (
                  <Circle key={s.name} cx={xs(hoverX)} cy={ys(mv)} r={4} fill={panel.color} stroke="#fff" strokeWidth={1.4} style={{ filter: glow ? `url(#${pGlow})` : undefined }} />
                ) : (
                  <Circle key={s.name} cx={xs(hoverX)} cy={ys(mv)} r={3.6} fill="#0e1116" stroke={panel.color} strokeWidth={1.6} />
                );
              })}
            </g>
          )}
          {/* inset DIFF box plots */}
          {showInset && panel.insets.length > 0 && (
            <g pointerEvents="none">
              <line x1={iAxisX} x2={ix + iw} y1={iy0} y2={iy0} stroke={COLORS.muted} strokeOpacity={0.6} strokeDasharray="2 3" />
              {[-insetTop, 0, insetTop].map((t) => (
                <g key={`it${t}`}>
                  <text x={iAxisX - 5} y={iScaleY(t)} textAnchor="end" dominantBaseline="middle" fontSize={8} fontFamily="ui-monospace, monospace" fill={COLORS.muted}>
                    {t.toFixed(1)}
                  </text>
                </g>
              ))}
              <text transform={`translate(${ix + 2}, ${iy + ih / 2}) rotate(-90)`} textAnchor="middle" fontSize={8} fontFamily="ui-monospace, monospace" fill={COLORS.muted}>
                DIFF (m/s)
              </text>
              {panel.insets.map((m) => {
                const cx = (iBand(m.metric) ?? 0) + iBand.bandwidth() / 2;
                const bw = Math.min(16, iBand.bandwidth());
                return (
                  <g key={m.metric}>
                    <BoxGlyph cx={cx} bw={bw} stats={m.stats} y={(v) => iScaleY(v) ?? 0} color={panel.color} showMean showPoints={false} />
                    {m.sig && (
                      <text x={cx} y={iScaleY(Math.max(m.stats.whiskHi, 0)) - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill={COLORS.text}>
                        *
                      </text>
                    )}
                    <text x={cx} y={iy + ih + 10} textAnchor="middle" fontSize={8} fontFamily="ui-monospace, monospace" fill={COLORS.muted}>
                      {m.metric}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
          {/* brush */}
          {brush && brush.panel === panel.key && (
            <rect x={innerL + Math.min(brush.a, brush.b)} y={innerT} width={Math.abs(brush.b - brush.a)} height={innerH} fill={panel.color} fillOpacity={0.14} stroke={panel.color} strokeOpacity={0.5} pointerEvents="none" />
          )}
          {/* labels */}
          <g pointerEvents="none">
            <rect x={innerL} y={8} width={16} height={16} rx={4} fill="rgba(255,255,255,0.06)" stroke={COLORS.grid} />
            <text x={innerL + 8} y={16} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={700} fill={COLORS.text}>
              {PANEL_LABELS[idx] ?? "?"}
            </text>
            <text x={(innerL + innerR) / 2} y={17} textAnchor="middle" fontSize={12} fontWeight={600} fill={COLORS.text}>
              {prettyLabel(panel.key)}
            </text>
          </g>
          {/* pointer overlay (topmost) */}
          <rect
            x={innerL}
            y={innerT}
            width={innerW}
            height={innerH}
            fill="transparent"
            style={{ cursor: !interact ? "default" : mode === "pan" ? "grab" : mode === "zoom" ? "crosshair" : "default", touchAction: "none" }}
            onPointerDown={onDown}
            onPointerMove={onMoveRect}
            onPointerUp={onUp}
            onPointerLeave={() => {
              if (!drag.current) {
                setHoverX(null);
                hide();
              }
            }}
          />
        </svg>
      </div>
    );
  };

  const tbtn = (active: boolean) => `kp-panels__btn${active ? " kp-panels__btn--on" : ""}`;

  return (
    <div className="kp-panels" ref={tipRef}>
      {toolbar && (
        <div className="kp-panels__bar">
          <div className="kp-panels__group">
            <button type="button" className={`kp-panels__toggle${interact ? " kp-panels__toggle--on" : ""}`} onClick={() => setInteract((v) => !v)}>
              <Icon icon="lucide:mouse-pointer-2" size={15} /> Interact
            </button>
            <button type="button" className={tbtn(mode === "pan")} onClick={() => setMode((m) => (m === "pan" ? "none" : "pan"))} disabled={!interact}>
              <Icon icon="lucide:hand" size={15} /> Pan
            </button>
            <button type="button" className={tbtn(mode === "zoom")} onClick={() => setMode((m) => (m === "zoom" ? "none" : "zoom"))} disabled={!interact}>
              <Icon icon="lucide:search" size={15} /> Zoom
            </button>
            <button type="button" className={tbtn(false)} onClick={resetView}>
              <Icon icon="lucide:rotate-ccw" size={15} /> Reset
            </button>
          </div>
          <div className="kp-panels__group">
            <span className="kp-panels__label">View</span>
            <button type="button" className={tbtn(cols === 1)} onClick={() => setCols(1)} aria-label="One column" title="Single column">
              <Icon icon="lucide:square" size={15} />
            </button>
            <button type="button" className={tbtn(cols === 2)} onClick={() => setCols(2)} aria-label="Two columns" title="Two columns">
              <Icon icon="lucide:layout-grid" size={15} />
            </button>
            <button type="button" className={tbtn(false)} onClick={exportCsv}>
              <Icon icon="lucide:download" size={15} /> Export
            </button>
          </div>
        </div>
      )}
      {showLegend && seriesField && (
        <div className="kp-panels__legend">
          {orderedSeries.map((s, si) => (
            <span key={s} className="kp-panels__legend-item">
              <svg width={22} height={8}>
                <line x1={1} x2={21} y1={4} y2={4} stroke={COLORS.text} strokeWidth={2} strokeDasharray={si === 0 ? undefined : "4 3"} />
              </svg>
              {s}
            </span>
          ))}
        </div>
      )}
      <div className="kp-panels__grid" ref={wrapRef} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gap }}>
        {panelW > 0 && panels.map((p, i) => renderPanel(p, i))}
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}

function prettyLabel(value: string): string {
  return value.replace(/_/g, " ");
}
