import type { DataTable } from "@knowledge/data";
import { aggregateBy } from "@knowledge/data";
import { TipBox, useTip } from "./tooltip";
import { COLORS, PALETTE } from "./theme";

/**
 * Hierarchical structure diagram (Population → groups → observations), in the
 * style of mixed-model structure figures. Data-driven: groups come from the
 * encoding.x column; leaf dots are capped per group.
 */
export interface HierarchyDiagramProps {
  rows: DataTable;
  x: string;
  width: number;
  height: number;
  color: string;
  maxGroups: number;
  maxLeaves: number;
  rootLabel: string;
}

export function HierarchyDiagram({ rows, x, width, height, color, maxGroups, maxLeaves, rootLabel }: HierarchyDiagramProps) {
  const { ref, tip, show, hide } = useTip();
  const groups = aggregateBy(rows, x, undefined, "count");
  if (groups.length === 0) return <div className="kp-component__note">no groups in “{x}”</div>;

  // First N-1 groups, an ellipsis marker, then the last group (A1 A2 … A24).
  const shown: ({ key: string; value: number } | "ellipsis")[] =
    groups.length <= maxGroups
      ? groups
      : [...groups.slice(0, maxGroups - 1), "ellipsis", groups[groups.length - 1]!];

  const rootY = 34;
  const groupY = height * 0.48;
  const leafY = height * 0.82;
  const slot = width / shown.length;
  const pillWidth = Math.min(108, slot * 0.8);

  return (
    <TipBox boxRef={ref} tip={tip}>
      <svg width={width} height={height} role="img" aria-label={`Hierarchy of ${x}`} onMouseLeave={hide}>
        {/* root */}
        <g
          onMouseMove={(e) => show(e, [rootLabel, `${groups.length} groups · ${rows.length} observations`])}
        >
          <rect x={width / 2 - 56} y={rootY - 17} width={112} height={34} rx={10} fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.2)" />
          <text x={width / 2} y={rootY + 4} textAnchor="middle" fill="#eef2f8" fontSize={12} fontWeight={600}>
            {rootLabel}
          </text>
        </g>

        {shown.map((entry, i) => {
          const cx = slot * i + slot / 2;
          if (entry === "ellipsis") {
            return (
              <text key="ellipsis" x={cx} y={groupY + 5} textAnchor="middle" fill={COLORS.muted} fontSize={16}>
                ⋯
              </text>
            );
          }
          const leaves = Math.min(entry.value, maxLeaves);
          return (
            <g key={entry.key}>
              <path
                d={`M ${width / 2} ${rootY + 18} C ${width / 2} ${rootY + 48}, ${cx} ${groupY - 50}, ${cx} ${groupY - 18}`}
                fill="none"
                stroke="rgba(180,196,225,0.55)"
                strokeWidth={1.4}
              />
              <g
                style={{ cursor: "default" }}
                onMouseMove={(e) => show(e, [entry.key, `${entry.value} observation${entry.value === 1 ? "" : "s"}`])}
              >
                <rect x={cx - pillWidth / 2} y={groupY - 16} width={pillWidth} height={32} rx={9} fill="rgba(255,255,255,0.07)" stroke={color} strokeOpacity={0.55} />
                <text x={cx} y={groupY + 4} textAnchor="middle" fill="#dbe2ea" fontSize={11} fontFamily="ui-monospace, Menlo, monospace">
                  {entry.key}
                </text>
              </g>
              {Array.from({ length: leaves }).map((_, leaf) => {
                const lx = cx + (leaf - (leaves - 1) / 2) * 18;
                return (
                  <g key={leaf}>
                    <line x1={cx} y1={groupY + 16} x2={lx} y2={leafY - 8} stroke="rgba(180,196,225,0.45)" strokeWidth={1.1} />
                    <circle cx={lx} cy={leafY} r={6} fill={PALETTE[i % PALETTE.length]} opacity={0.9} />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </TipBox>
  );
}
