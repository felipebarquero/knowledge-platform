import type { ConnectionConfig } from "./adapters";

/**
 * Connection registry — resolved server-side only. Credentials live here (in
 * env), NEVER in the IR/content, which only references a connection by name.
 *
 * Config via env `KP_CONNECTIONS` as JSON, e.g.:
 *   KP_CONNECTIONS='{"warehouse":{"driver":"postgres","url":"postgres://u:p@host/db"},
 *                    "metrics":{"driver":"mysql","url":"mysql://u:p@host/db"}}'
 *
 * A built-in `local` connection (sqlite over the demo CSVs) always exists so
 * the gateway runs out of the box.
 */
export function loadConnections(): Record<string, ConnectionConfig> {
  const connections: Record<string, ConnectionConfig> = {
    local: { driver: "sqlite" },
  };
  const raw = process.env.KP_CONNECTIONS;
  if (raw) {
    try {
      Object.assign(connections, JSON.parse(raw) as Record<string, ConnectionConfig>);
    } catch (error) {
      console.error("Invalid KP_CONNECTIONS JSON:", error instanceof Error ? error.message : error);
    }
  }
  return connections;
}
