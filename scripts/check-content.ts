/**
 * CI content gate: compile content/ to IR and fail (exit 1) on any error.
 * Run with `npm run check:content`. A broken ref, malformed YAML, or schema
 * violation in the content repo can never reach the published site.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@knowledge/compiler";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const markdown = readFileSync(resolve(root, "content/document.md"), "utf8");
const definitions = readFileSync(resolve(root, "content/definitions.yaml"), "utf8");

const { document, issues } = compile(markdown, { definitions });
const errors = issues.filter((issue) => issue.severity === "error");
const warnings = issues.filter((issue) => issue.severity === "warning");

for (const issue of issues) {
  const tag = issue.severity === "error" ? "ERROR  " : "WARNING";
  console.log(`${tag} ${issue.code.padEnd(26)} ${issue.path}  ${issue.message}`);
}

if (!document) {
  console.error("\n✗ Document failed IR shape validation.");
  process.exit(1);
}

console.log(
  `\n${errors.length === 0 ? "✓" : "✗"} "${document.title ?? document.id}" — ` +
    `${document.nodes.length} nodes, ${Object.keys(document.components).length} components, ` +
    `${Object.keys(document.datasets).length} datasets, ${Object.keys(document.interactions).length} controls — ` +
    `${errors.length} error(s), ${warnings.length} warning(s)`,
);

if (errors.length > 0) process.exit(1);
