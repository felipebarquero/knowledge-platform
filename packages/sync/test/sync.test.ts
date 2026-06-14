import { describe, expect, it } from "vitest";
import { validateDocument, IR_VERSION } from "@knowledge/ir";
import type { IRDocument } from "@knowledge/ir";
import {
  applyEffects,
  controlField,
  createSyncStore,
  edgesInto,
  effectsFor,
} from "../src/index";

function doc(): IRDocument {
  const { document } = validateDocument({
    irVersion: IR_VERSION,
    id: "doc",
    nodes: [],
    datasets: { d: { source: "csv", path: "x.csv" } },
    components: {
      hist: { type: "histogram", data: { ref: "d" }, encoding: { x: "time" }, transforms: [{ filter: "athlete" }] },
      scatter: { type: "dots", data: { ref: "d" }, encoding: { x: "load", y: "time" } },
    },
    interactions: {
      athlete: { type: "dropdown", options: "dynamic", field: "athlete" },
      cap: { type: "slider", field: "load", mode: "max", min: 0, max: 100 },
      elite_only: { type: "toggle", field: "group", value: "Elite" },
      spot: { type: "dropdown", field: "athlete" },
    },
    bindings: [
      { source: "athlete", target: "hist", action: "filter" },
      { source: "cap", target: "scatter", action: "filter" },
      { source: "elite_only", target: "scatter", action: "filter" },
      { source: "spot", target: "scatter", action: "highlight" },
    ],
    sync: [{ from: "athlete", to: "all_components", action: "filter" }],
  });
  if (!document) throw new Error("fixture invalid");
  return document;
}

const rows = [
  { athlete: "A01", group: "Elite", load: 40, time: 11.1 },
  { athlete: "A02", group: "Amateur", load: 80, time: 11.9 },
  { athlete: "A01", group: "Elite", load: 90, time: 10.9 },
];

describe("createSyncStore", () => {
  it("initializes from control defaults and notifies on set", () => {
    const store = createSyncStore(doc());
    expect(store.getState().values.athlete).toBeNull();
    expect(store.getState().values.elite_only).toBe(false);
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });
    store.getState().set("athlete", "A01");
    expect(store.getState().values.athlete).toBe("A01");
    expect(notified).toBe(1);
    store.getState().reset();
    expect(store.getState().values.athlete).toBeNull();
    unsubscribe();
  });
});

describe("edgesInto / effectsFor", () => {
  it("expands all_components sync rules into every component", () => {
    expect(edgesInto(doc(), "scatter").some((e) => e.source === "athlete")).toBe(true);
  });

  it("produces eq filters for dropdowns and ignores inactive values", () => {
    const d = doc();
    expect(effectsFor(d, "hist", { athlete: "A01" }).filters).toEqual([
      { field: "athlete", op: "eq", value: "A01" },
    ]);
    expect(effectsFor(d, "hist", { athlete: "all" }).filters).toEqual([]);
    expect(effectsFor(d, "hist", { athlete: null }).filters).toEqual([]);
  });

  it("produces lte/gte filters for sliders by mode", () => {
    const d = doc();
    expect(effectsFor(d, "scatter", { cap: 60 }).filters).toContainEqual({
      field: "load",
      op: "lte",
      value: 60,
    });
  });

  it("produces eq filters for toggles using the keep value", () => {
    const d = doc();
    expect(effectsFor(d, "scatter", { elite_only: true }).filters).toContainEqual({
      field: "group",
      op: "eq",
      value: "Elite",
    });
    expect(effectsFor(d, "scatter", { elite_only: false }).filters).toHaveLength(0);
  });

  it("emits highlight effects instead of filters for highlight edges", () => {
    const d = doc();
    const fx = effectsFor(d, "scatter", { spot: "A02" });
    expect(fx.highlight).toEqual({ field: "athlete", value: "A02" });
    expect(fx.filters.find((f) => f.field === "athlete")).toBeUndefined();
  });

  it("falls back to the target's filter transform when the control has no field", () => {
    const base = doc();
    const stripped = {
      ...base,
      interactions: { ...base.interactions, athlete: { ...base.interactions.athlete!, field: undefined } },
    } as IRDocument;
    expect(effectsFor(stripped, "hist", { athlete: "A01" }).filters).toEqual([
      { field: "athlete", op: "eq", value: "A01" },
    ]);
    expect(controlField(stripped, "athlete")).toBe("athlete");
  });
});

describe("applyEffects", () => {
  it("applies eq and range filters together", () => {
    const fx = {
      filters: [
        { field: "athlete", op: "eq" as const, value: "A01" },
        { field: "load", op: "lte" as const, value: 60 },
      ],
      highlight: null,
    };
    expect(applyEffects(rows, fx)).toEqual([rows[0]]);
    expect(applyEffects(rows, { filters: [], highlight: null })).toBe(rows);
  });

  it("ignores filters on columns the table does not have", () => {
    const modelRows = [{ effect: "(Intercept)", estimate: 11.3 }];
    const fx = { filters: [{ field: "athlete", op: "eq" as const, value: "A03" }], highlight: null };
    expect(applyEffects(modelRows, fx)).toBe(modelRows);
  });
});
