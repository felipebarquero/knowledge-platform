import { ALL_COMPONENTS } from "./definitions";
import type { IRDocument } from "./document";

export interface GraphNode {
  id: string;
  kind: "dataset" | "component" | "control";
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: "data" | "binding" | "sync" | "compose";
  action?: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Dependency graph over the document's registries:
 *   dataset --data--> component   (component.data.ref)
 *   control --binding--> component (bindings)
 *   control --sync--> component    (sync rules; all_components expands)
 *
 * Renderers and the future sync engine consume this — content nodes never do.
 */
export function buildDependencyGraph(doc: IRDocument): DependencyGraph {
  const nodes: GraphNode[] = [
    ...Object.keys(doc.datasets).map((id) => ({ id, kind: "dataset" as const })),
    ...Object.keys(doc.components).map((id) => ({ id, kind: "component" as const })),
    ...Object.keys(doc.interactions).map((id) => ({ id, kind: "control" as const })),
  ];

  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge) => {
    const exists = edges.some(
      (e) =>
        e.from === edge.from && e.to === edge.to && e.kind === edge.kind && e.action === edge.action,
    );
    if (!exists) edges.push(edge);
  };

  for (const [name, def] of Object.entries(doc.components)) {
    if (def.data) push({ from: def.data.ref, to: name, kind: "data" });
    for (const child of def.children ?? []) {
      if (doc.components[child]) push({ from: name, to: child, kind: "compose" });
    }
  }

  for (const binding of doc.bindings) {
    const targets =
      binding.target === ALL_COMPONENTS ? Object.keys(doc.components) : [binding.target];
    for (const target of targets) {
      push({ from: binding.source, to: target, kind: "binding", action: binding.action });
    }
  }

  for (const rule of doc.sync) {
    const targets = rule.to === ALL_COMPONENTS ? Object.keys(doc.components) : [rule.to];
    for (const target of targets) {
      push({ from: rule.from, to: target, kind: "sync", action: rule.action });
    }
  }

  return { nodes, edges };
}
