import type { ListItem, PhrasingContent, Root, RootContent } from "mdast";
import type {} from "mdast-util-directive";
import type {} from "mdast-util-math";
import type { IRNode, ValidationIssue } from "@knowledge/ir";

const REF_DIRECTIVES = new Set(["dataset", "component", "table", "plot", "chart", "control"]);

type RefDirectiveName = "dataset" | "component" | "table" | "plot" | "chart" | "control";

export interface TransformResult {
  nodes: IRNode[];
  firstHeading: string | null;
  issues: ValidationIssue[];
}

const warn = (code: string, path: string, message: string): ValidationIssue => ({
  severity: "warning",
  code,
  path,
  message,
});

const err = (code: string, path: string, message: string): ValidationIssue => ({
  severity: "error",
  code,
  path,
  message,
});

/** mdast → IR nodes. Pure transform: no I/O, no styling, no query execution. */
export function transformRoot(root: Root): TransformResult {
  const issues: ValidationIssue[] = [];
  const nodes: IRNode[] = [];
  let firstHeading: string | null = null;

  root.children.forEach((child, index) => {
    const produced = transformBlock(child, `markdown[${index}]`, issues);
    for (const node of produced) {
      nodes.push(node);
      if (firstHeading === null && node.type === "heading") firstHeading = node.text;
    }
  });

  return { nodes, firstHeading, issues };
}

function transformBlock(node: RootContent, path: string, issues: ValidationIssue[]): IRNode[] {
  switch (node.type) {
    case "yaml":
      return []; // frontmatter is read separately in compile()
    case "heading":
      return [{ type: "heading", level: node.depth, text: phrasingToString(node.children) }];
    case "paragraph": {
      const text = phrasingToString(node.children).trim();
      return text ? [{ type: "paragraph", text }] : [];
    }
    case "list":
      return [
        {
          type: "list",
          ordered: node.ordered === true,
          items: node.children.map((item) => listItemText(item)),
        },
      ];
    case "math":
      return [{ type: "equation", tex: node.value.trim(), display: true }];
    case "blockquote":
      return [{ type: "callout", kind: "quote", text: blockText(node.children) }];
    case "containerDirective": {
      if (node.name === "grid") {
        const columns = intAttr(node.attributes, "columns", 1, 12) ?? 2;
        const gap = intAttr(node.attributes, "gap", 0, 64);
        const children = node.children
          .filter((child) => !(child.data as { directiveLabel?: boolean } | undefined)?.directiveLabel)
          .flatMap((child, index) =>
            transformBlock(child as RootContent, `${path}.children[${index}]`, issues),
          );
        return [{ type: "layout_grid", columns, ...(gap !== undefined ? { gap } : {}), children }];
      }
      return [{ type: "callout", kind: node.name, text: blockText(node.children) }];
    }
    case "leafDirective": {
      if (!REF_DIRECTIVES.has(node.name)) {
        issues.push(warn("UNKNOWN_DIRECTIVE", path, `Unknown directive "::${node.name}" was dropped`));
        return [];
      }
      const label = phrasingToString(node.children).trim();
      const ref = label || attr(node.attributes, "ref") || attr(node.attributes, "id");
      if (!ref) {
        issues.push(
          err(
            "DIRECTIVE_MISSING_REF",
            path,
            `Directive "::${node.name}" needs a reference, e.g. "::${node.name} my_ref"`,
          ),
        );
        return [];
      }
      return [{ type: node.name as RefDirectiveName, ref }];
    }
    case "code":
      return [
        {
          type: "code",
          ...(node.lang ? { language: node.lang } : {}),
          value: node.value,
        },
      ];
    case "html":
      issues.push(warn("UNSUPPORTED_NODE", path, "Raw HTML is not allowed in content and was dropped"));
      return [];
    case "thematicBreak":
      return [];
    default:
      issues.push(warn("UNSUPPORTED_NODE", path, `Markdown node "${node.type}" was dropped`));
      return [];
  }
}

function attr(
  attributes: Record<string, string | null | undefined> | null | undefined,
  key: string,
): string | undefined {
  const value = attributes?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function intAttr(
  attributes: Record<string, string | null | undefined> | null | undefined,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const raw = attr(attributes, key);
  if (raw === undefined) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

function listItemText(item: ListItem): string {
  return blockText(item.children).replace(/\n+/g, " ").trim();
}

function blockText(children: RootContent[]): string {
  return children
    .map((child) => {
      if (child.type === "paragraph") return phrasingToString(child.children);
      if ("children" in child) return phrasingToString(child.children as PhrasingContent[]);
      if ("value" in child) return String(child.value);
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Inline content → plain text. Inline math keeps its $…$ wrapper (Phase 1). */
export function phrasingToString(children: PhrasingContent[]): string {
  return children.map(inlineToString).join("");
}

function inlineToString(node: PhrasingContent): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
      return node.value;
    case "inlineMath":
      return `$${node.value}$`;
    case "break":
      return " ";
    case "image":
      return node.alt ?? "";
    default:
      if ("children" in node) return phrasingToString(node.children as PhrasingContent[]);
      if ("value" in node) return String((node as { value: unknown }).value);
      return "";
  }
}
