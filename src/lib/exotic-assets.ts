/**
 * Metadata for the "Exotic Assets" category (collectibles that trade on a
 * secondary market), stored in `assets.metadata` — the same jsonb-per-category
 * pattern as `lib/precious-metals.ts`. One flat shape with a `kind`
 * discriminator; each kind uses its own subset of fields:
 *
 *  - `watch`  brand, model, reference, year, condition, box & papers (live
 *             valuation: `lib/assets/watch-valuation.ts`)
 *  - `wine`   producer/château, vintage, region/appellation; `assets.quantity`
 *             = number of bottles
 *  - `art`    artist/creator, title, year, medium/category
 *
 * (Gold/silver/platinum are NOT a kind here: they already have their own
 * "Precious Metals" category with live spot pricing — see `lib/precious-metals.ts`.)
 *
 * `assets.current_value` = what the holding is worth now (typed by hand, or for
 * watches refreshed from a market API); `purchase_price` is what was paid PER
 * UNIT (per watch / bottle / artwork). Compared by `exoticGain`.
 */
export type ExoticKind = "watch" | "wine" | "art";
export type WatchCondition = "unworn" | "very_good" | "good" | "fair";
export type WatchBoxPapers = "full_set" | "box_only" | "papers_only" | "none";

export const EXOTIC_KINDS: ExoticKind[] = ["watch", "wine", "art"];
export const WATCH_CONDITIONS: WatchCondition[] = ["unworn", "very_good", "good", "fair"];
export const WATCH_BOX_PAPERS: WatchBoxPapers[] = ["full_set", "box_only", "papers_only", "none"];

export type ExoticAssetMetadata = {
  kind: ExoticKind;
  brand: string;
  model: string;
  /** Manufacturer reference number, e.g. "126610LN" — the best key for a market lookup. */
  reference_number: string;
  /** Year of production. */
  year: number | null;
  condition: WatchCondition;
  box_papers: WatchBoxPapers;
  serial_number: string;
  storage_location: string;
  /** Wine: château / producer. */
  producer: string;
  /** Wine: vintage year. */
  vintage: number | null;
  /** Wine: region / appellation. */
  region: string;
  /** Art: artist or creator. */
  artist: string;
  /** Art: title / name of the work. */
  title: string;
  /** Art: year of creation. */
  art_year: number | null;
  /** Art: medium or category (oil on canvas, sculpture, print…). */
  medium: string;
  /** What was paid, in the asset's currency. */
  purchase_price: number | null;
  /** Last live market valuation (asset currency) and where/when it came from. */
  last_market_value: number | null;
  last_priced_at: string | null;
  last_price_source: string | null;
};

export const EMPTY_EXOTIC_METADATA: ExoticAssetMetadata = {
  kind: "watch",
  brand: "",
  model: "",
  reference_number: "",
  year: null,
  condition: "very_good",
  box_papers: "full_set",
  serial_number: "",
  storage_location: "",
  producer: "",
  vintage: null,
  region: "",
  artist: "",
  title: "",
  art_year: null,
  medium: "",
  purchase_price: null,
  last_market_value: null,
  last_priced_at: null,
  last_price_source: null,
};

export function parseExoticMetadata(raw: unknown): ExoticAssetMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_EXOTIC_METADATA;
  return { ...EMPTY_EXOTIC_METADATA, ...(raw as Partial<ExoticAssetMetadata>) };
}

/** Unmet requirements as translation keys. */
export function getExoticMetadataErrors(metadata: ExoticAssetMetadata): string[] {
  const errors: string[] = [];
  const thisYear = new Date().getFullYear();
  const badYear = (y: number | null, min: number) =>
    y != null && (!Number.isInteger(y) || y < min || y > thisYear + 1);
  if (metadata.kind === "watch") {
    if (!metadata.brand.trim()) errors.push("exotic_brand_required");
    if (!metadata.model.trim()) errors.push("exotic_model_required");
    if (badYear(metadata.year, 1800)) errors.push("exotic_year_invalid");
  } else if (metadata.kind === "wine") {
    if (!metadata.producer.trim()) errors.push("exotic_producer_required");
    if (badYear(metadata.vintage, 1600)) errors.push("exotic_year_invalid");
  } else if (metadata.kind === "art") {
    if (!metadata.title.trim()) errors.push("exotic_title_required");
    if (badYear(metadata.art_year, -3000)) errors.push("exotic_year_invalid");
  }
  if (metadata.purchase_price != null && !(metadata.purchase_price >= 0)) {
    errors.push("exotic_price_invalid");
  }
  return errors;
}

/** Market value vs. purchase price. `null` until a purchase price is on file. */
export function exoticGain(
  marketValue: number,
  purchasePrice: number | null,
): { amount: number; percent: number | null } | null {
  if (purchasePrice == null || !(purchasePrice > 0)) return null;
  const amount = marketValue - purchasePrice;
  return { amount, percent: (amount / purchasePrice) * 100 };
}
