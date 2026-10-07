import { isSectionVisible, type DashboardSection } from "@/lib/dashboard-tiers";
import { EXPERTISE_LEVELS, type ExpertiseLevel } from "@/stores/useUiTierStore";

/**
 * Customisable dashboard: which blocks exist, their defaults, and the pure functions that
 * normalise / edit a saved layout. No React, no I/O. A layout is a UI preference (like the tier
 * itself), never access control: `TierGate` availability still wins, so a block the active tier
 * does not offer is never listed or shown, whatever a saved layout says.
 *
 * A layout is kept PER TIER (Basic, Standard, Professional, Expert each have their own order,
 * hidden set and sizes) inside one container, `DashboardLayouts`, which is what is stored per
 * account (`profiles.dashboard_layout`, migration 0035) and in localStorage as a fallback.
 */

export const BLOCK_SIZES = ["s", "m", "l", "full"] as const;
export type BlockSize = (typeof BLOCK_SIZES)[number];

/** Columns of the 12-column desktop grid each size spans (everything stacks on small screens). */
export const SIZE_SPAN: Record<BlockSize, number> = { s: 4, m: 6, l: 8, full: 12 };

const ALL_SIZES: readonly BlockSize[] = BLOCK_SIZES;
const M_UP: readonly BlockSize[] = ["m", "l", "full"];
const L_UP: readonly BlockSize[] = ["l", "full"];

export type BlockDef = {
  id: string;
  /** i18n key of the block's name (shown in edit mode, announcements and aria labels). */
  labelKey: string;
  /** The TierGate section that decides at which tiers the block is offered. */
  section: DashboardSection;
  defaultSize: BlockSize;
  allowedSizes: readonly BlockSize[];
};

/**
 * The registry, in DEFAULT ORDER (the order the dashboard page always had). The six `expert*`
 * blocks are the individual tiles of the former single `expertPanels` section; the default
 * sizes reproduce its old arrangement (four half-width tiles, two full-width).
 */
const REGISTRY = [
  { id: "fxExposure", section: "fxExposure", defaultSize: "full", allowedSizes: L_UP },
  { id: "basicOverview", section: "basicOverview", defaultSize: "full", allowedSizes: M_UP },
  { id: "bento", section: "bento", defaultSize: "full", allowedSizes: M_UP },
  { id: "quickAdd", section: "quickAdd", defaultSize: "full", allowedSizes: ALL_SIZES },
  { id: "metricCards", section: "metricCards", defaultSize: "full", allowedSizes: M_UP },
  { id: "cashFlow", section: "cashFlow", defaultSize: "full", allowedSizes: M_UP },
  { id: "incomeCalendar", section: "incomeCalendar", defaultSize: "full", allowedSizes: L_UP },
  { id: "csvUpload", section: "csvUpload", defaultSize: "full", allowedSizes: M_UP },
  { id: "futureProjects", section: "futureProjects", defaultSize: "full", allowedSizes: L_UP },
  { id: "analytics", section: "analytics", defaultSize: "full", allowedSizes: L_UP },
  { id: "portfolio", section: "portfolio", defaultSize: "full", allowedSizes: L_UP },
  { id: "expertRaw", section: "expertPanels", defaultSize: "m", allowedSizes: M_UP },
  { id: "expertPrivateEquity", section: "expertPanels", defaultSize: "m", allowedSizes: M_UP },
  { id: "expertTax", section: "expertPanels", defaultSize: "m", allowedSizes: M_UP },
  { id: "expertExposure", section: "expertPanels", defaultSize: "m", allowedSizes: M_UP },
  { id: "expertRatios", section: "expertPanels", defaultSize: "full", allowedSizes: M_UP },
  { id: "expertAttribution", section: "expertPanels", defaultSize: "full", allowedSizes: M_UP },
  { id: "export", section: "export", defaultSize: "full", allowedSizes: M_UP },
] as const satisfies readonly Omit<BlockDef, "labelKey">[];

export type BlockId = (typeof REGISTRY)[number]["id"];

