import { describe, expect, it } from "vitest";
import { compile } from "../src/index";

const DEFS = `
components:
  sprint_distribution:
    type: histogram
    data:
      ref: sprint_study
    encoding:
      x: sprint_time
datasets:
  sprint_study:
    source: csv
    path: data/sprints.csv
interactions:
  athlete_filter:
    type: dropdown
    options: dynamic
bindings:
  - source: athlete_filter
    target: sprint_distribution
    action: filter
`;

describe("compile — content", () => {
  it("compiles headings, paragraphs and lists", () => {
    const { document, issues } = compile("# Title\n\nSome text.\n\n- a\n- b\n");
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(document?.nodes).toEqual([
      { type: "heading", level: 1, text: "Title" },
      { type: "paragraph", text: "Some text." },
      { type: "list", ordered: false, items: ["a", "b"] },
    ]);
  });

  it("turns display math into equation nodes", () => {
    const { document } = compile("$$\nE = mc^2\n$$\n");
    expect(document?.nodes).toContainEqual({ type: "equation", tex: "E = mc^2", display: true });
  });

  it("keeps inline math inside paragraph text", () => {
    const { document } = compile("The random intercept $u_j$ varies.\n");
    expect(document?.nodes).toContainEqual({
      type: "paragraph",
      text: "The random intercept $u_j$ varies.",
    });
  });

  it("maps container directives to callouts", () => {
    const { document } = compile(":::note\nFixed effects describe the population.\n:::\n");
    expect(document?.nodes).toContainEqual({
      type: "callout",
      kind: "note",
      text: "Fixed effects describe the population.",
    });
  });

  it("compiles fenced code blocks into code nodes", () => {
    const { document, issues } = compile("# T\n\n```python\nprint('hi')\n```\n");
    expect(document?.nodes).toEqual([
      { type: "heading", level: 1, text: "T" },
      { type: "code", language: "python", value: "print('hi')" },
    ]);
    expect(issues.some((i) => i.code === "UNSUPPORTED_NODE")).toBe(false);
  });
});

describe("compile — directives", () => {
  it("supports the spaced shorthand from the authoring spec", () => {
    const md = "# T\n\n::dataset sprint_study\n\n::plot sprint_distribution\n\n::control athlete_filter\n";
    const { document, issues } = compile(md, { definitions: DEFS });
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(document?.nodes).toContainEqual({ type: "dataset", ref: "sprint_study" });
    expect(document?.nodes).toContainEqual({ type: "plot", ref: "sprint_distribution" });
    expect(document?.nodes).toContainEqual({ type: "control", ref: "athlete_filter" });
  });

  it("supports the bracketed remark-directive form", () => {
    const { document } = compile("::plot[sprint_distribution]\n", { definitions: DEFS });
    expect(document?.nodes).toContainEqual({ type: "plot", ref: "sprint_distribution" });
  });

  it("errors on a directive without a reference", () => {
    const { issues } = compile("::plot\n");
    expect(issues.some((i) => i.code === "DIRECTIVE_MISSING_REF" && i.severity === "error")).toBe(
      true,
    );
  });

  it("maps :::grid container directives to layout_grid nodes", () => {
    const md = ':::grid{columns=2 gap=20}\n::plot sprint_distribution\n\n::dataset sprint_study\n:::\n';
    const { document } = compile(md, { definitions: DEFS });
    const grid = document?.nodes[0];
    expect(grid?.type).toBe("layout_grid");
    if (grid?.type === "layout_grid") {
      expect(grid.columns).toBe(2);
      expect(grid.gap).toBe(20);
      expect(grid.children).toEqual([
        { type: "plot", ref: "sprint_distribution" },
        { type: "dataset", ref: "sprint_study" },
      ]);
    }
  });
});

describe("compile — document assembly", () => {
  it("reads frontmatter id and title", () => {
    const { document } = compile("---\nid: lmm_chapter\ntitle: Linear Mixed Models\n---\n\n# Heading\n");
    expect(document?.id).toBe("lmm_chapter");
    expect(document?.title).toBe("Linear Mixed Models");
  });

  it("falls back to a slug of the first heading for the id", () => {
    const { document } = compile("# Linear Mixed Models\n");
    expect(document?.id).toBe("linear_mixed_models");
  });

  it("reads hero metadata (chapter, subtitle, tags, breadcrumb) from frontmatter", () => {
    const { document } = compile(
      "---\ntitle: LMM\nchapter: 8.3\nsubtitle: Repeated measures.\ntags:\n  - Mixed Effects\n  - Random Effects\nbreadcrumb:\n  - Stats\n  - Modelling\n---\n\n# LMM\n",
    );
    expect(document?.chapter).toBe("8.3"); // numeric YAML coerced to string
    expect(document?.subtitle).toBe("Repeated measures.");
    expect(document?.tags).toEqual(["Mixed Effects", "Random Effects"]);
    expect(document?.breadcrumb).toEqual(["Stats", "Modelling"]);
  });

  it("reports unresolved refs as errors and produces no graph", () => {
    const { issues, graph } = compile("::plot ghost_plot\n");
    expect(issues.some((i) => i.code === "UNRESOLVED_COMPONENT" && i.severity === "error")).toBe(
      true,
    );
    expect(graph).toBeNull();
  });

  it("surfaces YAML parse failures from sidecars", () => {
    const { issues } = compile("# T\n", { definitions: "components: [unclosed" });
    expect(issues.some((i) => i.code === "YAML_PARSE")).toBe(true);
  });

  it("builds the dependency graph from definitions", () => {
    const md = "::dataset sprint_study\n\n::plot sprint_distribution\n\n::control athlete_filter\n";
    const { graph } = compile(md, { definitions: DEFS });
    expect(graph?.edges).toContainEqual({
      from: "sprint_study",
      to: "sprint_distribution",
      kind: "data",
    });
    expect(graph?.edges).toContainEqual({
      from: "athlete_filter",
      to: "sprint_distribution",
      kind: "binding",
      action: "filter",
    });
  });
});
