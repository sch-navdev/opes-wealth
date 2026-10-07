/**
 * Global FX exposure: how net worth is spread over the currencies the holdings are denominated in
 * (their NATIVE currency), assets against liabilities. Pure; no React, no I/O.
 *
 * Inputs are amounts already converted into the dashboard's base (display) currency and already
 * scaled to the viewer's co-ownership share (the page builds them from the same `grossAssetValue` /
 * `assetLiability` numbers the metric cards and the Liabilities card use), so the totals here equal
 * the dashboard's Total Assets, Total Liabilities and Net Worth exactly.
 *
 * Neutral facts only: net position, share, the non-base share and an informational concentration
 * flag. Nothing here is a recommendation.
 */

/** One holding's contribution, in the base currency, tagged with its native currency. */
export type FxExposureInput = { currency: string; assets: number; liabilities: number };

/** The AED is pegged to the USD at this fixed rate (AED per USD). */
export const AED_USD_PEG_RATE = 3.6725;

/** Currencies that may be merged into one block when the peg grouping is on. */
export const PEG_GROUP: readonly string[] = ["AED", "USD"];

/** A single non-base currency above this share of net worth is flagged (information only). */
export const CONCENTRATION_THRESHOLD = 50;

export type FxShareBasis =
  /** Shares are of net worth (net worth > 0). */
  | "net"
  /** Net worth is zero or negative: shares are of gross exposure (assets + liabilities). */
  | "gross"
  /** Nothing to measure. */
  | "none";

export type FxExposureRow = {
  /** Stable id: the currency code, or the sorted codes joined by "+" for a merged peg block. */
  key: string;
  currencies: string[];
  /** Display label: "EUR" or "AED + USD". */
  label: string;
  /** Whether the base currency is (one of) this row's currencies. */
  isBase: boolean;
  /** Gross assets in the base currency. */
  assets: number;
  /** Liabilities in the base currency (positive number). */
  liabilities: number;
  /** assets - liabilities. May be negative. */
  net: number;
  /** Percent (0-100, may be negative for a negative net) of the basis; 0 when basis is "none". */
  share: number;
};

export type FxConcentration = { key: string; label: string; currencies: string[]; share: number };

export type FxExposure = {
  baseCurrency: string;
  rows: FxExposureRow[];
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  shareBasis: FxShareBasis;
  /**
   * Share held in currencies other than the base currency, in percent of the basis. `null` when
   * there is nothing to measure. Not clamped: if the base currency's own net is negative the
   * non-base share can exceed 100, which is the honest arithmetic.
   */
  nonBaseShare: number | null;
  /** Net position outside the base currency. */
  nonBaseNet: number;
  /** A single non-base block above the threshold (net basis only), else null. */
  concentration: FxConcentration | null;
  hasLiabilities: boolean;
};

function clean(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function normaliseCode(code: string): string {
  const c = (code ?? "").trim().toUpperCase();
  return c || "???";
}

export type BuildFxExposureOptions = {
  baseCurrency: string;
  /** Merge AED and USD into one block (they are pegged). Default false. */
  groupPeg?: boolean;
  /** Percent; default `CONCENTRATION_THRESHOLD`. */
  concentrationThreshold?: number;
};

/** Sums rows per native currency (assets and liabilities separately). Order of first appearance. */
export function sumByCurrency(rows: readonly FxExposureInput[]): FxExposureInput[] {
  const map = new Map<string, FxExposureInput>();
  for (const row of rows) {
    const currency = normaliseCode(row.currency);
    const acc = map.get(currency) ?? { currency, assets: 0, liabilities: 0 };
    acc.assets += clean(row.assets);
    acc.liabilities += clean(row.liabilities);
    map.set(currency, acc);
  }
  return [...map.values()];
}

export function buildFxExposure(
  inputs: readonly FxExposureInput[],
  { baseCurrency, groupPeg = false, concentrationThreshold = CONCENTRATION_THRESHOLD }: BuildFxExposureOptions,
): FxExposure {
  const base = normaliseCode(baseCurrency);
  const merged = sumByCurrency(inputs);

  // Group into blocks (one per currency, or one merged AED+USD block).
  const blocks = new Map<string, { currencies: string[]; assets: number; liabilities: number }>();
  for (const row of merged) {
    const pegged = groupPeg && PEG_GROUP.includes(row.currency);
    const key = pegged ? [...PEG_GROUP].sort().join("+") : row.currency;
    const block = blocks.get(key) ?? { currencies: [], assets: 0, liabilities: 0 };
    block.currencies.push(row.currency);
    block.assets += row.assets;
    block.liabilities += row.liabilities;
    blocks.set(key, block);
  }

  const totalAssets = [...blocks.values()].reduce((s, b) => s + b.assets, 0);
  const totalLiabilities = [...blocks.values()].reduce((s, b) => s + b.liabilities, 0);
  const netWorth = totalAssets - totalLiabilities;
  const grossTotal = [...blocks.values()].reduce((s, b) => s + Math.abs(b.assets) + Math.abs(b.liabilities), 0);

  const shareBasis: FxShareBasis = netWorth > 0 ? "net" : grossTotal > 0 ? "gross" : "none";

  const rows: FxExposureRow[] = [...blocks.entries()]
    .filter(([, b]) => b.assets !== 0 || b.liabilities !== 0)
    .map(([key, b]) => {
      const net = b.assets - b.liabilities;
      const share =
        shareBasis === "net"
          ? (net / netWorth) * 100
          : shareBasis === "gross"
            ? ((Math.abs(b.assets) + Math.abs(b.liabilities)) / grossTotal) * 100
            : 0;
      const currencies = [...b.currencies].sort();
      return {
        key,
        currencies,
        label: currencies.join(" + "),
        isBase: currencies.includes(base),
        assets: b.assets,
        liabilities: b.liabilities,
        net,
        share,
      };
    });

  // Stable, deterministic order: net desc on a net basis, gross exposure desc otherwise; ties by label.
  const sortValue = (r: FxExposureRow) => (shareBasis === "net" ? r.net : Math.abs(r.assets) + Math.abs(r.liabilities));
  rows.sort((a, b) => sortValue(b) - sortValue(a) || a.label.localeCompare(b.label));

  const nonBase = rows.filter((r) => !r.isBase);
  const nonBaseNet = nonBase.reduce((s, r) => s + r.net, 0);
  const nonBaseShare = shareBasis === "none" ? null : nonBase.reduce((s, r) => s + r.share, 0);

  let concentration: FxConcentration | null = null;
  if (shareBasis === "net") {
    const top = nonBase.find((r) => r.share > concentrationThreshold); // rows are sorted: first match is the largest
    if (top) concentration = { key: top.key, label: top.label, currencies: top.currencies, share: top.share };
  }

  return {
    baseCurrency: base,
    rows,
    totalAssets,
    totalLiabilities,
    netWorth,
    shareBasis,
    nonBaseShare,
    nonBaseNet,
    concentration,
    hasLiabilities: totalLiabilities !== 0,
  };
}
