import type { DataTable } from "@knowledge/data";
import { summarizeBy } from "@knowledge/data";
import { sparkPoints } from "./plots";
import { isDimmed, useCardSync } from "./sync";
import { PALETTE } from "./theme";

/**
 * Aggregated per-group table (one row per encoding.x group): badge category,
 * mean / count / best of encoding.y, improvement %, and a sparkline of the
 * value sequence. Rows participate in card-scoped hover/filter sync.
 */
export interface SummaryTableProps {
  rows: DataTable;
  /** Group key column (one table row per group). */
  x: string;
  /** Numeric value column being summarized. */
  y: string;
  /** Categorical badge column (encoding.fill). */
  badgeField?: string;
  bestMode: "min" | "max";
  showBadges: boolean;
  showSparkline: boolean;
  density: "compact" | "comfortable";
  striped: boolean;
}

function badgeColor(category: string, categories: string[]): string {
  const index = Math.max(0, categories.indexOf(category));
  return PALETTE[index % PALETTE.length]!;
}

export function SummaryTable({
  rows,
  x,
  y,
  badgeField,
  bestMode,
  showBadges,
  showSparkline,
  density,
  striped,
}: SummaryTableProps) {
  const sync = useCardSync();
  const summaries = summarizeBy(rows, x, y, badgeField, bestMode);
  if (summaries.length === 0) return <div className="kp-component__note">no groups in “{x}”</div>;
  const badgeCategories = [...new Set(summaries.map((s) => s.badge).filter((b): b is string => b !== undefined))];
  // Rows participate in card sync via their own key column OR their badge
  // column (e.g. card syncs on "group", rows are athletes badged by group).
  const syncable = sync.syncField !== null && sync.syncField === x;
  const badgeSyncable = !syncable && sync.syncField !== null && sync.syncField === badgeField;
  const syncValueOf = (key: string, badge: string | undefined) =>
    syncable ? key : badgeSyncable ? (badge ?? null) : null;

  return (
    <div
      className="kp-table-wrap"
      onMouseLeave={() => (syncable || badgeSyncable) && sync.setHoverValue(null)}
    >
      <table className={`kp-table kp-table--${density} ${striped ? "kp-table--striped" : ""} kp-summary`}>
        <thead>
          <tr>
            <th>{x}</th>
            {showBadges && badgeField ? <th>{badgeField}</th> : null}
            <th className="kp-num">mean {y}</th>
            <th className="kp-num">n</th>
            <th className="kp-num">best</th>
            <th className="kp-num">improvement</th>
            {showSparkline ? <th>trend</th> : null}
          </tr>
        </thead>
        <tbody>
          {summaries.map((summary) => {
            const syncValue = syncValueOf(summary.key, summary.badge);
            const dim = isDimmed(sync, syncValue);
            const active = syncValue !== null && sync.filterValue === syncValue;
            return (
              <tr
                key={summary.key}
                className={`${dim ? "kp-summary__row--dim" : ""} ${active ? "kp-summary__row--active" : ""}`}
                style={{ cursor: syncValue !== null ? "pointer" : "default" }}
                onMouseEnter={() => syncValue !== null && sync.setHoverValue(syncValue)}
                onClick={() =>
                  syncValue !== null &&
                  sync.setFilterValue(sync.filterValue === syncValue ? null : syncValue)
                }
              >
                <td>
                  <code>{summary.key}</code>
                </td>
                {showBadges && badgeField ? (
                  <td>
                    {summary.badge ? (
                      <span
                        className="kp-badge"
                        style={{ color: badgeColor(summary.badge, badgeCategories) }}
                      >
                        <i style={{ background: badgeColor(summary.badge, badgeCategories) }} />
                        {summary.badge}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}
                <td className="kp-num">{summary.mean.toFixed(2)}</td>
                <td className="kp-num">{summary.count}</td>
                <td className="kp-num">{summary.best.toFixed(2)}</td>
                <td className={`kp-num ${summary.improvement >= 0 ? "kp-pos" : "kp-neg"}`}>
                  {summary.improvement >= 0 ? "+" : ""}
                  {summary.improvement.toFixed(1)}%
                </td>
                {showSparkline ? (
                  <td className="kp-spark-cell">
                    <RowSparkline values={summary.series} positive={summary.improvement >= 0} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowSparkline({ values, positive }: { values: number[]; positive: boolean }) {
  const width = 96;
  const height = 26;
  const points = sparkPoints(values, width, height);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const stroke = positive ? "#58c896" : "#ef6363";
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.6} />
    </svg>
  );
}
