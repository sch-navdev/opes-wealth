import { convertAmount } from "@/lib/fx";
import type { AnalysisPortfolio } from "./common";

export type PositionShare = {
  /** Share of the viewer's total assets, fraction. */
  ofPortfolio: number | null;
  /** Share of the viewer's holdings in the same asset class, fraction. */
  ofCategory: number | null;
};

/** The asset's share of the portfolio and of its class; null when the portfolio figures are not available. */
export function positionShare(input: {
  value: number;
  currency: string;
  portfolio: AnalysisPortfolio | null | undefined;
  ratesFromUsd: Record<string, number>;
}): PositionShare {
  const { value, currency, portfolio } = input;
  if (!portfolio || !Number.isFinite(value) || value <= 0) return { ofPortfolio: null, ofCategory: null };
  const inBase = convertAmount(value, currency, portfolio.currency, input.ratesFromUsd);
  const frac = (total: number) => (total > 0 ? Math.min(1, inBase / total) : null);
  return { ofPortfolio: frac(portfolio.totalAssets), ofCategory: frac(portfolio.categoryTotal) };
}
