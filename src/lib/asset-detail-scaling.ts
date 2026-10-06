/**
 * Asset detail page: the viewer's share for READ-ONLY display (pure, no I/O).
 *
 * The detail page loads the whole asset (100% values). For a co-owned asset the
 * page must show the viewer's share, like the dashboard does, while every write
 * (edit dialog, valuation entry, expense edit, ...) keeps working on the raw
 * whole-asset values. The "scaled-edit bug" (tracker/Co-Ownership.md) happened
 * when a form prefilled with scaled numbers was saved back: it halved real data.
 *
 * Rule: `displayAsset` / `displayHistory` are for rendering only. Anything that
 * prefills an input or is sent to a server action takes the RAW asset (the edit
 * dialog through `toEditPayload` below, so the choice is explicit and testable).
 */
import { scaleAssetForOwner, scaleHistoryValue } from "@/lib/ownership";

type HistoryLike = { value: number; net_equity: number | null };
type AssetLike = {
  quantity: number;
  current_value: number;
  metadata: Record<string, unknown> | null;
  asset_categories: { name: string } | null;
};

/** A usable 0–1 share factor; anything else (missing owner row, NaN, 0, >1) falls back to 1 (the whole asset). */
export function normalizeShareFactor(f: number | null | undefined): number {
  return typeof f === "number" && Number.isFinite(f) && f > 0 && f <= 1 ? f : 1;
}

/**
 * The viewer's factor for the detail page, from their owner row. The dev
 * mock-auth path is treated like any other session: the page already 404s
 * unless the viewer is the creator or a listed owner, so the factor is valid,
 * and the dashboard applies the same factors under mock auth.
 */
export function viewerShareFactor(opts: { factor: number }): number {
  return normalizeShareFactor(opts.factor);
}

/**
 * Display copies of the asset and its history reduced to the viewer's share.
 * Inputs are never mutated. Factor 1 returns the very same objects.
 */
export function buildDetailDisplay<A extends AssetLike, H extends HistoryLike>(args: {
  asset: A;
  history: H[];
  factor: number;
}): { displayAsset: A; displayHistory: H[] } {
  const f = normalizeShareFactor(args.factor);
  if (f === 1) return { displayAsset: args.asset, displayHistory: args.history };

  const { asset } = args;
  const scaled = scaleAssetForOwner(
    {
      category: asset.asset_categories?.name ?? "",
      quantity: asset.quantity,
      current_value: asset.current_value,
      metadata: asset.metadata,
    },
    f,
  );
  const displayAsset: A = {
    ...asset,
    current_value: scaled.current_value,
    quantity: scaled.quantity,
    metadata: scaled.metadata,
  };
  const displayHistory = args.history.map((h) => ({
    ...h,
    value: scaleHistoryValue(h.value, f),
    net_equity: h.net_equity == null ? h.net_equity : scaleHistoryValue(h.net_equity, f),
  }));
  return { displayAsset, displayHistory };
}

/** Percent label for the share note: 0.5 -> "50", 1/3 -> "33.33" (no trailing zeros). */
export function formatShareLabel(f: number): string {
  return String(Number((normalizeShareFactor(f) * 100).toFixed(2)));
}

/** True when the viewer owns less than the whole asset (the share note is shown). */
export function isPartialShare(f: number): boolean {
  return normalizeShareFactor(f) < 1;
}

type EditableAsset = {
  id: string;
  name: string;
  category_id: string;
  quantity: number;
  current_value: number;
  currency: string;
  metadata: Record<string, unknown> | null;
  images: string[] | null;
  ticker_symbol: string | null;
  purchase_date: string;
};

/**
 * What the edit dialog is prefilled with (and later saves). It takes the RAW
 * whole-asset record, never `displayAsset`: this is the single place that
 * chooses an edit path's source, so a test can pin it and a reviewer can grep it.
 */
export function toEditPayload(raw: EditableAsset): EditableAsset {
  return {
    id: raw.id,
    name: raw.name,
    category_id: raw.category_id,
    quantity: raw.quantity,
    current_value: raw.current_value,
    currency: raw.currency,
    metadata: raw.metadata,
    images: raw.images,
    ticker_symbol: raw.ticker_symbol,
    purchase_date: raw.purchase_date,
  };
}

/**
 * Real Estate "Gross share" / "Net share" / price-per-m2 figures from the DISPLAY
 * (already share-scaled) market value and equity.
 *
 * - Co-owned (factor < 1): the ownership percent is the viewer's co-ownership share and the
 *   amounts are the already-scaled values, NOT multiplied by the legacy per-property
 *   `metadata.ownership[].percentage` again (that would double scale).
 * - Sole owner (factor 1): the legacy behaviour exactly (legacy percent x value).
 * - Price per m2 is a whole-property figure: the scaled value is grossed back up by 1/factor,
 *   because the surface area is never scaled.
 */
export function realEstateShareFigures(args: {
  factor: number;
  legacyPercent: number;
  marketValuation: number;
  netEquity: number;
  surfaceArea: number | null | undefined;
}): { ownershipPercent: number; grossShare: number; netShare: number; valuePerSqm: number | null } {
  const f = normalizeShareFactor(args.factor);
  const partial = f < 1;
  const ownershipPercent = partial ? Number(formatShareLabel(f)) : args.legacyPercent;
  const multiplier = partial ? 1 : args.legacyPercent / 100;
  return {
    ownershipPercent,
    grossShare: multiplier * args.marketValuation,
    netShare: multiplier * args.netEquity,
    valuePerSqm: args.surfaceArea ? args.marketValuation / f / args.surfaceArea : null,
  };
}
