import type { DataTable } from "@knowledge/data";
import { columnsOf } from "@knowledge/data";

export interface TableViewProps {
  rows: DataTable;
  limit?: number;
  density?: "compact" | "comfortable";
  striped?: boolean;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

export function TableView({ rows, limit = 8, density = "compact", striped = false }: TableViewProps) {
  const columns = columnsOf(rows);
  if (columns.length === 0) return <div className="kp-component__note">empty table</div>;
  const visible = rows.slice(0, limit);
  return (
    <div className="kp-table-wrap">
      <table className={`kp-table kp-table--${density} ${striped ? "kp-table--striped" : ""}`}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr key={i}>
              {columns.map((column) => (
                <td key={column}>{formatCell(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit && (
        <div className="kp-table__more">
          {rows.length - limit} more row(s) — showing first {limit}
        </div>
      )}
    </div>
  );
}
