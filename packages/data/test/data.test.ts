import { describe, expect, it } from "vitest";
import {
  aggregateBy,
  applyFilters,
  buildDataMap,
  columnsOf,
  filterFieldsOf,
  parseCsv,
  summarizeBy,
  uniqueValues,
} from "../src/index";

const CSV = "athlete_id,sprint_time\nA01,11.2\nA02,11.5\nA01,11.1\n";

describe("parseCsv", () => {
  it("parses CSV with type coercion", () => {
    const rows = parseCsv(CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.sprint_time).toBe(11.2);
    expect(typeof rows[0]?.sprint_time).toBe("number");
    expect(columnsOf(rows)).toEqual(["athlete_id", "sprint_time"]);
  });
});

describe("uniqueValues / applyFilters", () => {
  it("returns distinct sorted values", () => {
    expect(uniqueValues(parseCsv(CSV), "athlete_id")).toEqual(["A01", "A02"]);
  });

  it("filters rows by equality and ignores 'all'", () => {
    const rows = parseCsv(CSV);
    expect(applyFilters(rows, { athlete_id: "A01" })).toHaveLength(2);
    expect(applyFilters(rows, { athlete_id: "all" })).toHaveLength(3);
    expect(applyFilters(rows, {})).toBe(rows);
  });
});

describe("filterFieldsOf", () => {
  it("extracts declared filter fields from transforms", () => {
    expect(filterFieldsOf({ transforms: [{ filter: "athlete_id" }, { other: 1 }] })).toEqual([
      "athlete_id",
    ]);
    expect(filterFieldsOf({})).toEqual([]);
  });
});

describe("aggregateBy", () => {
  const rows = parseCsv("athlete_id,load\nA02,400\nA01,300\nA01,500\nA02,600\n");

  it("computes mean per group, sorted by key", () => {
    expect(aggregateBy(rows, "athlete_id", "load", "mean")).toEqual([
      { key: "A01", value: 400 },
      { key: "A02", value: 500 },
    ]);
  });

  it("computes sum and count", () => {
    expect(aggregateBy(rows, "athlete_id", "load", "sum")).toEqual([
      { key: "A01", value: 800 },
      { key: "A02", value: 1000 },
    ]);
    expect(aggregateBy(rows, "athlete_id", undefined, "count")).toEqual([
      { key: "A01", value: 2 },
      { key: "A02", value: 2 },
    ]);
  });
});

describe("summarizeBy", () => {
  it("summarizes count, mean, best, badge and series per group", () => {
    const rows = parseCsv(
      "athlete,group,time\nA01,Elite,11.0\nA01,Elite,10.6\nA02,Amateur,12.0\nA02,Amateur,12.4\n",
    );
    const summaries = summarizeBy(rows, "athlete", "time", "group", "min");
    expect(summaries).toHaveLength(2);
    const a01 = summaries[0]!;
    expect(a01.key).toBe("A01");
    expect(a01.badge).toBe("Elite");
    expect(a01.count).toBe(2);
    expect(a01.mean).toBeCloseTo(10.8);
    expect(a01.best).toBeCloseTo(10.6);
    expect(a01.improvement).toBeGreaterThan(0); // times went down with bestMode=min
    expect(a01.series).toEqual([11.0, 10.6]);
    const a02 = summaries[1]!;
    expect(a02.improvement).toBeLessThan(0); // times went up
  });
});

describe("buildDataMap", () => {
  it("matches dataset paths against bundled file keys by suffix", () => {
    const { data, issues } = buildDataMap(
      { sprint_study: { source: "csv", path: "data/sprints.csv" } },
      { "../../content/data/sprints.csv": CSV },
    );
    expect(data.sprint_study).toHaveLength(3);
    expect(issues).toHaveLength(0);
  });

  it("warns when a dataset file is missing and skips non-static sources", () => {
    const { data, issues } = buildDataMap(
      {
        missing: { source: "csv", path: "data/ghost.csv" },
        live: { source: "postgres", connection: "db", query: "SELECT 1" },
      },
      {},
    );
    expect(data.missing).toBeUndefined();
    expect(data.live).toBeUndefined();
    expect(issues.some((i) => i.code === "DATA_FILE_MISSING" && i.severity === "warning")).toBe(
      true,
    );
  });
});
