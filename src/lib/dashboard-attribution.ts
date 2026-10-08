import { buildEquityAttribution, buildPurchaseAttribution } from "@/lib/asset-attribution";
import { parseEquityMetadata, type EquityTrade } from "@/lib/equities";
import { convertToBaseCurrency } from "@/lib/fx";
import { grossAssetValue } from "@/lib/liabilities";
import { aggregateAttribution, type AttributionResult } from "@/lib/portfolio-attribution";
import { parseRealEstateMetadata } from "@/lib/real-estate";
import { parseVehicleMetadata } from "@/lib/vehicles";

/**
 * Pure builder for the Expert "Currency vs capital performance" panel. Everything
 * is in the Base (display) Currency and plain JSON (crosses the server -> client
 * boundary). Assets must already be scaled to the user's ownership share (the
 * dashboard's `assets` are), so nothing is scaled again here.
 *
 * Scope: non-liability holdings NOT in the base currency that have a cost basis:
 * equities with `metadata.trades`, real estate (`contract_price ?? purchasePrice`)
 * and vehicles (`purchase_price`), the latter two needing `purchase_date`.
 */

export type AttributionAssetInput = {
  id: string;
  name: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  purchase_date: string | null;
  asset_categories: { name: string } | null;
};

export type AttributionCandidate = {
  id: string;
  name: string;
  currency: string;
  kind: "equity" | "purchase";
  quantity: number;
  /** Current value in the holding's own currency. */
  valueLocal: number;
  trades: EquityTrade[];
  purchasePriceLocal: number | null;
  purchaseDate: string | null;
};

/** Historical base-per-local FX: `fxHistory[currency][YYYY-MM-DD]`. Missing entries mean "unavailable". */
export type AttributionFxHistory = Record<string, Record<string, number>>;

const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d);
const day = (d: string) => d.slice(0, 10);

/** Foreign-currency holdings with a cost basis. Empty when there is nothing to attribute. */
export function collectAttributionCandidates(
  assets: AttributionAssetInput[],
  baseCurrency: string,
): AttributionCandidate[] {
  const out: AttributionCandidate[] = [];
  for (const a of assets) {
    if (a.is_liability || !a.currency || a.currency === baseCurrency) continue;
    const category = a.asset_categories?.name;
    if (category === "Equities") {
      const trades = parseEquityMetadata(a.metadata).trades;
      if (trades.length === 0) continue;
      out.push({
        id: a.id,
        name: a.name,
        currency: a.currency,
        kind: "equity",
        quantity: a.quantity,
        valueLocal: a.current_value,
        trades,
        purchasePriceLocal: null,
        purchaseDate: null,
      });
    } else if (category === "Real Estate" || category === "Vehicles") {
      const price =
        category === "Real Estate"
          ? (() => {
              const md = parseRealEstateMetadata(a.metadata);
              return md.contract_price ?? md.purchasePrice;
            })()
          : parseVehicleMetadata(a.metadata).purchase_price;
      if (!(typeof price === "number" && price > 0) || !isDate(a.purchase_date)) continue;
      out.push({
        id: a.id,
        name: a.name,
        currency: a.currency,
        kind: "purchase",
        quantity: a.quantity,
        valueLocal: category === "Real Estate" ? grossAssetValue(a) : a.current_value,
        trades: [],
        purchasePriceLocal: price,
        purchaseDate: day(a.purchase_date),
      });
    }
  }
  return out;
}

/** The (currency -> unique sorted dates) the candidates need historical FX for. */
export function attributionFxRequests(candidates: AttributionCandidate[]): Record<string, string[]> {
  const sets: Record<string, Set<string>> = {};
  for (const c of candidates) {
    const set = (sets[c.currency] ??= new Set<string>());
    if (c.kind === "equity") {
      for (const t of c.trades) if (t.side === "buy" && isDate(t.tradeDate)) set.add(day(t.tradeDate));
    } else if (c.purchaseDate) {
      set.add(c.purchaseDate);
    }
  }
  return Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, [...v].sort()]));
}

export type AttributionHolding = {
  id: string;
  name: string;
  currency: string;
  /** Currency effect in the Base Currency, signed. */
  currencyBase: number;
  capitalBase: number;
};

/** Points in an FX trend sparkline and the spacing between them: 13 x 30 days is about twelve months. */
export const FX_TREND_POINTS = 13;
export const FX_TREND_STEP_DAYS = 30;

