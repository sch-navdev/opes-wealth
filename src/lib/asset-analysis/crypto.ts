import type { CryptoMetadata } from "@/lib/crypto";
import { annualisedVolatility, changeOver, daysBetween, isNum, maxDrawdown, type Change, type Drawdown, type DatedValue } from "./common";

export type CryptoAnalysis = {
  /** Last quote, else value / quantity. */
  unitPrice: number | null;
  /** The purchase price is not stored for crypto holdings, so no cost basis or P/L can be computed. */
  costBasis: null;
  /** First recorded value to the latest one (includes quantity changes such as a wallet sync). */
  sinceFirstRecord: Change | null;
  drawdown: Drawdown | null;
  /** Annualised volatility of the recorded value, fraction. */
  volatility: number | null;
  high: DatedValue | null;
  low: DatedValue | null;
  daysHeld: number | null;
  observations: number;
};

/** Value-only analysis of a crypto holding from its recorded history (no purchase price is stored). */
export function cryptoAnalysis(input: {
  quantity: number;
  currentValue: number;
  metadata: CryptoMetadata;
  history: DatedValue[];
  purchaseDate: string | null | undefined;
  today: string;
}): CryptoAnalysis {
  const { quantity, currentValue, metadata, history, purchaseDate, today } = input;
  const unitPrice = isNum(metadata.last_unit_price) && metadata.last_unit_price > 0 ? metadata.last_unit_price : quantity > 0 && currentValue > 0 ? currentValue / quantity : null;
  const pick = (better: (a: number, b: number) => boolean) => history.reduce<DatedValue | null>((m, p) => (m == null || better(p.value, m.value) ? p : m), null);
  return {
    unitPrice,
    costBasis: null,
    sinceFirstRecord: changeOver(history),
    drawdown: maxDrawdown(history),
    volatility: annualisedVolatility(history),
    high: pick((a, b) => a > b),
    low: pick((a, b) => a < b),
    daysHeld: purchaseDate ? Math.max(0, daysBetween(purchaseDate, today)) : null,
    observations: history.length,
  };
}
