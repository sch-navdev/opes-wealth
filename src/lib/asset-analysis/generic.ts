import { annualisedVolatility, changeOver, maxDrawdown, type Change, type Drawdown, type DatedValue } from "./common";

export type GenericAnalysis = {
  change: Change | null;
  drawdown: Drawdown | null;
  volatility: number | null;
  high: DatedValue | null;
  low: DatedValue | null;
  observations: number;
};

/** Value-history analysis for any asset with a recorded history (the fallback for categories without their own view). */
export function genericAnalysis(history: DatedValue[]): GenericAnalysis {
  const pick = (better: (a: number, b: number) => boolean) => history.reduce<DatedValue | null>((m, p) => (m == null || better(p.value, m.value) ? p : m), null);
  return {
    change: changeOver(history),
    drawdown: maxDrawdown(history),
    volatility: annualisedVolatility(history),
    high: pick((a, b) => a > b),
    low: pick((a, b) => a < b),
    observations: history.length,
  };
}
