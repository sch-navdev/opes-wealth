/**
 * Glue for the asset detail page's "Performance attribution" card (pure, no I/O, serialisable output).
 *
 * The page (server) decides WHICH historical FX dates are needed (`attributionDates`), fetches them,
 * then calls `buildAttributionView`. Everything else (which asset types get a card, how the cost basis
 * is read, the co-ownership scaling) lives here so it is unit-testable.
 *
 * Which assets: Equities (cost from `metadata.trades`), Real Estate (`contract_price ?? purchasePrice`
 * + `assets.purchase_date`) and Vehicles (`metadata.purchase_price` + `assets.purchase_date`), and
 * only when the asset currency differs from the user's base currency. Not covered: Private Equity
 * (commitments / capital calls, no single purchase price), Exotic Assets (the price is per unit),
 * Crypto and Precious Metals (no stored trade history or purchase price), Cash, SCPI, Companies and
 * Startups: attribution would need a cost basis the data does not hold, so no card is shown.
 *
 * Co-ownership: cost and value are scaled by the same viewer factor, equivalent to scaling every
 * amount of the result of the whole-asset computation (it is linear in cost and value), so the
 * amounts match the share-scaled figures on the page and the percentages are untouched.
 */
import { buildEquityAttribution, buildPurchaseAttribution, type AttributionFailureReason, type AttributionOutcome } from "./asset-attribution";
import { parseEquityMetadata } from "./equities";
import { normalizeShareFactor } from "./asset-detail-scaling";
import type { AttributionResult } from "./portfolio-attribution";
import { parseRealEstateMetadata } from "./real-estate";
import { parseVehicleMetadata } from "./vehicles";

export type HistoricalRateLike =
  | { ok: true; rate: number; asOf: string; source: "ecb" | "peg" | "identity" }
  | { ok: false; reason: string };

export type AttributionRatesInfo = {
  /** Earliest / latest ECB fixing date actually used for the cost-date rate (equal for a single purchase). */
  costAsOfFrom: string;
  costAsOfTo: string;
  /** True when at least one fixing is from an earlier day than the requested one (weekend / holiday). */
  approximate: boolean;
  /** True when a pegged currency leg (AED, SAR, QAR, BHD, OMR) made the rate derived rather than published. */
  pegged: boolean;
};

export type AssetAttributionView =
  | { status: "ok"; base: string; currency: string; result: AttributionResult; rates: AttributionRatesInfo }
  | { status: "unavailable"; reason: AttributionFailureReason };

type CostInputs =
  | { kind: "equity"; trades: ReturnType<typeof parseEquityMetadata>["trades"] }
  | { kind: "purchase"; price: number | null; date: string | null; value: number };

export type AttributionViewArgs = {
  category: string | null | undefined;
  currency: string;
  /** The user's base currency (`profiles.default_currency`). */
  base: string | null | undefined;
  /** The RAW whole-asset values. */
  currentValue: number;
  quantity: number;
  purchaseDate: string | null | undefined;
  metadata: Record<string, unknown> | null;
  /** The viewer's 0-1 share (see `viewerShareFactor`). */
  factor: number;
};

const ISO = /^\d{4}-\d{2}-\d{2}/;
const day = (d: string) => (ISO.test(d) ? d.slice(0, 10) : d);

function costInputs(args: AttributionViewArgs): CostInputs | null {
  switch (args.category) {
    case "Equities":
      return { kind: "equity", trades: parseEquityMetadata(args.metadata).trades };
    case "Real Estate": {
      const m = parseRealEstateMetadata(args.metadata);
      // Same current value the page shows as market valuation.
      return {
        kind: "purchase",
        price: m.contract_price ?? m.purchasePrice ?? null,
        date: args.purchaseDate ?? null,
        value: m.market_valuation ?? args.currentValue,
      };
    }
    case "Vehicles":
      return {
        kind: "purchase",
        price: parseVehicleMetadata(args.metadata).purchase_price,
        date: args.purchaseDate ?? null,
        value: args.currentValue,
      };
    default:
      return null;
  }
}

