import type { DataTable } from "./index";

/**
 * Static SQL engine (Phase 4 preview of the Phase 5 data layer).
 *
 * Runs a deliberately small, well-defined SQL subset over in-memory tables:
 *
 *   SELECT col | AGG(col | *) [AS alias] [, ...] | *
 *   FROM <dataset>
 *   [WHERE cond {AND|OR cond}]      cond: col op value | col BETWEEN a AND b
 *   [GROUP BY col]                  op: = != <> < <= > >=
 *   [ORDER BY col [ASC|DESC]]       AGG: AVG MIN MAX SUM COUNT
 *   [LIMIT n]
 *
 * Anything outside the subset (JOIN, HAVING, subqueries, …) raises a clear
 * SqlError — the full engine (DuckDB-WASM / live connectors) is Phase 5.
 * Zero dependencies and pure: (query, tables) → result.
 */

export class SqlError extends Error {}

export interface SqlResult {
  columns: string[];
  rows: DataTable;
  /** Row count before LIMIT. */
  total: number;
}

/* ── Tokenizer ──────────────────────────────────────────────────────── */

interface Token {
  kind: "ident" | "num" | "str" | "op" | "punct" | "star";
  value: string;
}

const TOKEN_RE = /('[^']*'|"[^"]*")|(\d+(?:\.\d+)?)|([A-Za-z_]\w*)|(<=|>=|!=|<>|[=<>])|([(),])|(\*)|(\S)/g;

function tokenize(query: string): Token[] {
  // Strip line comments and an optional trailing statement terminator.
  const source = query.replace(/--[^\n]*/g, " ").replace(/;\s*$/, " ");
  const tokens: Token[] = [];
  for (const match of source.matchAll(TOKEN_RE)) {
    if (match[1] !== undefined) tokens.push({ kind: "str", value: match[1].slice(1, -1) });
    else if (match[2] !== undefined) tokens.push({ kind: "num", value: match[2] });
    else if (match[3] !== undefined) tokens.push({ kind: "ident", value: match[3] });
    else if (match[4] !== undefined) tokens.push({ kind: "op", value: match[4] });
    else if (match[5] !== undefined) tokens.push({ kind: "punct", value: match[5] });
    else if (match[6] !== undefined) tokens.push({ kind: "star", value: "*" });
    else if (match[7] !== undefined) throw new SqlError(`Unexpected character "${match[7]}"`);
  }
  return tokens;
}

/* ── Parser (recursive descent over the subset) ─────────────────────── */

const AGGREGATES = new Set(["AVG", "MIN", "MAX", "SUM", "COUNT"]);
const UNSUPPORTED = new Set(["JOIN", "HAVING", "UNION", "INSERT", "UPDATE", "DELETE", "WITH", "DISTINCT", "OFFSET"]);

type SelectItem =
  | { kind: "all" }
  | { kind: "col"; name: string; alias: string }
  | { kind: "agg"; fn: string; arg: string; alias: string };

type Cond =
  | { type: "cmp"; col: string; op: string; value: string | number }
  | { type: "between"; col: string; lo: number; hi: number }
  | { type: "bool"; combinator: "AND" | "OR"; left: Cond; right: Cond };

