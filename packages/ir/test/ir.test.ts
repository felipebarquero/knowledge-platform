import { describe, expect, it } from "vitest";
import { buildDependencyGraph, IR_VERSION, validateDocument } from "../src/index";

const baseDoc = {
  irVersion: IR_VERSION,
  id: "doc",
  nodes: [
    { type: "heading", level: 1, text: "Title" },
    { type: "paragraph", text: "Body." },
  ],
};

describe("validateDocument", () => {
  it("accepts a minimal valid document and applies registry defaults", () => {
    const { document, issues } = validateDocument(baseDoc);
    expect(document).not.toBeNull();
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(document?.components).toEqual({});
    expect(document?.bindings).toEqual([]);
  });

  it("rejects unknown node types at the schema level", () => {
    const { document, issues } = validateDocument({
      ...baseDoc,
      nodes: [{ type: "video", src: "clip.mp4" }],
    });
    expect(document).toBeNull();
    expect(issues.some((i) => i.code === "SCHEMA")).toBe(true);
  });

  it("flags unresolved component refs in content", () => {
    const { issues } = validateDocument({ ...baseDoc, nodes: [{ type: "plot", ref: "missing" }] });
    expect(issues.some((i) => i.code === "UNRESOLVED_COMPONENT" && i.severity === "error")).toBe(
      true,
    );
  });

  it("flags a component whose data ref points at no dataset", () => {
    const { issues } = validateDocument({
      ...baseDoc,
      nodes: [{ type: "plot", ref: "p" }],
      components: { p: { type: "histogram", data: { ref: "ghost" } } },
    });
    expect(
      issues.some((i) => i.code === "UNRESOLVED_DATASET" && i.path === "components.p.data.ref"),
    ).toBe(true);
  });

  it("validates section children recursively", () => {
    const { issues } = validateDocument({
      ...baseDoc,
      nodes: [{ type: "section", title: "S", children: [{ type: "control", ref: "nope" }] }],
    });
    expect(issues.some((i) => i.code === "UNRESOLVED_CONTROL")).toBe(true);
  });

  it("checks bindings and sync rules against the registries", () => {
    const { issues } = validateDocument({
      ...baseDoc,
      bindings: [{ source: "ghost", target: "also_ghost", action: "filter" }],
      sync: [{ from: "ghost", to: "all_components", action: "filter" }],
    });
    expect(issues.filter((i) => i.code === "UNRESOLVED_CONTROL").length).toBeGreaterThanOrEqual(2);
    expect(issues.some((i) => i.code === "UNRESOLVED_COMPONENT")).toBe(true);
  });

  it("accepts anime.js-style animation fields (easing, delay)", () => {
    const { document, issues } = validateDocument({
      ...baseDoc,
      nodes: [{ type: "plot", ref: "p" }],
      components: { p: { type: "histogram" } },
      animations: { p: { entrance: "rise", duration: "600ms", delay: "120ms", easing: "outExpo" } },
    });
    expect(document).not.toBeNull();
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("warns about unused definitions without erroring", () => {
    const { issues } = validateDocument({
      ...baseDoc,
      datasets: { lonely: { source: "csv", path: "x.csv" } },
    });
    expect(issues.some((i) => i.code === "UNUSED_DATASET" && i.severity === "warning")).toBe(true);
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("flags unknown card children and accepts valid composition", () => {
    const { issues } = validateDocument({
      ...baseDoc,
      nodes: [{ type: "component", ref: "dash" }],
      components: {
        dash: { type: "card", children: ["mini", "ghost"] },
        mini: { type: "histogram" },
      },
    });
    expect(
      issues.some(
        (i) => i.code === "UNRESOLVED_COMPONENT" && i.path === "components.dash.children[1]",
      ),
    ).toBe(true);
    // "mini" is referenced via composition — it must not be flagged unused.
    expect(issues.some((i) => i.code === "UNUSED_COMPONENT" && i.path === "components.mini")).toBe(
      false,
    );
  });

  it("rejects composition cycles", () => {
    const { issues } = validateDocument({
      ...baseDoc,
      nodes: [{ type: "component", ref: "a" }],
      components: {
        a: { type: "card", children: ["b"] },
        b: { type: "card", children: ["a"] },
      },
    });
    expect(issues.some((i) => i.code === "COMPONENT_CYCLE")).toBe(true);
  });
});

describe("buildDependencyGraph", () => {
  it("builds data, binding and sync edges, expanding all_components", () => {
    const { document } = validateDocument({
      irVersion: IR_VERSION,
      id: "doc",
      nodes: [
        { type: "dataset", ref: "sprint_study" },
        { type: "plot", ref: "sprint_distribution" },
        { type: "control", ref: "athlete_filter" },
      ],
      datasets: { sprint_study: { source: "csv", path: "sprints.csv" } },
      components: { sprint_distribution: { type: "histogram", data: { ref: "sprint_study" } } },
      interactions: { athlete_filter: { type: "dropdown", options: "dynamic" } },
      bindings: [{ source: "athlete_filter", target: "sprint_distribution", action: "filter" }],
      sync: [{ from: "athlete_filter", to: "all_components", action: "filter" }],
    });
    expect(document).not.toBeNull();
    const graph = buildDependencyGraph(document!);
    expect(graph.nodes).toContainEqual({ id: "sprint_study", kind: "dataset" });
    expect(graph.edges).toContainEqual({
      from: "sprint_study",
      to: "sprint_distribution",
      kind: "data",
    });
    expect(graph.edges).toContainEqual({
      from: "athlete_filter",
      to: "sprint_distribution",
      kind: "binding",
      action: "filter",
    });
    expect(graph.edges).toContainEqual({
      from: "athlete_filter",
      to: "sprint_distribution",
      kind: "sync",
      action: "filter",
    });
  });

  it("adds compose edges for card children", () => {
    const { document } = validateDocument({
      irVersion: IR_VERSION,
      id: "doc",
      nodes: [{ type: "component", ref: "dash" }],
      components: {
        dash: { type: "card", children: ["mini"] },
        mini: { type: "histogram" },
      },
    });
    const graph = buildDependencyGraph(document!);
    expect(graph.edges).toContainEqual({ from: "dash", to: "mini", kind: "compose" });
  });
});