function applies(args: AttributionViewArgs): boolean {
  return !!args.base && !!args.currency && args.currency !== args.base;
}

/** The historical-FX dates the page must fetch, or null when no card applies (same currency, unsupported type). */
export function attributionDates(args: AttributionViewArgs): string[] | null {
  if (!applies(args)) return null;
  const inputs = costInputs(args);
  if (!inputs) return null;
  if (inputs.kind === "equity") {
    return Array.from(new Set(inputs.trades.filter((t) => t.side === "buy").map((t) => day(t.tradeDate))));
  }
  return inputs.date ? [day(inputs.date)] : [];
}

/** Base-per-local now from a USD-anchored table (units per USD); null if either leg is unknown. */
export function baseFxNow(ratesFromUsd: Record<string, number>, currency: string, base: string): number | null {
  const leg = (c: string) => (c === "USD" ? ratesFromUsd.USD ?? 1 : ratesFromUsd[c]);
  const local = leg(currency);
  const b = leg(base);
  if (!(typeof local === "number" && local > 0) || !(typeof b === "number" && b > 0)) return null;
  return b / local;
}

function scaleResult(r: AttributionResult, f: number): AttributionResult {
  if (f === 1) return r;
  return {
    ...r,
    costBase: r.costBase * f,
    valueBase: r.valueBase * f,
    totalBase: r.totalBase * f,
    capitalBase: r.capitalBase * f,
    currencyBase: r.currencyBase * f,
    costLocal: r.costLocal * f,
    valueLocal: r.valueLocal * f,
  };
}

/**
 * `historical`: result of `getHistoricalRatesBatch(dates, currency, base)` (rate = base per 1 local),
 * or null/undefined when the fetch failed outright (the card then explains that rates are unavailable).
 * Returns null when no card applies.
 */
export function buildAttributionView(
  args: AttributionViewArgs & {
    ratesFromUsd: Record<string, number>;
    historical: Record<string, HistoricalRateLike> | null | undefined;
  },
): AssetAttributionView | null {
  if (!applies(args)) return null;
  const inputs = costInputs(args);
  if (!inputs) return null;
  const base = args.base as string;
  const factor = normalizeShareFactor(args.factor);
  const fxNow = baseFxNow(args.ratesFromUsd, args.currency, base);

  const used: { date: string; asOf: string; source: string }[] = [];
  const fxOnDate = (date: string): number | null => {
    const d = day(date);
    const h = args.historical?.[d];
    if (!h || !h.ok || !(h.rate > 0)) return null;
    used.push({ date: d, asOf: h.asOf, source: h.source });
    return h.rate;
  };

  let outcome: AttributionOutcome;
  if (inputs.kind === "equity") {
    outcome = buildEquityAttribution({
      trades: inputs.trades,
      quantity: args.quantity,
      currentValueLocal: args.currentValue,
      currency: args.currency,
      base,
      fxNow,
      fxOnDate,
    });
  } else {
    outcome = buildPurchaseAttribution({
      purchasePriceLocal: inputs.price,
      purchaseDate: inputs.date,
      currentValueLocal: inputs.value,
      currency: args.currency,
      base,
      fxNow,
      fxOnDate,
    });
  }
  if (!outcome.ok) return { status: "unavailable", reason: outcome.reason };

  const asOfs = used.map((u) => u.asOf).sort();
  return {
    status: "ok",
    base,
    currency: args.currency,
    result: scaleResult(outcome.result, factor),
    rates: {
      costAsOfFrom: asOfs[0] ?? "",
      costAsOfTo: asOfs[asOfs.length - 1] ?? "",
      approximate: used.some((u) => u.asOf !== u.date),
      pegged: used.some((u) => u.source === "peg"),
    },
  };
}