/** The dates (YYYY-MM-DD, oldest first, ending on `today`) at which each FX trend is sampled. */
export function fxTrendDates(today: string, points = FX_TREND_POINTS, stepDays = FX_TREND_STEP_DAYS): string[] {
  const end = new Date(`${day(today)}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return [];
  const out: string[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i * stepDays);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** The distinct foreign currencies of the candidates (what the trend fetch needs). */
export function attributionCurrencies(candidates: AttributionCandidate[]): string[] {
  return [...new Set(candidates.map((c) => c.currency))].sort();
}

export type AttributionPanelData = {
  /** Foreign-currency holdings with a cost basis that were attributed / that exist. */
  included: number;
  total: number;
  /** included / total, 0-1. */
  coverage: number;
  /** Null when no holding could be attributed (provider down, missing rates). */
  totals: {
    costBase: number;
    capitalBase: number;
    currencyBase: number;
    totalBase: number;
    /** Contributions to the total return, as fractions of cost (sum to totalPct). Null when cost is 0. */
    capitalPct: number | null;
    currencyPct: number | null;
    totalPct: number | null;
    /** Exact split of absolute effects, fractions summing to 1; null when both effects are 0. */
    capitalShare: number | null;
    currencyShare: number | null;
  } | null;
  /** Top 3 holdings by absolute currency effect. */
  top: AttributionHolding[];
  /**
   * Base-per-local rate of each currency in `top` over about twelve months, oldest first (at least 2 points).
   * Absent for a currency whose history could not be fetched; the panel then shows no sparkline for it.
   */
  fxTrends?: Record<string, number[]>;
};

/**
 * Returns null when no foreign-currency holding has a cost basis (the panel is
 * then not rendered). `rates` is the dashboard's base-anchored table, used for
 * "now" FX; `fxHistory` supplies the purchase-date FX.
 */
export function buildAttributionPanelData(args: {
  candidates: AttributionCandidate[];
  baseCurrency: string;
  rates: Record<string, number>;
  fxHistory: AttributionFxHistory;
  /** Optional 12-month rate series per currency (see `fetchFxTrends`). */
  fxTrends?: Record<string, number[]>;
}): AttributionPanelData | null {
  const { candidates, baseCurrency, rates, fxHistory } = args;
  if (candidates.length === 0) return null;

  const fxOnDate = (date: string, from: string) => fxHistory[from]?.[day(date)] ?? null;
  const results: { c: AttributionCandidate; r: AttributionResult | null }[] = candidates.map((c) => {
    const fxNow = c.currency in rates ? convertToBaseCurrency(1, c.currency, baseCurrency, rates) : null;
    const outcome =
      c.kind === "equity"
        ? buildEquityAttribution({
            trades: c.trades,
            quantity: c.quantity,
            currentValueLocal: c.valueLocal,
            currency: c.currency,
            base: baseCurrency,
            fxNow,
            fxOnDate,
          })
        : buildPurchaseAttribution({
            purchasePriceLocal: c.purchasePriceLocal,
            purchaseDate: c.purchaseDate,
            currentValueLocal: c.valueLocal,
            currency: c.currency,
            base: baseCurrency,
            fxNow,
            fxOnDate,
          });
    return { c, r: outcome.ok ? outcome.result : null };
  });

  const agg = aggregateAttribution(results.map((x) => x.r));
  const top: AttributionHolding[] = results
    .filter((x): x is { c: AttributionCandidate; r: AttributionResult } => x.r !== null)
    .map(({ c, r }) => ({
      id: c.id,
      name: c.name,
      currency: c.currency,
      currencyBase: r.currencyBase,
      capitalBase: r.capitalBase,
    }))
    .sort((a, b) => Math.abs(b.currencyBase) - Math.abs(a.currencyBase))
    .slice(0, 3);

  const absSum = Math.abs(agg.capitalBase) + Math.abs(agg.currencyBase);
  return {
    included: agg.included,
    total: agg.total,
    coverage: agg.coverage,
    totals:
      agg.included === 0
        ? null
        : {
            costBase: agg.costBase,
            capitalBase: agg.capitalBase,
            currencyBase: agg.currencyBase,
            totalBase: agg.totalBase,
            capitalPct: agg.capitalContributionPct,
            currencyPct: agg.currencyContributionPct,
            totalPct: agg.totalPct,
            capitalShare: absSum > 0 ? Math.abs(agg.capitalBase) / absSum : null,
            currencyShare: absSum > 0 ? Math.abs(agg.currencyBase) / absSum : null,
          },
    top,
    ...(fxTrendsForTop(top, args.fxTrends) ?? {}),
  };
}

function fxTrendsForTop(top: AttributionHolding[], trends: Record<string, number[]> | undefined) {
  if (!trends) return null;
  const picked: Record<string, number[]> = {};
  for (const h of top) {
    const series = trends[h.currency]?.filter(Number.isFinite);
    if (series && series.length >= 2) picked[h.currency] = series;
  }
  return Object.keys(picked).length > 0 ? { fxTrends: picked } : null;
}
