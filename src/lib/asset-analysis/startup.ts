import { sortedRounds, startupCostBasis, startupValuation, type StartupMetadata } from "@/lib/startups";
import { isNum } from "./common";

export type RoundRow = {
  id: string;
  date: string;
  name: string;
  pricePerShare: number;
  /** Price / previous round price, e.g. 2 = doubled. Null for the first round. */
  stepUp: number | null;
  postMoney: number | null;
  /** Holding's share of the company right after the round: shares x price / post-money. Null without post-money. */
  ownership: number | null;
  /** Value of the holding at that round's price. */
  holdingValue: number;
};

export type StartupAnalysis = {
  rounds: RoundRow[];
  costBasis: number;
  value: number;
  /** value / cost basis (multiple of money), null without a cost basis. */
  multiple: number | null;
  /** Latest round price / average cost per share. */
  priceMultiple: number | null;
  /** Latest post-money valuation of the company. */
  latestPostMoney: number | null;
  /**
   * Relative change of the holding's ownership between the first and last rounds that both have a post-money
   * valuation (negative = diluted). The number of shares is assumed unchanged.
   */
  dilution: number | null;
};

/** Round history, step-ups, implied valuation multiple and dilution of a startup holding. Pure. */
export function startupAnalysis(metadata: StartupMetadata, shares: number): StartupAnalysis {
  const sorted = sortedRounds(metadata.funding_rounds);
  const optionMode = metadata.investment_type === "bspce_options";
  const strike = metadata.avg_cost_per_share ?? 0;
  const rounds: RoundRow[] = sorted.map((r, i) => {
    const prev = sorted[i - 1];
    const pm = isNum(r.post_money_valuation) && r.post_money_valuation > 0 ? r.post_money_valuation : null;
    return {
      id: r.id,
      date: r.date,
      name: r.name,
      pricePerShare: r.price_per_share,
      stepUp: prev && prev.price_per_share > 0 ? r.price_per_share / prev.price_per_share : null,
      postMoney: pm,
      ownership: pm != null && shares > 0 ? (shares * r.price_per_share) / pm : null,
      holdingValue: shares * (optionMode ? Math.max(0, r.price_per_share - strike) : r.price_per_share),
    };
  });
  const costBasis = startupCostBasis(metadata, shares);
  const value = startupValuation(metadata, shares);
  const last = sorted[sorted.length - 1];
  const withOwn = rounds.filter((r) => r.ownership != null);
  const firstOwn = withOwn[0];
  const lastOwn = withOwn[withOwn.length - 1];
  return {
    rounds,
    costBasis,
    value,
    multiple: costBasis > 0 ? value / costBasis : null,
    priceMultiple: last && strike > 0 && !optionMode ? last.price_per_share / strike : null,
    latestPostMoney: [...rounds].reverse().find((r) => r.postMoney != null)?.postMoney ?? null,
    dilution: withOwn.length >= 2 && firstOwn.ownership! > 0 ? lastOwn.ownership! / firstOwn.ownership! - 1 : null,
  };
}
