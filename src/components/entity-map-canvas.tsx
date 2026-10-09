"use client";

/**
 * The React Flow canvas of the entity map. Loaded lazily by `entity-map-switcher.tsx` (this file is the only
 * one that imports `@xyflow/react`), so it never reaches the main bundle.
 *
 * Accessibility: the canvas is a pan/zoom visual aid. Nodes and edges are not focusable (no keyboard traps),
 * the wheel does not zoom (so it never traps page scroll; use the zoom buttons or pinch), the node text is
 * hidden from assistive technology and the container carries a summary label. The Tree view has the same
 * information as text and is the accessible default.
 */
import "@xyflow/react/dist/style.css";
import { useMemo, type CSSProperties } from "react";
import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { entityTypeLabelKey } from "@/components/company-fields";
import { useLanguage } from "@/context/language-context";
import { useTx } from "@/components/entity-map-text";
import { usePrivacy } from "@/context/privacy-context";
import { formatMapValue, type EntityMap, type EntityMapNodeData } from "@/lib/entity-map";
import type { TranslationKey } from "@/lib/i18n";
import { PILL_LABEL_KEYS } from "@/lib/portfolio-table-filters";
import { cn } from "@/lib/utils";

type FlowData = EntityMapNodeData & { currency: string };
type FlowNode = Node<FlowData>;

function MapNode({ data, targetPosition, sourcePosition }: NodeProps<FlowNode>) {
  const t = useTx();
  const { t: tStrict, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const formatter = useMemo(() => new Intl.NumberFormat(intlLocale, { style: "currency", currency: data.currency }), [intlLocale, data.currency]);
  const fmt = (n: number | null) => formatMapValue(n, (v) => maskValue(formatter.format(v)));

  let title = data.name;
  let sub = "";
  if (data.kind === "owner") title = t("ent_map_owner");
  else if (data.kind === "personal") {
    title = t("ent_map_personal");
    sub = data.childCount != null ? t("ent_map_personal_count", { n: data.childCount }) : "";
  } else if (data.kind === "entity") {
    const type = tStrict(entityTypeLabelKey(data.entityType ?? "other"));
    sub = data.ownershipPercentage != null ? `${type} · ${data.ownershipPercentage}%` : type;
  } else {
    const key = data.category ? PILL_LABEL_KEYS[data.category] : undefined;
    const cat = key ? tStrict(key as TranslationKey) : (data.category ?? "");
    sub = data.isLiability ? `${t("ent_map_loan")} · ${cat}` : cat;
  }

  return (
    <div
      aria-hidden="true"
      data-kind={data.kind}
      className={cn(
        "h-full w-full overflow-hidden rounded-md border px-3 py-2 text-start",
        data.kind === "owner" && "border-primary bg-primary text-primary-foreground",
        data.kind === "entity" && "border-primary bg-card text-foreground",
        data.kind === "holding" && "border-border bg-card text-foreground",
        data.kind === "personal" && "border-dashed border-primary/70 bg-card text-foreground",
      )}
    >
      <Handle type="target" position={targetPosition ?? Position.Left} isConnectable={false} className="!opacity-0" />
      <p className="truncate text-sm font-medium">{title}</p>
      {sub && <p className={cn("truncate text-xs", data.kind === "owner" ? "opacity-80" : "text-muted-foreground")}>{sub}</p>}
      <p className={cn("truncate font-mono text-sm tabular-nums", data.isLiability && "text-destructive")} dir="ltr">
        {fmt(data.value)}
      </p>
      <Handle type="source" position={sourcePosition ?? Position.Right} isConnectable={false} className="!opacity-0" />
    </div>
  );
}

const nodeTypes = { owner: MapNode, entity: MapNode, holding: MapNode, personal: MapNode };

const THEME_VARS = {
  "--xy-background-color": "transparent",
  "--xy-edge-stroke": "var(--primary)",
  "--xy-edge-stroke-width": "1.5",
  "--xy-controls-button-background-color": "var(--card)",
  "--xy-controls-button-background-color-hover": "var(--accent)",
  "--xy-controls-button-color": "var(--foreground)",
  "--xy-controls-button-border-color": "var(--border)",
  "--xy-attribution-background-color": "transparent",
} as CSSProperties;

export default function EntityMapCanvas({ map, baseCurrency }: { map: EntityMap; baseCurrency: string }) {
  const t = useTx();
  const { dir } = useLanguage();
  const rtl = dir === "rtl";

  const nodes = useMemo<FlowNode[]>(
    () =>
      map.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        width: n.width,
        height: n.height,
        sourcePosition: rtl ? Position.Left : Position.Right,
        targetPosition: rtl ? Position.Right : Position.Left,
        data: { ...n.data, currency: baseCurrency },
        focusable: false,
        draggable: false,
        selectable: false,
        connectable: false,
        // Declared handle positions let React Flow draw the edges without waiting for DOM measurement.
        handles: [
          { type: "target" as const, position: rtl ? Position.Right : Position.Left, x: rtl ? n.width : 0, y: n.height / 2, width: 1, height: 1 },
          { type: "source" as const, position: rtl ? Position.Left : Position.Right, x: rtl ? 0 : n.width, y: n.height / 2, width: 1, height: 1 },
        ],
      })),
    [map.nodes, baseCurrency, rtl],
  );
  const edges = useMemo<Edge[]>(() => map.edges.map((e) => ({ ...e, type: "smoothstep", focusable: false })), [map.edges]);

  const label = t("ent_map_aria", { entities: map.summary.entities, assets: map.summary.assets, loans: map.summary.loans });

  return (
    <div role="group" aria-label={label} data-testid="entity-map-canvas" dir="ltr" className="h-[420px] w-full min-w-0 overflow-hidden rounded-md border border-border bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        style={THEME_VARS}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.15}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        preventScrolling={false}
        panOnDrag
        zoomOnPinch
        zoomOnDoubleClick={false}
        disableKeyboardA11y
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={28} size={1} color="var(--border)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
