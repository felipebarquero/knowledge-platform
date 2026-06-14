import { describe, expect, it } from "vitest";
import { SqlError, runSql } from "../src/sql";

const sprint_sessions = [
  { athlete_id: "A01", week: 1, sprint_time: 11.0, training_load: 400 },
  { athlete_id: "A01", week: 2, sprint_time: 10.8, training_load: 500 },
  { athlete_id: "A02", week: 1, sprint_time: 11.6, training_load: 600 },
  { athlete_id: "A02", week: 7, sprint_time: 11.4, training_load: 650 },
];

const tables = { sprint_sessions };

describe("runSql — projection & filtering", () => {
  it("selects columns with WHERE comparisons", () => {
    const result = runSql("SELECT athlete_id, sprint_time FROM sprint_sessions WHERE training_load >= 500", tables);
    expect(result.columns).toEqual(["athlete_id", "sprint_time"]);
    expect(result.rows).toHaveLength(3);
  });

  it("supports SELECT * and string equality", () => {
    const result = runSql("SELECT * FROM sprint_sessions WHERE athlete_id = 'A02'", tables);
    expect(result.rows).toHaveLength(2);
    expect(result.columns).toContain("training_load");
  });

  it("supports BETWEEN and AND/OR precedence", () => {
    const result = runSql(
      "SELECT athlete_id FROM sprint_sessions WHERE week BETWEEN 1 AND 6 AND training_load > 450 OR athlete_id = 'A02'",
      tables,
    );
    // (between & load>450): A01w2, A02w1 — OR athlete A02 adds A02w7
    expect(result.rows).toHaveLength(3);
  });
});

describe("runSql — aggregation, ordering, limits", () => {
  it("groups with aggregates and aliases, ordered ascending", () => {
    const result = runSql(
      "SELECT athlete_id, AVG(sprint_time) as mean_time, MAX(training_load) as max_load, COUNT(*) as n FROM sprint_sessions GROUP BY athlete_id ORDER BY mean_time ASC",
      tables,
    );
    expect(result.columns).toEqual(["athlete_id", "mean_time", "max_load", "n"]);
    expect(result.rows[0]).toEqual({ athlete_id: "A01", mean_time: 10.9, max_load: 500, n: 2 });
    expect(result.rows[1]?.mean_time).toBeCloseTo(11.5);
  });

  it("aggregates without GROUP BY into a single row", () => {
    const result = runSql("SELECT COUNT(*) as n, MIN(sprint_time) as best FROM sprint_sessions", tables);
    expect(result.rows).toEqual([{ n: 4, best: 10.8 }]);
  });

  it("applies LIMIT after ordering and reports the pre-limit total", () => {
    const result = runSql("SELECT athlete_id, week FROM sprint_sessions ORDER BY week DESC LIMIT 2", tables);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.week).toBe(7);
    expect(result.total).toBe(4);
  });

  it("tolerates a trailing semicolon", () => {
    const result = runSql("SELECT athlete_id FROM sprint_sessions LIMIT 1;", tables);
    expect(result.rows).toHaveLength(1);
  });
});

describe("runSql — errors", () => {
  it("rejects unknown tables and columns with helpful messages", () => {
    expect(() => runSql("SELECT x FROM ghost", tables)).toThrow(/Unknown table "ghost"/);
    expect(() => runSql("SELECT ghost_col FROM sprint_sessions", tables)).toThrow(/Unknown column "ghost_col"/);
  });

  it("rejects unsupported syntax with a Phase 5 pointer", () => {
    expect(() => runSql("SELECT a FROM t JOIN u ON a = b", { t: [], u: [] })).toThrow(SqlError);
    expect(() => runSql("SELECT a FROM sprint_sessions JOIN x", tables)).toThrow(/Phase 5/);
  });

  it("rejects bare columns outside GROUP BY", () => {
    expect(() => runSql("SELECT athlete_id, week, AVG(sprint_time) FROM sprint_sessions GROUP BY athlete_id", tables)).toThrow(
      /must appear in GROUP BY/,
    );
  });
});
