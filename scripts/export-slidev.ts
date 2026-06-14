/**
 * Export the content as a Slidev deck: compile content/ → IR → dist/slides.md.
 * Run with `npm run export:slidev`; present it with `npx slidev dist/slides.md`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@knowledge/compiler";
import { irToSlidev } from "@knowledge/renderer-slides";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const markdown = readFileSync(resolve(root, "content/document.md"), "utf8");
const definitions = readFileSync(resolve(root, "content/definitions.yaml"), "utf8");

const { document, issues } = compile(markdown, { definitions });
const errors = issues.filter((issue) => issue.severity === "error");

if (!document || errors.length > 0) {
  for (const issue of errors) console.error(`ERROR ${issue.code} ${issue.path} ${issue.message}`);
  console.error("\n✗ Content has IR errors — no deck exported.");
  process.exit(1);
}

const deck = irToSlidev(document);
mkdirSync(resolve(root, "dist"), { recursive: true });
const out = resolve(root, "dist/slides.md");
writeFileSync(out, deck, "utf8");

const slideCount = deck.split("\n\n---\n\n").length;
console.log(`✓ Slidev deck written to ${out} — ${slideCount} slides from "${document.title ?? document.id}"`);
