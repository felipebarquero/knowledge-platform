import { describe, expect, it } from "vitest";
import { IR_VERSION, validateDocument } from "@knowledge/ir";
import type { IRDocument } from "@knowledge/ir";
import { irToMarkdownDoc, irToNotebook } from "../src/notebook";

function doc(nodes: unknown[], components: Record<string, unknown> = {}): IRDocument {
  const { document } = validateDocument({
    irVersion: IR_VERSION,
    id: "chap",
    title: "Mixed Models",
    nodes,
    components,
    datasets: {},
  });
  if (!document) throw new Error("fixture invalid");
  return document;
}

const sample = (): IRDocument =>
  doc(
    [
      { type: "heading", level: 1, text: "Intro" },
      { type: "paragraph", text: "Repeated measures." },
      { type: "component", ref: "q" },
      { type: "component", ref: "m" },
      { type: "plot", ref: "p" },
    ],
    {
      q: { type: "sql", description: "SELECT 1 AS a", options: { result: [{ a: 1 }] } },
      m: { type: "code", description: "summary(fit)", options: { language: "r", output: "Call: lmer" } },
      p: { type: "histogram" },
    },
  );

// Minimal nbformat cell shape for assertions.
interface NbCell {
  cell_type: string;
  source: string[];
  outputs?: { output_type: string; name?: string }[];
}
interface Nb {
  cells: NbCell[];
  nbformat: number;
  metadata: { knowledge_platform: { scope: string } };
}
const text = (c: NbCell) => c.source.join("");

describe("irToNotebook", () => {
  it("emits a title, a data note, and prose markdown cells", () => {
    const nb = irToNotebook(sample()) as Nb;
    expect(nb.nbformat).toBe(4);
    expect(nb.metadata.knowledge_platform.scope).toBe("chap");
    const md = nb.cells.filter((c) => c.cell_type === "markdown").map(text);
    expect(md[0]).toContain("# Mixed Models");
    expect(md.some((s) => s.includes("Data is not bundled"))).toBe(true);
    expect(md.some((s) => s.includes("# Intro"))).toBe(true);
    expect(md.some((s) => s.includes("Repeated measures."))).toBe(true);
  });

  it("turns code + sql components into code cells with recorded outputs", () => {
    const nb = irToNotebook(sample()) as Nb;
    const code = nb.cells.filter((c) => c.cell_type === "code");
    expect(code.length).toBe(2);
    const sql = code.find((c) => text(c).includes("SELECT 1 AS a"))!;
    expect(sql.outputs?.some((o) => o.output_type === "execute_result")).toBe(true);
    const r = code.find((c) => text(c).includes("summary(fit)"))!;
    expect(r.outputs?.some((o) => o.name === "stdout")).toBe(true);
  });

  it("lets live overrides win over the IR (edited source + output)", () => {
    const nb = irToNotebook(sample(), {
      q: { source: "SELECT 99 AS z", outputs: { table: [{ z: 99 }] } },
    }) as Nb;
    const sql = nb.cells.find((c) => c.cell_type === "code" && text(c).includes("SELECT 99"))!;
    expect(sql).toBeTruthy();
    expect(JSON.stringify(sql.outputs)).toContain("99");
    // The original SQL source no longer appears.
    expect(nb.cells.some((c) => text(c).includes("SELECT 1 AS a"))).toBe(false);
  });

  it("keeps non-code components as labeled pointers (never dropped)", () => {
    const nb = irToNotebook(sample()) as Nb;
    expect(nb.cells.map(text).join("\n")).toContain("**histogram** `p`");
  });
});

describe("irToMarkdownDoc", () => {
  it("fences code by language and includes recorded outputs + the data note", () => {
    const md = irToMarkdownDoc(sample());
    expect(md).toContain("# Mixed Models");
    expect(md).toContain("Data is not bundled");
    expect(md).toContain("```sql\nSELECT 1 AS a\n```");
    expect(md).toContain("```r\nsummary(fit)\n```");
    expect(md).toContain("Call: lmer");
  });
});