export const BLOCKS: readonly (BlockDef & { id: BlockId })[] = REGISTRY.map((b) => ({
  ...b,
  labelKey: `dlayout_block_${b.id}`,
}));

const BLOCK_BY_ID = new Map<string, BlockDef & { id: BlockId }>(BLOCKS.map((b) => [b.id, b]));

export const BLOCK_IDS: readonly BlockId[] = BLOCKS.map((b) => b.id);

export function isBlockId(value: unknown): value is BlockId {
  return typeof value === "string" && BLOCK_BY_ID.has(value);
}

export function getBlock(id: BlockId): BlockDef & { id: BlockId } {
  return BLOCK_BY_ID.get(id)!;
}

/** Whether `tier` offers the block at all (TierGate rules; the layout can never override this). */
export function isBlockAvailable(id: BlockId, tier: ExpertiseLevel): boolean {
  return isSectionVisible(getBlock(id).section, tier);
}

/** The blocks a tier offers, in default order. */
export function blocksForTier(tier: ExpertiseLevel): (BlockDef & { id: BlockId })[] {
  return BLOCKS.filter((b) => isBlockAvailable(b.id, tier));
}

/** Every tier that offers the block. */
export function tiersOfBlock(id: BlockId): ExpertiseLevel[] {
  return EXPERTISE_LEVELS.filter((tier) => isBlockAvailable(id, tier));
}

/* ---------- one tier's layout ---------- */

export type DashboardLayout = {
  version: 1;
  /** Every block the tier offers, in display order (hidden ones keep their slot). */
  order: BlockId[];
  /** Blocks the user switched off. */
  hidden: BlockId[];
  sizes: Partial<Record<BlockId, BlockSize>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSize(value: unknown): value is BlockSize {
  return typeof value === "string" && (BLOCK_SIZES as readonly string[]).includes(value);
}

/**
 * Turns ANYTHING (null, garbage, an old or hand-edited layout) into a valid layout for `tier`:
 * unknown ids and ids the tier does not offer are dropped, duplicates removed, blocks added since
 * the layout was saved are appended (visible, default size), and sizes the block does not allow
 * fall back to its default. Pure; never throws; never copies keys from the input.
 */
export function normalizeLayout(raw: unknown, tier: ExpertiseLevel): DashboardLayout {
  const input = isRecord(raw) ? raw : {};
  const offered = blocksForTier(tier);
  const offeredIds = new Set<string>(offered.map((b) => b.id));

  const order: BlockId[] = [];
  const seen = new Set<string>();
  if (Array.isArray(input.order)) {
    for (const id of input.order) {
      if (typeof id === "string" && offeredIds.has(id) && !seen.has(id)) {
        seen.add(id);
        order.push(id as BlockId);
      }
    }
  }
  for (const block of offered) {
    if (!seen.has(block.id)) order.push(block.id);
  }

  const hiddenInput = Array.isArray(input.hidden) ? input.hidden : [];
  const hidden = order.filter((id) => hiddenInput.includes(id));

  const sizesInput = isRecord(input.sizes) ? input.sizes : {};
  const sizes: Partial<Record<BlockId, BlockSize>> = {};
  for (const id of order) {
    const block = getBlock(id);
    const wanted = Object.prototype.hasOwnProperty.call(sizesInput, id) ? sizesInput[id] : undefined;
    sizes[id] = isSize(wanted) && block.allowedSizes.includes(wanted) ? wanted : block.defaultSize;
  }

  return { version: 1, order, hidden, sizes };
}

/** The layout that reproduces the page as it was before it became customisable. */
export function defaultLayout(tier: ExpertiseLevel): DashboardLayout {
  return normalizeLayout(null, tier);
}

export function sizeOf(layout: DashboardLayout, id: BlockId): BlockSize {
  return layout.sizes[id] ?? getBlock(id).defaultSize;
}

export function isHidden(layout: DashboardLayout, id: BlockId): boolean {
  return layout.hidden.includes(id);
}

/** Moves a block to position `toIndex` (clamped) in the order; the others shift. Unknown id -> unchanged. */
export function moveBlock(layout: DashboardLayout, id: BlockId, toIndex: number): DashboardLayout {
  const from = layout.order.indexOf(id);
  if (from === -1 || !Number.isFinite(toIndex)) return layout;
  const to = Math.min(Math.max(Math.trunc(toIndex), 0), layout.order.length - 1);
  if (to === from) return layout;
  const order = layout.order.slice();
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { ...layout, order };
}

/** Moves a block one slot (or `delta` slots) up (negative) or down (positive). */
export function moveBlockBy(layout: DashboardLayout, id: BlockId, delta: number): DashboardLayout {
  const from = layout.order.indexOf(id);
  return from === -1 ? layout : moveBlock(layout, id, from + delta);
}

/** Flips a block between active and inactive. Unknown id -> unchanged. */
export function toggleBlock(layout: DashboardLayout, id: BlockId): DashboardLayout {
  if (!layout.order.includes(id)) return layout;
  const hidden = isHidden(layout, id) ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id];
  return { ...layout, hidden: layout.order.filter((o) => hidden.includes(o)) };
}

