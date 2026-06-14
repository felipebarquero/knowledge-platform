import type { Root } from "mdast";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parse as parseYaml } from "yaml";
import { buildDependencyGraph, IR_VERSION, validateDocument } from "@knowledge/ir";
import type { DependencyGraph, IRDocument, ValidationIssue } from "@knowledge/ir";
import { resolveDefinitions } from "./definitions";
import type { DefinitionsInput, RawDefinitions } from "./definitions";
import { normalizeDirectiveShorthand } from "./directives";
import { transformRoot } from "./markdown";

export type { DefinitionsInput, RawDefinitions } from "./definitions";
export { normalizeDirectiveShorthand } from "./directives";
export { phrasingToString } from "./markdown";

export interface CompileOptions {
  /** Document id; falls back to frontmatter `id`, then a slug of the first heading. */
  id?: string;
  /** YAML sidecar source(s) or pre-parsed definition objects. */
  definitions?: DefinitionsInput;
}

export interface CompileResult {
  /** Null only when the assembled document fails shape validation. */
  document: IRDocument | null;
  /** Null when any error-severity issue was produced. */
  graph: DependencyGraph | null;
  issues: ValidationIssue[];
}

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter)
  .use(remarkDirective)
  .use(remarkMath);

/**
 * Markdown (+ definition sidecars) → validated IR document.
 *
 * Responsibilities per CLAUDE.md: resolve dataset/component refs, validate
 * schema, build the dependency graph. Explicitly NOT: runtime logic, styling
 * resolution, query execution.
 */
export function compile(markdown: string, options: CompileOptions = {}): CompileResult {
  const issues: ValidationIssue[] = [];
  const definitions = resolveDefinitions(options.definitions, issues);

  const tree = processor.parse(normalizeDirectiveShorthand(markdown)) as Root;
  const frontmatter = readFrontmatter(tree, issues);
  const transformed = transformRoot(tree);
  issues.push(...transformed.issues);

  const title = frontmatter.title ?? transformed.firstHeading ?? undefined;
  const id =
    options.id ??
    frontmatter.id ??
    (transformed.firstHeading ? slugify(transformed.firstHeading) : "untitled_document");

  const input: Record<string, unknown> = {
    irVersion: IR_VERSION,
    id,
    nodes: transformed.nodes,
    components: definitions.components ?? {},
    datasets: definitions.datasets ?? {},
    interactions: definitions.interactions ?? {},
    bindings: definitions.bindings ?? [],
    sync: definitions.sync ?? [],
  };
  if (title !== undefined) input.title = title;
  if (frontmatter.subtitle !== undefined) input.subtitle = frontmatter.subtitle;
  if (frontmatter.chapter !== undefined) input.chapter = frontmatter.chapter;
  if (frontmatter.tags !== undefined) input.tags = frontmatter.tags;
  if (frontmatter.breadcrumb !== undefined) input.breadcrumb = frontmatter.breadcrumb;
  if (definitions.theme !== undefined) input.theme = definitions.theme;
  if (definitions.animations !== undefined) input.animations = definitions.animations;

  const validated = validateDocument(input);
  issues.push(...validated.issues);

  const hasErrors = issues.some((issue) => issue.severity === "error");
  return {
    document: validated.document,
    graph: validated.document && !hasErrors ? buildDependencyGraph(validated.document) : null,
    issues,
  };
}

interface Frontmatter {
  id?: string;
  title?: string;
  subtitle?: string;
  chapter?: string;
  tags?: string[];
  breadcrumb?: string[];
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? (value as string[])
    : undefined;
}

function readFrontmatter(tree: Root, issues: ValidationIssue[]): Frontmatter {
  const first = tree.children[0];
  if (!first || first.type !== "yaml") return {};
  try {
    const data: unknown = parseYaml(first.value);
    if (data === null || typeof data !== "object" || Array.isArray(data)) return {};
    const record = data as Record<string, unknown>;
    const out: Frontmatter = {};
    if (typeof record.id === "string" && record.id) out.id = record.id;
    if (typeof record.title === "string" && record.title) out.title = record.title;
    if (typeof record.subtitle === "string" && record.subtitle) out.subtitle = record.subtitle;
    // YAML may parse `chapter: 8.3` as a number — normalize to string.
    if (typeof record.chapter === "string" || typeof record.chapter === "number") {
      out.chapter = String(record.chapter);
    }
    const tags = stringArray(record.tags);
    if (tags) out.tags = tags;
    const breadcrumb = stringArray(record.breadcrumb);
    if (breadcrumb) out.breadcrumb = breadcrumb;
    return out;
  } catch (error) {
    issues.push({
      severity: "error",
      code: "YAML_PARSE",
      path: "frontmatter",
      message: error instanceof Error ? error.message : "Invalid frontmatter YAML",
    });
    return {};
  }
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "untitled_document";
}
