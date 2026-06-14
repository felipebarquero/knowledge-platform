import type { IRDocument, IRNode } from "@knowledge/ir";

/**
 * Slidev exporter — a stateless text projection of the IR.
 *
 * Layout decision (Phase 4): slides split at heading level ≤ 2; a slide that
 * exceeds `maxBlocks` content blocks overflows into a continuation slide.
 * Text, math, code and callouts export with full fidelity; data-driven
 * components cannot run inside Slidev, so they export as labeled pointers to
 * the interactive web rendering (never silently dropped).
 */

export interface SlidevOptions {
  theme?: string;
  maxBlocks?: number;
}

function nodeToMd(node: IRNode, doc: IRDocument): string | null {
  switch (node.type) {
    case "heading":
      return `${"#".repeat(Math.min(node.level, 6))} ${node.text}`;
    case "paragraph":
      return node.text;
    case "list":
      return node.items
        .map((item, i) => (node.ordered ? `${i + 1}. ${item}` : `- ${item}`))
        .join("\n");
    case "equation":
      return `$$\n${node.tex}\n$$`;
    case "code":
      return `\`\`\`${node.language ?? ""}\n${node.value}\n\`\`\``;
    case "callout":
      return `> **${(node.kind ?? "note").toUpperCase()}** — ${node.text.replace(/\n+/g, " ")}`;
    case "dataset": {
      const def = doc.datasets[node.ref];
      return `> 🗄 **dataset** \`${node.ref}\`${def ? ` — ${def.source}` : ""}`;
    }
    case "component":
    case "plot":
    case "chart":
    case "table": {
      const def = doc.components[node.ref];
      return `> 🧩 **${def?.type ?? node.type}** \`${node.ref}\` — interactive in the web rendering`;
    }
    case "control":
      return `> 🎛 **control** \`${node.ref}\` — interactive in the web rendering`;
    case "section":
      return [node.title ? `## ${node.title}` : null, ...node.children.map((c) => nodeToMd(c, doc))]
        .filter((part): part is string => part !== null)
        .join("\n\n");
    case "layout_grid":
      return node.children
        .map((c) => nodeToMd(c, doc))
        .filter((part): part is string => part !== null)
        .join("\n\n");
    case "tabs":
      return node.tabs
        .map(
          (tab) =>
            `**${tab.label}**\n\n${tab.children
              .map((c) => nodeToMd(c, doc))
              .filter((part): part is string => part !== null)
              .join("\n\n")}`,
        )
        .join("\n\n");
    case "sync_binding":
      return null;
  }
}

export function irToSlidev(doc: IRDocument, options: SlidevOptions = {}): string {
  const { theme = "seriph", maxBlocks = 6 } = options;
  const slides: string[][] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) {
      slides.push(current);
      current = [];
    }
  };

  for (const node of doc.nodes) {
    if (node.type === "heading" && node.level <= 2) flush();
    const md = nodeToMd(node, doc);
    if (md === null) continue;
    if (current.length >= maxBlocks && node.type !== "heading") flush();
    current.push(md);
  }
  flush();

  const frontmatter = [
    "---",
    `theme: ${theme}`,
    `title: ${doc.title ?? doc.id}`,
    `info: Generated from Knowledge IR ${doc.irVersion}`,
    "transition: slide-left",
    "---",
  ].join("\n");

  const titleSlide = `# ${doc.title ?? doc.id}\n\nGenerated from the Knowledge IR — one source, many renderings.`;

  return `${frontmatter}\n\n${[titleSlide, ...slides.map((s) => s.join("\n\n"))].join("\n\n---\n\n")}\n`;
}
