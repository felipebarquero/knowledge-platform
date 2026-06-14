import { ALL_COMPONENTS } from "./definitions";
import { documentSchema } from "./document";
import type { IRDocument } from "./document";
import type { IRNode } from "./nodes";

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  /** Null only when the document fails shape validation entirely. */
  document: IRDocument | null;
  issues: ValidationIssue[];
}

const err = (code: string, path: string, message: string): ValidationIssue => ({
  severity: "error",
  code,
  path,
  message,
});

const warn = (code: string, path: string, message: string): ValidationIssue => ({
  severity: "warning",
  code,
  path,
  message,
});

/** Depth-first walk over content nodes, descending into composition nodes. */
export function walkNodes(
  nodes: IRNode[],
  visit: (node: IRNode, path: string) => void,
  basePath = "nodes",
): void {
  nodes.forEach((node, index) => {
    const path = `${basePath}[${index}]`;
    visit(node, path);
    if (node.type === "section" || node.type === "layout_grid") {
      walkNodes(node.children, visit, `${path}.children`);
    }
    if (node.type === "tabs") {
      node.tabs.forEach((tab, t) => walkNodes(tab.children, visit, `${path}.tabs[${t}].children`));
    }
  });
}

/**
 * Shape validation (Zod) followed by referential validation: every ref in
 * content must resolve to a registry entry, and every binding/sync endpoint
 * must exist. Unused definitions are reported as warnings.
 */
export function validateDocument(input: unknown): ValidationResult {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      document: null,
      issues: parsed.error.issues.map((issue) =>
        err("SCHEMA", issue.path.join("."), issue.message),
      ),
    };
  }

  const doc = parsed.data;
  const issues: ValidationIssue[] = [];
  const referencedComponents = new Set<string>();
  const referencedDatasets = new Set<string>();
  const referencedControls = new Set<string>();

  walkNodes(doc.nodes, (node, path) => {
    switch (node.type) {
      case "dataset":
        referencedDatasets.add(node.ref);
        if (!doc.datasets[node.ref]) {
          issues.push(err("UNRESOLVED_DATASET", path, `Dataset "${node.ref}" is not defined`));
        }
        break;
      case "component":
      case "table":
      case "plot":
      case "chart":
        referencedComponents.add(node.ref);
        if (!doc.components[node.ref]) {
          issues.push(err("UNRESOLVED_COMPONENT", path, `Component "${node.ref}" is not defined`));
        }
        break;
      case "control":
        referencedControls.add(node.ref);
        if (!doc.interactions[node.ref]) {
          issues.push(err("UNRESOLVED_CONTROL", path, `Control "${node.ref}" is not defined`));
        }
        break;
      case "sync_binding":
        if (!doc.interactions[node.source]) {
          issues.push(
            err("UNRESOLVED_CONTROL", `${path}.source`, `Control "${node.source}" is not defined`),
          );
        }
        if (node.target !== ALL_COMPONENTS && !doc.components[node.target]) {
          issues.push(
            err(
              "UNRESOLVED_COMPONENT",
              `${path}.target`,
              `Component "${node.target}" is not defined`,
            ),
          );
        }
        break;
      default:
        break;
    }
  });

  for (const [name, def] of Object.entries(doc.components)) {
    if (def.data && !doc.datasets[def.data.ref]) {
      issues.push(
        err(
          "UNRESOLVED_DATASET",
          `components.${name}.data.ref`,
          `Component "${name}" references unknown dataset "${def.data.ref}"`,
        ),
      );
    }
    (def.children ?? []).forEach((child, index) => {
      referencedComponents.add(child);
      if (!doc.components[child]) {
        issues.push(
          err(
            "UNRESOLVED_COMPONENT",
            `components.${name}.children[${index}]`,
            `Component "${name}" embeds unknown component "${child}"`,
          ),
        );
      }
    });
  }

  // Composition must be a DAG — a card embedding itself (directly or
  // transitively) would recurse forever in every renderer.
  {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (name: string, trail: string[]): void => {
      if (done.has(name)) return;
      if (visiting.has(name)) {
        issues.push(
          err(
            "COMPONENT_CYCLE",
            `components.${name}.children`,
            `Composition cycle: ${[...trail, name].join(" → ")}`,
          ),
        );
        return;
      }
      visiting.add(name);
      for (const child of doc.components[name]?.children ?? []) {
        if (doc.components[child]) visit(child, [...trail, name]);
      }
      visiting.delete(name);
      done.add(name);
    };
    for (const name of Object.keys(doc.components)) visit(name, []);
  }

  doc.bindings.forEach((binding, index) => {
    if (!doc.interactions[binding.source]) {
      issues.push(
        err(
          "UNRESOLVED_CONTROL",
          `bindings[${index}].source`,
          `Binding source "${binding.source}" is not a defined interaction`,
        ),
      );
    }
    if (binding.target !== ALL_COMPONENTS && !doc.components[binding.target]) {
      issues.push(
        err(
          "UNRESOLVED_COMPONENT",
          `bindings[${index}].target`,
          `Binding target "${binding.target}" is not a defined component`,
        ),
      );
    }
    // Phase 3: a filter/update binding needs a resolvable field to act on.
    const control = doc.interactions[binding.source];
    if (control && (binding.action === "filter" || binding.action === "update") && !control.field) {
      const targets =
        binding.target === ALL_COMPONENTS ? Object.keys(doc.components) : [binding.target];
      const resolvable = targets.some((target) =>
        (doc.components[target]?.transforms ?? []).some((t) => typeof t.filter === "string"),
      );
      if (!resolvable) {
        issues.push({
          severity: "warning",
          code: "BINDING_NO_FIELD",
          path: `bindings[${index}]`,
          message: `No filter field resolvable for control "${binding.source}" — set "field" on the control or add a filter transform to the target`,
        });
      }
    }
  });

  doc.sync.forEach((rule, index) => {
    if (!doc.interactions[rule.from]) {
      issues.push(
        err(
          "UNRESOLVED_CONTROL",
          `sync[${index}].from`,
          `Sync source "${rule.from}" is not a defined interaction`,
        ),
      );
    }
    if (rule.to !== ALL_COMPONENTS && !doc.components[rule.to]) {
      issues.push(
        err(
          "UNRESOLVED_COMPONENT",
          `sync[${index}].to`,
          `Sync target "${rule.to}" is not a defined component`,
        ),
      );
    }
  });

  if (doc.animations) {
    for (const name of Object.keys(doc.animations)) {
      if (!doc.components[name]) {
        issues.push(
          warn(
            "UNKNOWN_ANIMATION_TARGET",
            `animations.${name}`,
            `Animation targets unknown component "${name}"`,
          ),
        );
      }
    }
  }

  for (const name of Object.keys(doc.components)) {
    if (!referencedComponents.has(name)) {
      issues.push(
        warn(
          "UNUSED_COMPONENT",
          `components.${name}`,
          `Component "${name}" is defined but never referenced from content`,
        ),
      );
    }
  }

  for (const name of Object.keys(doc.datasets)) {
    const usedByComponent = Object.values(doc.components).some((c) => c.data?.ref === name);
    if (!referencedDatasets.has(name) && !usedByComponent) {
      issues.push(
        warn(
          "UNUSED_DATASET",
          `datasets.${name}`,
          `Dataset "${name}" is defined but never referenced`,
        ),
      );
    }
  }

  return { document: doc, issues };
}
