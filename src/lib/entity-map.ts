/**
 * Entity node map (phase A): the look-through tree drawn as a graph,
 * owner -> entity -> sub-entity / held asset or loan.
 *
 * DERIVED DATA ONLY: this module reads an `EntityLookthrough` (already built from the user's rows) and
 * produces React Flow compatible nodes and edges plus a deterministic layered layout. It stores nothing,
 * changes no value and needs no migration. Every amount is the same Base Currency net-worth contribution
 * the look-through tree shows, so the map reconciles with it and with net worth:
 *   Σ entity own values + Σ held-asset values + personal node = net worth (see `mapTotals`).
 *
 * Node ids: `owner`, `personal`, `ent:<id>`, `hold:<entityId>:<assetId>`. The module has no dependency on
 * React Flow (the canvas component casts these plain objects), so it is testable in plain node.
 *
 * Layout: columns by depth (owner 0, top-level entities and the personal node 1, an entity's sub-entities
 * and holdings one column further right), rows by leaf order, parents centred on their children. In
 * right-to-left mode the x axis is mirrored. No layout library.
 */
import type { CompanyEntityType } from "@/lib/companies";
import {
  COMPANIES_CATEGORY,
  type EntityLookthrough,
  type LookthroughAssetRow,
  type LookthroughEntity,
} from "@/lib/entity-lookthrough";

export const MAP_NODE_WIDTH = 220;
export const MAP_NODE_HEIGHT = 72;
const COLUMN_GAP = 90;
const ROW_GAP = 22;
export const MAP_COLUMN_STEP = MAP_NODE_WIDTH + COLUMN_GAP;
export const MAP_ROW_STEP = MAP_NODE_HEIGHT + ROW_GAP;

export type EntityMapNodeKind = "owner" | "entity" | "holding" | "personal";

export type EntityMapNodeData = {
  kind: EntityMapNodeKind;
  /** Display name; empty for the owner and personal nodes (the component supplies a translated label). */
  name: string;
  /**
   * Base Currency value: entity = look-through subtotal, holding = its net-worth contribution (negative for a
   * loan), personal = held personally, owner = net worth. `null` when unknown: show an en dash, never 0.
   */
  value: number | null;
  /** Entities only: the entity's own recorded stake (the part of `value` that is not a holding or sub-entity). */
  ownValue: number | null;
  /** Entities only: recorded effective ownership, percent. */
  ownershipPercentage: number | null;
  entityType: CompanyEntityType | null;
  /** Holdings: asset class (`asset_categories.name`). */
  category: string | null;
  isLiability: boolean;
  /** Entities: sub-entities + holdings; owner: top-level entities; personal: number of personal assets (or null if unknown). */
  childCount: number | null;
};

export type EntityMapNode = {
  id: string;
  type: EntityMapNodeKind;
  position: { x: number; y: number };
  data: EntityMapNodeData;
  width: number;
  height: number;
};

export type EntityMapEdge = { id: string; source: string; target: string };

export type EntityMapSummary = {
  entities: number;
  /** Held assets (non-loan holdings), counted under entities only. */
  assets: number;
  loans: number;
  /** Links dropped because an entity would appear twice (a cycle or a duplicated branch in the input). */
  refused: number;
};

export type EntityMap = {
  nodes: EntityMapNode[];
  edges: EntityMapEdge[];
  summary: EntityMapSummary;
  /** Bounding box of the layout, for the text summary / fit. */
  bounds: { width: number; height: number };
};

