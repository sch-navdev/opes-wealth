/**
 * Metadata for the "Startups" asset category (unlisted companies: direct
 * equity, SAFEs, convertible notes, BSPCE / stock options), stored in
 * `assets.metadata` — same jsonb-per-category pattern as `lib/scpi.ts`.
 *
 * Model:
 *  - `assets.quantity` = number of shares (or options) held.
 *  - `avg_cost_per_share` = what was paid per share (strike price for options),
 *    in the asset's currency. Cost basis = shares × average cost.
 *  - `funding_rounds` = the company's priced rounds. The holding is valued at
 *    shares × the price per share of the LATEST round by date; no rounds yet →
 *    valued at cost. `assets.current_value` holds that figure and is rewritten
 *    whenever a round is added or removed (`startup-actions.ts`).
 *  - Options (BSPCE / stock options) carry a strike: their paper value per
 *    share is price − strike (floored at 0) — see `startupValuation`.
 *
 * Not modelled (be aware): dilution of the user's percentage, liquidation
 * preferences, vesting and tax. A SAFE/convertible note is valued at cost
 * until a priced round is entered.
 */
export type StartupInvestmentType = "direct_equity" | "safe" | "convertible_note" | "bspce_options";

export const STARTUP_INVESTMENT_TYPES: StartupInvestmentType[] = [
  "direct_equity",
  "safe",
  "convertible_note",
  "bspce_options",
];

export type FundingRound = {
  id: string;
  /** ISO date the round closed. */
  date: string;
  /** e.g. "Seed", "Series A". */
  name: string;
  /** New price per share (asset currency). */
  price_per_share: number;
  /** Company's post-money valuation (asset currency), informational. */
  post_money_valuation: number | null;
};

export type StartupMetadata = {
  company_name: string;
  sector: string;
  investment_type: StartupInvestmentType;
  avg_cost_per_share: number | null;
  funding_rounds: FundingRound[];
};

export const EMPTY_STARTUP_METADATA: StartupMetadata = {
  company_name: "",
  sector: "",
  investment_type: "direct_equity",
  avg_cost_per_share: null,
  funding_rounds: [],
};

export function parseStartupMetadata(raw: unknown): StartupMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_STARTUP_METADATA;
  const r = raw as Partial<StartupMetadata>;
  return {
    ...EMPTY_STARTUP_METADATA,
    ...r,
    funding_rounds: Array.isArray(r.funding_rounds) ? r.funding_rounds : [],
  };
}

/** Unmet requirements as translation keys. */
export function getStartupMetadataErrors(metadata: StartupMetadata, shares: number): string[] {
  const errors: string[] = [];
  if (!metadata.company_name.trim()) errors.push("startup_company_required");
  if (!(shares > 0)) errors.push("startup_shares_required");
  if (metadata.avg_cost_per_share != null && !(metadata.avg_cost_per_share >= 0)) {
    errors.push("startup_cost_invalid");
  }
  return errors;
}

/** Rounds oldest → newest (stable for equal dates). */
export function sortedRounds(rounds: FundingRound[]): FundingRound[] {
  return [...rounds].sort((a, b) => a.date.localeCompare(b.date));
}

export function latestRound(metadata: StartupMetadata): FundingRound | null {
  const rounds = sortedRounds(metadata.funding_rounds);
  return rounds.length > 0 ? rounds[rounds.length - 1] : null;
}

/** Paper value of ONE share/option at a given price (options: price − strike, never below 0). */
function unitValue(metadata: StartupMetadata, price: number): number {
  if (metadata.investment_type === "bspce_options") {
    return Math.max(0, price - (metadata.avg_cost_per_share ?? 0));
  }
  return price;
}

/** Cost basis: shares × average cost per share (options: nothing was paid up front → 0). */
export function startupCostBasis(metadata: StartupMetadata, shares: number): number {
  if (metadata.investment_type === "bspce_options") return 0;
  return (metadata.avg_cost_per_share ?? 0) * shares;
}

/**
 * Current valuation of the holding: shares × the latest round's price per
 * share; with no rounds, valued at cost (options: 0 until a round exists).
 */
export function startupValuation(metadata: StartupMetadata, shares: number): number {
  const round = latestRound(metadata);
  const price = round ? round.price_per_share : (metadata.avg_cost_per_share ?? 0);
  return round || metadata.investment_type !== "bspce_options"
    ? unitValue(metadata, price) * shares
    : 0;
}

/** Valuation history, one point per round (the holding's value from that date on). */
export function startupRoundHistory(
  metadata: StartupMetadata,
  shares: number,
): { date: string; name: string; value: number; price: number }[] {
  return sortedRounds(metadata.funding_rounds).map((r) => ({
    date: r.date,
    name: r.name,
    price: r.price_per_share,
    value: unitValue(metadata, r.price_per_share) * shares,
  }));
}

/** Round validation (translation keys). */
export function getFundingRoundErrors(round: Omit<FundingRound, "id">): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(round.date)) errors.push("startup_round_date_required");
  if (!round.name.trim()) errors.push("startup_round_name_required");
  if (!(round.price_per_share > 0)) errors.push("startup_round_price_required");
  if (round.post_money_valuation != null && !(round.post_money_valuation > 0)) {
    errors.push("startup_round_post_money_invalid");
  }
  return errors;
}