/** Sets a block's size; a size the block does not allow (or an unknown id) leaves the layout unchanged. */
export function resizeBlock(layout: DashboardLayout, id: BlockId, size: BlockSize): DashboardLayout {
  if (!layout.order.includes(id) || !isSize(size) || !getBlock(id).allowedSizes.includes(size)) return layout;
  if (layout.sizes[id] === size) return layout;
  return { ...layout, sizes: { ...layout.sizes, [id]: size } };
}

/** The blocks to render in normal mode: offered by the tier, not switched off, in order. */
export function visibleBlocks(layout: DashboardLayout, tier: ExpertiseLevel): BlockId[] {
  return layout.order.filter((id) => isBlockAvailable(id, tier) && !layout.hidden.includes(id));
}

export function layoutsEqual(a: DashboardLayout, b: DashboardLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ---------- all tiers: what is stored per account ---------- */

export type DashboardLayouts = {
  version: 1;
  tiers: Partial<Record<ExpertiseLevel, DashboardLayout>>;
};

/** Upper bound for the serialised container; the database CHECK (migration 0035) uses a looser one. */
export const MAX_LAYOUTS_JSON_CHARS = 8192;

export function emptyLayouts(): DashboardLayouts {
  return { version: 1, tiers: {} };
}

/** Validates the stored container. Anything unusable -> empty (every tier then uses its default). */
export function normalizeLayouts(raw: unknown): DashboardLayouts {
  if (!isRecord(raw) || !isRecord(raw.tiers)) return emptyLayouts();
  const tiers: DashboardLayouts["tiers"] = {};
  for (const tier of EXPERTISE_LEVELS) {
    if (Object.prototype.hasOwnProperty.call(raw.tiers, tier) && isRecord(raw.tiers[tier])) {
      tiers[tier] = normalizeLayout(raw.tiers[tier], tier);
    }
  }
  return { version: 1, tiers };
}

/** The layout to use for `tier`: the saved one (normalised) or the default. */
export function layoutForTier(layouts: DashboardLayouts | null | undefined, tier: ExpertiseLevel): DashboardLayout {
  return layouts?.tiers[tier] ? normalizeLayout(layouts.tiers[tier], tier) : defaultLayout(tier);
}

/** A copy of `layouts` with `tier`'s layout replaced (normalised). */
export function withTierLayout(
  layouts: DashboardLayouts | null | undefined,
  tier: ExpertiseLevel,
  layout: DashboardLayout,
): DashboardLayouts {
  return { version: 1, tiers: { ...(layouts?.tiers ?? {}), [tier]: normalizeLayout(layout, tier) } };
}

/** Whether the serialised container fits the size limit. */
export function layoutsFitLimit(layouts: DashboardLayouts): boolean {
  return JSON.stringify(layouts).length <= MAX_LAYOUTS_JSON_CHARS;
}
