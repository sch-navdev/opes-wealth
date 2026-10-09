import { fineTroyOunces, toTroyOunces, type PreciousMetalMetadata } from "@/lib/precious-metals";
import { changeOver, isNum, type Change, type DatedValue } from "./common";

const GRAMS_PER_TROY_OUNCE = 31.1034768;

export type MetalAnalysis = {
  /** Total gross weight of the holding in grams (pieces x weight per piece). Null without a weight. */
  grossGrams: number | null;
  /** Pure-metal troy ounces (gross x purity). */
  fineOunces: number | null;
  /** Last spot price per troy ounce (asset currency), or null when never priced. */
  spot: number | null;
  /** Fine ounces x spot. */
  spotValue: number | null;
  /** Holding value minus spot value: what is paid above (positive) or below (negative) the metal itself. */
  premiumAmount: number | null;
  /** premiumAmount / spotValue, fraction. */
  premiumPct: number | null;
  /** The premium percentage typed in the form, as a fraction (the value uses it). */
  statedPremiumPct: number | null;
  /** Value / fine ounce, in the asset currency. */
  pricePerFineOunce: number | null;
  sinceFirstRecord: Change | null;
};

/** Weight, spot versus value and premium of a precious-metal holding. Informational only. */
export function metalAnalysis(input: { metadata: PreciousMetalMetadata; quantity: number; currentValue: number; history: DatedValue[] }): MetalAnalysis {
  const { metadata, quantity, currentValue, history } = input;
  const fine = fineTroyOunces(metadata, quantity);
  const hasWeight = fine > 0;
  const grossGrams = metadata.weight_per_unit && metadata.weight_per_unit > 0 && quantity > 0 ? toTroyOunces(metadata.weight_per_unit, metadata.weight_unit) * GRAMS_PER_TROY_OUNCE * quantity : null;
  const spot = isNum(metadata.last_spot_price) && metadata.last_spot_price > 0 ? metadata.last_spot_price : null;
  const spotValue = hasWeight && spot != null ? fine * spot : null;
  const premiumAmount = spotValue != null && currentValue > 0 ? currentValue - spotValue : null;
  return {
    grossGrams,
    fineOunces: hasWeight ? fine : null,
    spot,
    spotValue,
    premiumAmount,
    premiumPct: premiumAmount != null && spotValue != null && spotValue > 0 ? premiumAmount / spotValue : null,
    statedPremiumPct: isNum(metadata.premium_pct) ? metadata.premium_pct / 100 : null,
    pricePerFineOunce: hasWeight && currentValue > 0 ? currentValue / fine : null,
    sinceFirstRecord: changeOver(history),
  };
}
