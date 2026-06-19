import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  applyNodeChanges,
} from "@xyflow/react";
import type { Edge, Node, NodeChange, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Icon } from "./Icon";
import { CardSyncContext } from "./sync";
import type { CardSync } from "./sync";

/**
 * React Flow node-graph. The IR stays declarative — nodes, edges, icons and
 * styling all live in the component's free-form `options`; this lazy-loaded
 * module is the only place React Flow is touched.
 *
 * Nodes are AWS-architecture-style: an icon tile + title + subtitle, and may
 * embed **composed components** (rendered via `renderEmbed`, e.g. a sparkline)
 * inside the node body. Hovering a node highlights its connected neighbourhood
 * (everything else dims); embedded charts share a card-scoped sync context, so
 * hover-linking carries across nodes. In the workshop a drag fires
 * `onNodesPersist`; the reader omits it, so dragging there is ephemeral.
 */

export interface FlowNode {
  id: string;
  label?: string;
  sublabel?: string;
  /** Iconify name, e.g. "logos:aws-lambda" or "lucide:database". */
  icon?: string;
  x?: number;
  y?: number;
  color?: string;
  /** Component names embedded inside this node (rendered compact). */
  children?: string[];
}

export interface FlowEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
}

interface KpNodeData extends Record<string, unknown> {
  label: string;
  sublabel?: string;
  icon?: string;
  color?: string;
  accent: string;
  radius: number;
  children?: string[];
  dimmed?: boolean;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Lets a custom node render embedded components without importing the dispatcher. */
const FlowEmbedContext = createContext<((name: string) => ReactNode) | null>(null);

/** Custom node — an icon tile + title/subtitle, optional embedded components. */
function KpNode({ data }: NodeProps) {
  const d = data as KpNodeData;
  const accent = d.color ?? d.accent;
  const renderEmbed = useContext(FlowEmbedContext);
  const children = d.children ?? [];
  return (
    <div
      className={`kp-flownode ${children.length ? "kp-flownode--rich" : ""} ${d.dimmed ? "kp-flownode--dim" : ""}`}
      style={{ borderRadius: d.radius, borderColor: accent }}
    >
      <Handle type="target" position={Position.Left} className="kp-flownode__handle" />
      <div className="kp-flownode__head">
        {d.icon ? (
          <span
            className="kp-flownode__tile"
            style={{ background: `color-mix(in srgb, ${accent} 22%, transparent)`, borderColor: accent }}
          >
            <Icon icon={d.icon} size={20} color={accent} />
          </span>
        ) : (
          <span className="kp-flownode__bar" style={{ background: accent }} />
        )}
        <span className="kp-flownode__text">
          <span className="kp-flownode__label">{d.label}</span>
          {d.sublabel ? <span className="kp-flownode__sub">{d.sublabel}</span> : null}
        </span>
      </div>
      {children.length > 0 && renderEmbed ? (
        <div className="kp-flownode__embed">{children.map((name) => <div key={name}>{renderEmbed(name)}</div>)}</div>
      ) : null}
      <Handle type="source" position={Position.Right} className="kp-flownode__handle" />
    </div>
  );
}

const nodeTypes = { kpNode: KpNode };

const BG_VARIANT: Record<string, BackgroundVariant | undefined> = {
  dots: BackgroundVariant.Dots,
  lines: BackgroundVariant.Lines,
  cross: BackgroundVariant.Cross,
  none: undefined,
};

function toNodes(nodes: FlowNode[], options: Record<string, unknown>): Node[] {
  const accent = str(options.nodeColor, "#6366f1");
  const radius = num(options.nodeRadius, 14);
  return nodes.map((nodeDef, i) => ({
    id: nodeDef.id,
    type: "kpNode",
    position: { x: num(nodeDef.x, (i % 4) * 220), y: num(nodeDef.y, Math.floor(i / 4) * 150) },
    data: {
      label: nodeDef.label ?? nodeDef.id,
      sublabel: nodeDef.sublabel,
      icon: nodeDef.icon,
      color: nodeDef.color,
      accent,
      radius,
      children: nodeDef.children,
    } satisfies KpNodeData,
  }));
}

function toEdges(edges: FlowEdge[], options: Record<string, unknown>): Edge[] {
  const raw = str(options.edgeType, "smoothstep");
  const type = raw === "bezier" ? "default" : raw;
  const animated = bool(options.animated, true);
  const stroke = str(options.edgeColor, "#64748b");
  return edges.map((e) => ({
    id: e.id ?? `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
    label: e.label,
    type,
    animated: e.animated ?? animated,
    style: { stroke, strokeWidth: 1.5 },
    labelStyle: { fill: "#cbd5e1", fontSize: 11 },
    labelBgStyle: { fill: "#12121a", fillOpacity: 0.75 },
  }));
}

export interface FlowViewProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  options: Record<string, unknown>;
  onNodesPersist?: (nodes: FlowNode[]) => void;
  /** Render an embedded component by name (provided by ComponentRenderer). */
  renderEmbed?: (name: string) => ReactNode;
}

export default function FlowView({ nodes, edges, options, onNodesPersist, renderEmbed }: FlowViewProps) {
  const nodesKey =
    JSON.stringify(nodes) + str(options.nodeColor, "") + num(options.nodeRadius, 14);
  const edgesKey =
    JSON.stringify(edges) + str(options.edgeType, "") + bool(options.animated, true) + str(options.edgeColor, "");
  const [rfNodes, setRfNodes] = useState<Node[]>(() => toNodes(nodes, options));
  const [rfEdges, setRfEdges] = useState<Edge[]>(() => toEdges(edges, options));
  useEffect(() => setRfNodes(toNodes(nodes, options)), [nodesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setRfEdges(toEdges(edges, options)), [edgesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hover-sync: highlight a node's connected neighbourhood, dim the rest.
  const [hoverId, setHoverId] = useState<string | null>(null);
  const neighbourhood = useMemo(() => {
    if (!hoverId) return null;
    const ids = new Set<string>([hoverId]);
    for (const e of rfEdges) {
      if (e.source === hoverId) ids.add(e.target);
      if (e.target === hoverId) ids.add(e.source);
    }
    return ids;
  }, [hoverId, rfEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setRfNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );
  const persist = useCallback(() => {
    onNodesPersist?.(
      rfNodes.map((n) => {
        const nd = n.data as KpNodeData;
        return {
          id: n.id,
          label: nd.label,
          sublabel: nd.sublabel,
          icon: nd.icon,
          color: nd.color,
          children: nd.children,
          x: Math.round(n.position.x),
          y: Math.round(n.position.y),
        };
      }),
    );
  }, [rfNodes, onNodesPersist]);

  // Card-scoped sync so embedded charts hover-link across nodes (Phase-2 mechanism).
  const [syncHover, setSyncHover] = useState<string | null>(null);
  const [syncFilter, setSyncFilter] = useState<string | null>(null);
  const sync: CardSync = useMemo(
    () => ({
      syncField: str(options.syncField, "") || null,
      hoverValue: syncHover,
      setHoverValue: setSyncHover,
      filterValue: syncFilter,
      setFilterValue: setSyncFilter,
    }),
    [options.syncField, syncHover, syncFilter],
  );

  const interactive = bool(options.interactive, true);

  const displayNodes = neighbourhood
    ? rfNodes.map((n) => ({ ...n, data: { ...n.data, dimmed: !neighbourhood.has(n.id) } }))
    : rfNodes;
  const displayEdges = neighbourhood
    ? rfEdges.map((e) => ({
        ...e,
        style: { ...e.style, opacity: neighbourhood.has(e.source) && neighbourhood.has(e.target) ? 1 : 0.12 },
      }))
    : rfEdges;

  return (
    <div className="kp-flow">
      <FlowEmbedContext.Provider value={renderEmbed ?? null}>
        <CardSyncContext.Provider value={sync}>
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={persist}
            onNodeMouseEnter={(_, node) => interactive && setHoverId(node.id)}
            onNodeMouseLeave={() => setHoverId(null)}
            fitView={bool(options.fitView, true)}
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={interactive}
            nodesConnectable={false}
            elementsSelectable={interactive}
            panOnDrag={interactive}
            zoomOnScroll={interactive}
            zoomOnPinch={interactive}
            minZoom={0.2}
            maxZoom={2}
          >
            {BG_VARIANT[str(options.background, "dots")] && (
              <Background variant={BG_VARIANT[str(options.background, "dots")]} gap={18} size={1} color="#2a2a3e" />
            )}
            {bool(options.controls, true) && <Controls showInteractive={false} />}
            {bool(options.minimap, false) && (
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) => (n.data as KpNodeData)?.color ?? str(options.nodeColor, "#6366f1")}
                maskColor="rgba(10,10,15,0.6)"
              />
            )}
          </ReactFlow>
        </CardSyncContext.Provider>
      </FlowEmbedContext.Provider>
    </div>
  );
}