/** `null` for a missing or non-finite number so the UI can print an en dash instead of 0 / NaN. */
export function finiteOrNull(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export const MISSING_VALUE = "–"; // en dash

/** Format a possibly-missing amount: the en dash for unknown values, otherwise the formatter's output. */
export function formatMapValue(value: number | null, format: (n: number) => string): string {
  return value === null ? MISSING_VALUE : format(value);
}

export function buildEntityMap(
  lookthrough: EntityLookthrough,
  options: { rtl?: boolean; assets?: LookthroughAssetRow[] } = {},
): EntityMap {
  const sign = options.rtl ? -1 : 1;
  const empty: EntityMap = {
    nodes: [],
    edges: [],
    summary: { entities: 0, assets: 0, loans: 0, refused: 0 },
    bounds: { width: 0, height: 0 },
  };
  if (lookthrough.roots.length === 0) return empty;

  const nodes: EntityMapNode[] = [];
  const edges: EntityMapEdge[] = [];
  const summary: EntityMapSummary = { entities: 0, assets: 0, loans: 0, refused: 0 };
  const seen = new Set<string>(); // entity ids already placed: refuses cycles and duplicated branches
  let nextRow = 0;

  const make = (id: string, kind: EntityMapNodeKind, level: number, row: number, data: Partial<EntityMapNodeData>) => {
    const node: EntityMapNode = {
      id,
      type: kind,
      position: { x: sign * level * MAP_COLUMN_STEP, y: row * MAP_ROW_STEP },
      width: MAP_NODE_WIDTH,
      height: MAP_NODE_HEIGHT,
      data: {
        kind,
        name: "",
        value: null,
        ownValue: null,
        ownershipPercentage: null,
        entityType: null,
        category: null,
        isLiability: false,
        childCount: null,
        ...data,
      },
    };
    nodes.push(node);
    return node;
  };

  /** Places an entity subtree; returns the entity node's row (fractional), or null when refused. */
  const place = (entity: LookthroughEntity, level: number, parentId: string): number | null => {
    if (seen.has(entity.id)) {
      summary.refused += 1;
      return null;
    }
    seen.add(entity.id);
    summary.entities += 1;
    const id = `ent:${entity.id}`;
    // Reserve the node's slot in the nodes array so parents precede children (stable ordering).
    const node = make(id, "entity", level, 0, {
      name: entity.name,
      value: finiteOrNull(entity.subtotal),
      ownValue: finiteOrNull(entity.ownValue),
      ownershipPercentage: finiteOrNull(entity.ownershipPercentage),
      entityType: entity.entityType,
      childCount: entity.children.length + entity.holdings.length,
    });
    edges.push({ id: `${parentId}->${id}`, source: parentId, target: id });

    const childRows: number[] = [];
    for (const child of entity.children) {
      const r = place(child, level + 1, id);
      if (r !== null) childRows.push(r);
    }
    for (const h of entity.holdings) {
      const hid = `hold:${entity.id}:${h.id}`;
      const row = nextRow++;
      make(hid, "holding", level + 1, row, {
        name: h.name,
        value: finiteOrNull(h.value),
        category: h.category,
        isLiability: h.isLiability,
      });
      edges.push({ id: `${id}->${hid}`, source: id, target: hid });
      if (h.isLiability) summary.loans += 1;
      else summary.assets += 1;
      childRows.push(row);
    }
    let row: number;
    if (childRows.length === 0) row = nextRow++;
    else row = (Math.min(...childRows) + Math.max(...childRows)) / 2;
    node.position.y = row * MAP_ROW_STEP;
    return row;
  };

  const ownerNode = make("owner", "owner", 0, 0, {
    value: finiteOrNull(lookthrough.netWorth),
    childCount: lookthrough.roots.length,
  });
  const topRows: number[] = [];
  for (const root of lookthrough.roots) {
    const r = place(root, 1, "owner");
    if (r !== null) topRows.push(r);
  }

  // Everything the user holds directly (not through an entity), as one aggregated node so the map totals
  // reconcile with net worth without drawing every personal asset.
  const personalRow = nextRow++;
  const personalCount = options.assets
    ? options.assets.filter((a) => a.category !== COMPANIES_CATEGORY && !(a.id in lookthrough.holderByAssetId)).length
    : null;
  make("personal", "personal", 1, personalRow, {
    value: finiteOrNull(lookthrough.heldPersonally),
    childCount: personalCount,
  });
  edges.push({ id: "owner->personal", source: "owner", target: "personal" });
  topRows.push(personalRow);

  ownerNode.position.y = ((Math.min(...topRows) + Math.max(...topRows)) / 2) * MAP_ROW_STEP;

  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const bounds = {
    width: Math.max(...xs) - Math.min(...xs) + MAP_NODE_WIDTH,
    height: Math.max(...ys) - Math.min(...ys) + MAP_NODE_HEIGHT,
  };
  return { nodes, edges, summary, bounds };
}

/**
 * Totals recomputed from the nodes alone (independent of the builder), for the reconciliation invariant:
 * `entityOwn + holdings + personal === netWorth` and `entityOwn + holdings === heldThroughStructures`.
 * Unknown (null) values are skipped and counted in `unknown`.
 */
export function mapTotals(map: EntityMap): {
  entityOwn: number;
  holdings: number;
  personal: number;
  total: number;
  structuresTotal: number;
  unknown: number;
} {
  let entityOwn = 0;
  let holdings = 0;
  let personal = 0;
  let unknown = 0;
  for (const n of map.nodes) {
    const d = n.data;
    if (d.kind === "entity") {
      if (d.ownValue === null) unknown += 1;
      else entityOwn += d.ownValue;
    } else if (d.kind === "holding") {
      if (d.value === null) unknown += 1;
      else holdings += d.value;
    } else if (d.kind === "personal") {
      if (d.value === null) unknown += 1;
      else personal += d.value;
    }
  }
  return { entityOwn, holdings, personal, total: entityOwn + holdings + personal, structuresTotal: entityOwn + holdings, unknown };
}
