/**
 * Metadata shape for the "Precious Metals" asset category (gold / silver /
 * platinum bars and coins), stored in `assets.metadata` — same
 * jsonb-per-category pattern as `lib/vehicles.ts` / `lib/crypto.ts`.
 *
 * Model: `assets.quantity` is the NUMBER OF PIECES (bars or coins), each
 * weighing `weight_per_unit` `weight_unit` at `purity` fineness. Its value is
 * pure-metal weight × spot price (per troy ounce, the market convention) ×
 * quantity, plus an optional dealer `premium_pct` over spot — what physical
 * metal actually trades at. `assets.current_value` holds that total, written
 * by the "Refresh spot price" action (`refreshMetalPrice`).
 */
export type MetalType = "gold" | "silver" | "platinum";
export type MetalForm = "bar" | "coin";
export type WeightUnit = "g" | "kg" | "oz";

export type PreciousMetalMetadata = {
  metal: MetalType;
  form: MetalForm;
  /** Weight of ONE bar/coin, in `weight_unit` (`oz` = troy ounce). */
  weight_per_unit: number | null;
  weight_unit: WeightUnit;
  /** Fineness 0–1, e.g. 0.999 or 0.9999 for bars, 0.9167 for a 22k coin. */
  purity: number;
  /** Dealer/mint premium over spot, in percent (0 = valued at spot). */
  premium_pct: number | null;
  /** Where it's stored (vault, safe, custodian) — free text. */
  storage_location: string;
  serial_number: string;
  /** Last spot price per troy ounce, in the asset's own currency (no premium). */
  last_spot_price: number | null;
  last_priced_at: string | null;
  last_price_source: string | null;
};

export const EMPTY_PRECIOUS_METAL_METADATA: PreciousMetalMetadata = {
  metal: "gold",
  form: "bar",
  weight_per_unit: null,
  weight_unit: "oz",
  purity: 0.999,
  premium_pct: null,
  storage_location: "",
  serial_number: "",
  last_spot_price: null,
  last_priced_at: null,
  last_price_source: null,
};

export const METAL_TYPES: MetalType[] = ["gold", "silver", "platinum"];
export const METAL_FORMS: MetalForm[] = ["bar", "coin"];
export const WEIGHT_UNITS: WeightUnit[] = ["g", "kg", "oz"];

/** Typical fineness per metal, used to prefill the Purity field. */
export const DEFAULT_PURITY: Record<MetalType, number> = {
  gold: 0.9999,
  silver: 0.999,
  platinum: 0.9995,
};

/** Yahoo Finance front-month futures — the spot proxy used by the pricing action (USD per troy ounce). */
export const METAL_YAHOO_SYMBOL: Record<MetalType, string> = {
  gold: "GC=F",
  silver: "SI=F",
  platinum: "PL=F",
};

const GRAMS_PER_TROY_OUNCE = 31.1034768;

export function parsePreciousMetalMetadata(raw: unknown): PreciousMetalMetadata {
  if (!raw || typeof raw !== "object") return EMPTY_PRECIOUS_METAL_METADATA;
  return { ...EMPTY_PRECIOUS_METAL_METADATA, ...(raw as Partial<PreciousMetalMetadata>) };
}

/** Converts a weight in `unit` to troy ounces (`oz` is already troy). */
export function toTroyOunces(weight: number, unit: WeightUnit): number {
  if (unit === "oz") return weight;
  if (unit === "kg") return (weight * 1000) / GRAMS_PER_TROY_OUNCE;
  return weight / GRAMS_PER_TROY_OUNCE;
}

/** Pure-metal troy ounces in the whole holding: pieces × weight × purity. */
export function fineTroyOunces(metadata: PreciousMetalMetadata, quantity: number): number {
  if (!metadata.weight_per_unit || !(metadata.weight_per_unit > 0)) return 0;
  return toTroyOunces(metadata.weight_per_unit, metadata.weight_unit) * metadata.purity * quantity;
}

/** Holding value at a given spot price per troy ounce (asset currency), premium included. */
export function calculateMetalValue(
  metadata: PreciousMetalMetadata,
  quantity: number,
  spotPerTroyOunce: number,
): number {
  const premium = 1 + (metadata.premium_pct ?? 0) / 100;
  return fineTroyOunces(metadata, quantity) * spotPerTroyOunce * premium;
}

/** Every unmet requirement, as translation keys (same pattern as `getVehicleMetadataErrors`). */
export function getPreciousMetalErrors(metadata: PreciousMetalMetadata): string[] {
  const errors: string[] = [];
  if (!metadata.weight_per_unit || !(metadata.weight_per_unit > 0)) {
    errors.push("metal_weight_required");
  }
  if (!(metadata.purity > 0 && metadata.purity <= 1)) errors.push("metal_purity_invalid");
  if (metadata.premium_pct != null && metadata.premium_pct < -50) {
    errors.push("metal_premium_invalid");
  }
  return errors;
}
