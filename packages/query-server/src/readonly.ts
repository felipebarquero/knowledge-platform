/**
 * Read-only SQL guard for the query gateway. A defence-in-depth check: the
 * statement must be a single SELECT/WITH read. Production deployments should
 * ALSO use a read-only database role — this guard is the first line, not the
 * only one.
 */

const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|GRANT|REVOKE|ATTACH|DETACH|PRAGMA|VACUUM|COPY|MERGE|CALL|EXEC|EXECUTE|INTO\s+OUTFILE|LOAD\s+DATA)\b/i;

export function assertReadOnly(sql: string): void {
  // Strip line + block comments before inspecting.
  const stripped = sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim()
    .replace(/;\s*$/, "");

  if (stripped.length === 0) throw new Error("Empty query");
  if (stripped.includes(";")) throw new Error("Only a single statement is allowed");

  const firstWord = stripped.match(/^[A-Za-z]+/)?.[0]?.toUpperCase();
  if (firstWord !== "SELECT" && firstWord !== "WITH") {
    throw new Error(`Only SELECT/WITH queries are allowed (got "${firstWord ?? "?"}")`);
  }
  if (FORBIDDEN.test(stripped)) {
    throw new Error("Query contains a write/DDL keyword — the gateway is read-only");
  }
}