interface Query {
  select: SelectItem[];
  from: string;
  where?: Cond;
  groupBy?: string;
  orderBy?: { col: string; desc: boolean };
  limit?: number;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const token = this.tokens[this.pos++];
    if (!token) throw new SqlError("Unexpected end of query");
    return token;
  }

  private isKeyword(word: string): boolean {
    const token = this.peek();
    return token?.kind === "ident" && token.value.toUpperCase() === word;
  }

  private expectKeyword(word: string): void {
    if (!this.isKeyword(word)) {
      throw new SqlError(`Expected ${word}${this.peek() ? ` near "${this.peek()!.value}"` : ""}`);
    }
    this.pos += 1;
  }

  private guardUnsupported(): void {
    const token = this.peek();
    if (token?.kind === "ident" && UNSUPPORTED.has(token.value.toUpperCase())) {
      throw new SqlError(
        `${token.value.toUpperCase()} is not supported by the static engine — the full engine arrives with Phase 5 connectors`,
      );
    }
  }

  parse(): Query {
    this.expectKeyword("SELECT");
    const select = this.parseSelectList();
    this.expectKeyword("FROM");
    const from = this.next().value;
    const query: Query = { select, from };

    while (this.peek()) {
      this.guardUnsupported();
      if (this.isKeyword("WHERE")) {
        this.pos += 1;
        query.where = this.parseCondition();
      } else if (this.isKeyword("GROUP")) {
        this.pos += 1;
        this.expectKeyword("BY");
        query.groupBy = this.next().value;
      } else if (this.isKeyword("ORDER")) {
        this.pos += 1;
        this.expectKeyword("BY");
        const col = this.next().value;
        let desc = false;
        if (this.isKeyword("ASC")) this.pos += 1;
        else if (this.isKeyword("DESC")) {
          this.pos += 1;
          desc = true;
        }
        query.orderBy = { col, desc };
      } else if (this.isKeyword("LIMIT")) {
        this.pos += 1;
        query.limit = Number(this.next().value);
      } else {
        throw new SqlError(`Unexpected token "${this.peek()!.value}"`);
      }
    }
    return query;
  }

  private parseSelectList(): SelectItem[] {
    const items: SelectItem[] = [];
    for (;;) {
      this.guardUnsupported();
      const token = this.next();
      if (token.kind === "star") {
        items.push({ kind: "all" });
      } else if (token.kind === "ident" && AGGREGATES.has(token.value.toUpperCase()) && this.peek()?.value === "(") {
        const fn = token.value.toUpperCase();
        this.next(); // (
        const arg = this.next();
        if (this.next().value !== ")") throw new SqlError(`Expected ) after ${fn}(`);
        const alias = this.parseAlias() ?? `${fn.toLowerCase()}_${arg.value === "*" ? "all" : arg.value}`;
        items.push({ kind: "agg", fn, arg: arg.value, alias });
      } else if (token.kind === "ident") {
        const alias = this.parseAlias() ?? token.value;
        items.push({ kind: "col", name: token.value, alias });
      } else {
        throw new SqlError(`Unexpected "${token.value}" in SELECT list`);
      }
      if (this.peek()?.value === ",") this.pos += 1;
      else break;
    }
    return items;
  }

  private parseAlias(): string | undefined {
    if (this.isKeyword("AS")) {
      this.pos += 1;
      return this.next().value;
    }
    return undefined;
  }

  /** OR-of-ANDs with standard precedence (AND binds tighter). */
  private parseCondition(): Cond {
    let left = this.parseAndChain();
    while (this.isKeyword("OR")) {
      this.pos += 1;
      left = { type: "bool", combinator: "OR", left, right: this.parseAndChain() };
    }
    return left;
  }

  private parseAndChain(): Cond {
    let left = this.parseComparison();
    while (this.isKeyword("AND")) {
      this.pos += 1;
      left = { type: "bool", combinator: "AND", left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): Cond {
    const col = this.next().value;
    if (this.isKeyword("BETWEEN")) {
      this.pos += 1;
      const lo = Number(this.next().value);
      this.expectKeyword("AND");
      const hi = Number(this.next().value);
      return { type: "between", col, lo, hi };
    }
    const op = this.next();
    if (op.kind !== "op") throw new SqlError(`Expected comparison operator after "${col}"`);
    const value = this.next();
    return {
      type: "cmp",
      col,
      op: op.value === "<>" ? "!=" : op.value,
      value: value.kind === "num" ? Number(value.value) : value.value,
    };
  }
}

/* ── Executor ───────────────────────────────────────────────────────── */

function assertColumn(table: DataTable, col: string, context: string): void {
  if (table.length > 0 && !(col in table[0]!)) {
    throw new SqlError(`Unknown column "${col}" in ${context} — available: ${Object.keys(table[0]!).join(", ")}`);
  }
}

function matches(row: Record<string, unknown>, cond: Cond): boolean {
  switch (cond.type) {
    case "bool":
      return cond.combinator === "AND"
        ? matches(row, cond.left) && matches(row, cond.right)
        : matches(row, cond.left) || matches(row, cond.right);
    case "between": {
      const value = Number(row[cond.col]);
      return Number.isFinite(value) && value >= cond.lo && value <= cond.hi;
    }
    case "cmp": {
      const cell = row[cond.col];
      if (typeof cond.value === "number") {
        const value = Number(cell);
        if (!Number.isFinite(value)) return false;
        switch (cond.op) {
          case "=": return value === cond.value;
          case "!=": return value !== cond.value;
          case "<": return value < cond.value;
          case "<=": return value <= cond.value;
          case ">": return value > cond.value;
          case ">=": return value >= cond.value;
        }
      }
      const text = String(cell);
      const target = String(cond.value);
      switch (cond.op) {
        case "=": return text === target;
        case "!=": return text !== target;
        case "<": return text < target;
        case "<=": return text <= target;
        case ">": return text > target;
        case ">=": return text >= target;
      }
      return false;
    }
  }
}

function aggregate(fn: string, values: number[], rowCount: number): number {
  switch (fn) {
    case "COUNT": return rowCount;
    case "SUM": return values.reduce((a, b) => a + b, 0);
    case "AVG": return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
    case "MIN": return Math.min(...values);
    case "MAX": return Math.max(...values);
    default: throw new SqlError(`Unknown aggregate ${fn}`);
  }
}

export function runSql(query: string, tables: Record<string, DataTable>): SqlResult {
  const parsed = new Parser(tokenize(query)).parse();

  const tableName =
    Object.keys(tables).find((name) => name === parsed.from) ??
    Object.keys(tables).find((name) => name.toLowerCase() === parsed.from.toLowerCase());
  if (!tableName) {
    throw new SqlError(`Unknown table "${parsed.from}" — available: ${Object.keys(tables).join(", ") || "none"}`);
  }
  const table = tables[tableName]!;

  let rows = table;
  if (parsed.where) rows = rows.filter((row) => matches(row, parsed.where!));

  const hasAggregates = parsed.select.some((item) => item.kind === "agg");
  let output: DataTable;

  if (parsed.groupBy || hasAggregates) {
    if (parsed.groupBy) assertColumn(table, parsed.groupBy, "GROUP BY");
    const groups = new Map<string, DataTable>();
    for (const row of rows) {
      const key = parsed.groupBy ? String(row[parsed.groupBy]) : "__all__";
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    output = [...groups.values()].map((groupRows) => {
      const out: Record<string, unknown> = {};
      for (const item of parsed.select) {
        if (item.kind === "all") throw new SqlError("SELECT * cannot be combined with GROUP BY/aggregates");
        if (item.kind === "col") {
          if (item.name !== parsed.groupBy) {
            throw new SqlError(`Column "${item.name}" must appear in GROUP BY or inside an aggregate`);
          }
          out[item.alias] = groupRows[0]?.[item.name];
        } else {
          if (item.arg !== "*") assertColumn(table, item.arg, `${item.fn}()`);
          const values =
            item.arg === "*" ? [] : groupRows.map((r) => Number(r[item.arg])).filter(Number.isFinite);
          out[item.alias] = aggregate(item.fn, values, groupRows.length);
        }
      }
      return out;
    });
  } else if (parsed.select.some((item) => item.kind === "all")) {
    output = rows.map((row) => ({ ...row }));
  } else {
    for (const item of parsed.select) {
      if (item.kind === "col") assertColumn(table, item.name, "SELECT");
    }
    output = rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const item of parsed.select) {
        if (item.kind === "col") out[item.alias] = row[item.name];
      }
      return out;
    });
  }

  if (parsed.orderBy) {
    const { col, desc } = parsed.orderBy;
    if (output.length > 0 && !(col in output[0]!)) {
      throw new SqlError(`ORDER BY "${col}" is not in the result columns: ${Object.keys(output[0]!).join(", ")}`);
    }
    output = [...output].sort((a, b) => {
      const av = a[col];
      const bv = b[col];
      const an = Number(av);
      const bn = Number(bv);
      const cmp =
        Number.isFinite(an) && Number.isFinite(bn)
          ? an - bn
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return desc ? -cmp : cmp;
    });
  }

  const total = output.length;
  if (parsed.limit !== undefined) output = output.slice(0, parsed.limit);

  const columns =
    output.length > 0
      ? Object.keys(output[0]!)
      : parsed.select.flatMap((item) => (item.kind === "all" ? [] : [item.alias]));

  return { columns, rows: output, total };
}
