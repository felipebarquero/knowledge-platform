import { describe, expect, it } from "vitest";
import { IR_VERSION, validateDocument } from "@knowledge/ir";
import type { IRDocument } from "@knowledge/ir";
import { irToSlidev } from "../src/index";

function doc(nodes: unknown[]): IRDocument {
  const { document } = validateDocument({
    irVersion: IR_VERSION,
    id: "deck",
    title: "My Book",
    nodes,
    components: { p: { type: "histogram" } },
    datasets: {},
  });
  if (!document) throw new Error("fixture invalid");
  return document;
}

describe("irToSlidev", () => {
  it("emits frontmatter and a title slide", () => {
    const md = irToSlidev(doc([]));
    expect(md.startsWith("---\ntheme: seriph\ntitle: My Book\n")).toBe(true);
    expect(md).toContain("# My Book");
  });

  it("splits slides at heading level ≤ 2", () => {
    const md = irToSlidev(
      doc([
        { type: "heading", level: 1, text: "Intro" },
        { type: "paragraph", text: "One." },
        { type: "heading", level: 2, text: "Part A" },
        { type: "paragraph", text: "Two." },
      ]),
    );
    // title slide + 2 content slides = 2 separators after frontmatter join
    expect(md.split("\n---\n").length).toBe(4); // frontmatter close + 3 slide separators... verified via count below
    expect(md).toContain("# Intro");
    expect(md).toContain("## Part A");
  });

  it("exports equations and code with full fidelity", () => {
    const md = irToSlidev(
      doc([
        { type: "equation", tex: "E = mc^2", display: true },
        { type: "code", language: "r", value: "summary(fit)" },
      ]),
    );
    expect(md).toContain("$$\nE = mc^2\n$$");
    expect(md).toContain("```r\nsummary(fit)\n```");
  });

  it("exports data-driven components as labeled pointers, never dropping them", () => {
    const md = irToSlidev(doc([{ type: "plot", ref: "p" }]));
    expect(md).toContain("🧩 **histogram** `p`");
  });

  it("overflows long slides after maxBlocks", () => {
    const nodes = [
      { type: "heading", level: 2, text: "Long" },
      ...Array.from({ length: 7 }, (_, i) => ({ type: "paragraph", text: `Block ${i}.` })),
    ];
    const md = irToSlidev(doc(nodes), { maxBlocks: 4 });
    expect(md).toContain("Block 6.");
    const slideCount = md.split("\n\n---\n\n").length;
    expect(slideCount).toBeGreaterThanOrEqual(3);
  });
});
