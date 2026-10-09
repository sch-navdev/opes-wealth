import { buildCurrencyExposure, type CurrencyExposure } from "@/lib/dashboard-tiers";
import { convertToBaseCurrency } from "@/lib/fx";
import { assetLiability, grossAssetValue } from "@/lib/liabilities";
import { parseLiabilityMetadata } from "@/lib/liability";
import { buildPassiveIncome } from "@/lib/passive-income";
import {
  calledCapital,
  distributedCapital,
  fundReturns,
  parsePrivateEquityMetadata,
  unfundedCommitment,
} from "@/lib/private-equity";
import { calculateTotalCost, parseRealEstateMetadata } from "@/lib/real-estate";
import { estimateDepreciatedValue, parseVehicleMetadata } from "@/lib/vehicles";

/**
 * Pure data builder for the Expert-tier dashboard panels (raw data, private
 * equity valuations, tax & depreciation inputs, currency exposure). Everything
 * returned is plain JSON (no Dates, no functions) because it crosses the
 * server -> client boundary. Amounts named `*Base` / `baseValue` are in the Base
 * Currency; `native*` amounts are in the asset's own currency.
 */

/** The subset of the dashboard's AssetRow this builder reads (already scaled to the user's ownership share). */
export type ExpertAssetInput = {
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

export const UNCATEGORISED = "Uncategorised";

export type ExpertRawRow = {
  id: string;
  name: string;
  category: string;
  currency: string;
  quantity: number;
  /** Stored value in the asset's own currency (always positive; see `isLiability`). */
  nativeValue: number;
  /** Signed value in the Base Currency: negative for liabilities. */
  baseValue: number;
  purchaseDate: string | null;
  isLiability: boolean;
};

export type ExpertPrivateEquityRow = {
  id: string;
  name: string;
  currency: string;
  manager: string;
  vintageYear: string;
  stage: string;
  /** All amounts in the Base Currency. */
  commitment: number | null;
  called: number;
  unfunded: number;
  /** NAV (the asset's current value). */
  nav: number;
  distributions: number;
  /** Distributions / paid-in capital (null with nothing called). */
  dpi: number | null;
  /** (NAV + distributions) / paid-in capital (null with nothing called). */
  tvpi: number | null;
  /** Projected multiple on scheduled calls (or the manual target), from `fundReturns`. */
  projectedMultiple: number | null;
  /** Projected IRR as a fraction (0.12 = 12%), from `fundReturns`. */
  projectedIrr: number | null;
  navDate: string;
};

export type TaxAssetKind = "vehicle" | "real_estate" | "private_equity";

export type ExpertTaxRow = {
  id: string;
  name: string;
  kind: TaxAssetKind;
  /** All amounts in the Base Currency. */
  costBasis: number;
  /** Current market value (real estate: gross market value, not equity). */
  marketValue: number;
  /** Vehicles only: purchase price depreciated with the vehicle model; null when it can't be estimated. */
  bookValue: number | null;
};

/** Underlying Base-Currency amounts behind the ratios (all derived from already ownership-scaled inputs). */
export type FinancialRatioTotals = {
  /** Annual passive income (rent, dividends, interest/distributions), Base Currency. */
  annualYield: number;
  /** Sum of gross values of non-liability assets (the dashboard's Total Assets). */
  totalAssets: number;
  /** Sum of `assetLiability` over all assets (the dashboard's Total Liabilities). */
  totalLiabilities: number;
  /** totalAssets - totalLiabilities. */
  netWorth: number;
  /** Non-liability assets in the "Cash" category. */
  cashAssets: number;
  /** Liabilities that are not standard bank loans/mortgages (see `classifyLiability`). */
  otherLiabilities: number;
  /** ROIC denominator: totalAssets - cashAssets - otherLiabilities. */
  investedCapital: number;
};

export type FinancialRatios = {
  /** Total annual yield / total assets, as a fraction (0.05 = 5%); null when assets <= 0. */
  roa: number | null;
  /** Total liabilities / net worth, as a multiple (0.42 = 0.42x); null when net worth <= 0. */
  debtToEquity: number | null;
  /** Total annual yield / (assets - cash - other liabilities), as a fraction; null when that is <= 0. */
  roic: number | null;
  totals: FinancialRatioTotals;
};

export type ExpertPanelsData = {
  rawRows: ExpertRawRow[];
  privateEquity: ExpertPrivateEquityRow[];
  taxDepreciation: ExpertTaxRow[];
  exposure: CurrencyExposure;
  ratios: FinancialRatios;
};

const categoryName = (a: ExpertAssetInput) => a.asset_categories?.name ?? UNCATEGORISED;

const positive = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

/** a / b, or null when either is not finite or the denominator is zero or negative (never Infinity/NaN). */
function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

/**
 * Splits the debt an asset contributes (`assetLiability`, in the asset's own
 * currency) into standard bank debt and "other" debt:
 *
 *  - bank:  Real Estate linked loan/mortgage balance, and standalone liabilities
 *           of type `loan` or `mortgage` (a standalone row with no stored type
 *           is a loan, matching `parseLiabilityMetadata`'s default).
 *  - other: off-plan developer balances, private-equity pending capital calls,
 *           and standalone `credit_card` / `other` liabilities.
 *
 * `bank + other` always equals `assetLiability(asset)`.
 */
export function classifyLiability(asset: ExpertAssetInput): { bank: number; other: number } {
  const total = assetLiability(asset);
  if (!(total > 0)) return { bank: 0, other: 0 };

  if (asset.is_liability) {
    const type = parseLiabilityMetadata(asset.metadata).liability_type;
    return type === "loan" || type === "mortgage" ? { bank: total, other: 0 } : { bank: 0, other: total };
  }
  if (asset.asset_categories?.name === "Real Estate") {
    const md = parseRealEstateMetadata(asset.metadata);
    const offplan = Math.min(total, md.is_offplan ? positive(md.outstanding_balance) : 0);
    return { bank: total - offplan, other: offplan };
  }
  // Private Equity capital calls (the only other non-zero `assetLiability` source).
  return { bank: 0, other: total };
}

/**
 * ROA, Debt-to-Equity and ROIC in the Base Currency. `assets` must already be
 * scaled to the user's ownership share; `annualYield` is the user's total annual
 * passive income in the Base Currency.
 *
 *  - ROA  = annualYield / totalAssets
 *  - D/E  = totalLiabilities / netWorth  (null when netWorth <= 0)
 *  - ROIC = annualYield / (totalAssets - cashAssets - otherLiabilities)
 *
 * ROIC follows this specified formula, not the textbook NOPAT / invested capital.
 */
export function computeFinancialRatios(
  assets: ExpertAssetInput[],
  annualYield: number,
  displayCurrency: string,
  rates: Record<string, number>,
): FinancialRatios {
  const toBase = (amount: number, currency: string) =>
    convertToBaseCurrency(amount, currency, displayCurrency, rates);

  let totalAssets = 0;
  let totalLiabilities = 0;
  let cashAssets = 0;
  let otherLiabilities = 0;
  for (const a of assets) {
    if (!a.is_liability) {
      const gross = toBase(grossAssetValue(a), a.currency);
      totalAssets += gross;
      if (a.asset_categories?.name === "Cash") cashAssets += gross;
    }
    totalLiabilities += toBase(assetLiability(a), a.currency);
    otherLiabilities += toBase(classifyLiability(a).other, a.currency);
  }
  const netWorth = totalAssets - totalLiabilities;
  const investedCapital = totalAssets - cashAssets - otherLiabilities;
  const yieldBase = Number.isFinite(annualYield) ? annualYield : 0;

  return {
    roa: safeRatio(yieldBase, totalAssets),
    debtToEquity: safeRatio(totalLiabilities, netWorth),
    roic: safeRatio(yieldBase, investedCapital),
    totals: { annualYield: yieldBase, totalAssets, totalLiabilities, netWorth, cashAssets, otherLiabilities, investedCapital },
  };
}

export function buildExpertPanelsData(
  assets: ExpertAssetInput[],
  displayCurrency: string,
  rates: Record<string, number>,
  today: string,
): ExpertPanelsData {
  const toBase = (amount: number, currency: string) =>
    convertToBaseCurrency(amount, currency, displayCurrency, rates);

  const rawRows: ExpertRawRow[] = assets.map((a) => ({
    id: a.id,
    name: a.name,
    category: categoryName(a),
    currency: a.currency,
    quantity: a.quantity,
    nativeValue: a.current_value,
    baseValue: toBase(a.current_value, a.currency) * (a.is_liability ? -1 : 1),
    purchaseDate: a.purchase_date || null,
    isLiability: a.is_liability,
  }));

  const privateEquity: ExpertPrivateEquityRow[] = [];
  const taxDepreciation: ExpertTaxRow[] = [];

  for (const a of assets) {
    if (a.is_liability) continue;
    const category = a.asset_categories?.name;

    if (category === "Private Equity") {
      const md = parsePrivateEquityMetadata(a.metadata);
      const called = toBase(calledCapital(md), a.currency);
      const nav = toBase(a.current_value, a.currency);
      const distributions = toBase(distributedCapital(md), a.currency);
      const returns = fundReturns(md);
      privateEquity.push({
        id: a.id,
        name: a.name,
        currency: a.currency,
        manager: md.manager,
        vintageYear: md.vintage_year,
        stage: md.lifecycle_stage,
        commitment: md.commitment_amount != null ? toBase(md.commitment_amount, a.currency) : null,
        called,
        unfunded: toBase(unfundedCommitment(md), a.currency),
        nav,
        distributions,
        dpi: called > 0 ? distributions / called : null,
        tvpi: called > 0 ? (nav + distributions) / called : null,
        projectedMultiple: returns.multiple,
        projectedIrr: returns.irr,
        navDate: md.nav_date,
      });
      if (called > 0) {
        taxDepreciation.push({ id: a.id, name: a.name, kind: "private_equity", costBasis: called, marketValue: nav, bookValue: null });
      }
    } else if (category === "Vehicles") {
      const md = parseVehicleMetadata(a.metadata);
      if (md.purchase_price != null && md.purchase_price > 0) {
        const book = estimateDepreciatedValue(md, a.purchase_date, today);
        taxDepreciation.push({
          id: a.id,
          name: a.name,
          kind: "vehicle",
          costBasis: toBase(md.purchase_price, a.currency),
          marketValue: toBase(a.current_value, a.currency),
          bookValue: book != null ? toBase(book, a.currency) : null,
        });
      }
    } else if (category === "Real Estate") {
      const gross = grossAssetValue(a);
      taxDepreciation.push({
        id: a.id,
        name: a.name,
        kind: "real_estate",
        costBasis: toBase(calculateTotalCost(parseRealEstateMetadata(a.metadata), gross), a.currency),
        marketValue: toBase(gross, a.currency),
        bookValue: null,
      });
    }
  }

  const exposure = buildCurrencyExposure(
    assets
      .filter((a) => !a.is_liability)
      .map((a) => ({
        currency: a.currency,
        category: categoryName(a),
        amount: toBase(grossAssetValue(a), a.currency),
      })),
  );

  // Annual yield = the passive-income summary's `projected` total: the expected
  // gross rent/dividends/distributions over the next 12 months (an annualised
  // figure, unlike `lastYear`, which is 0 for private equity and backward-looking).
  const annualYield = buildPassiveIncome(assets, today, toBase, (a) => toBase(grossAssetValue(a), a.currency)).projected;
  const ratios = computeFinancialRatios(assets, annualYield, displayCurrency, rates);

  return { rawRows, privateEquity, taxDepreciation, exposure, ratios };
}

export type TaxSummary = {
  totalCost: number;
  totalValue: number;
  /** Value minus cost across all rows (losses net against gains: a plain portfolio figure). */
  netUnrealisedGain: number;
  /** Sum of the per-asset POSITIVE gains only: the base an illustrative tax would apply to (no loss offsetting). */
  taxableGain: number;
  /** ILLUSTRATIVE only: taxableGain x rate. Not tax advice. */
  estimatedTax: number;
  /** Rows' values after the depreciation toggle (vehicles at book value when on and available). */
  rows: (ExpertTaxRow & { value: number; gain: number })[];
};

/** Recomputes the tax/depreciation totals for the two client toggles. Rate is clamped to 0-100 (percent). */
export function summarizeTaxDepreciation(
  rows: ExpertTaxRow[],
  opts: { depreciationView: boolean; applyTax: boolean; ratePercent: number },
): TaxSummary {
  const rate = Number.isFinite(opts.ratePercent) ? Math.min(100, Math.max(0, opts.ratePercent)) : 0;
  const out = rows.map((r) => {
    const value = opts.depreciationView && r.kind === "vehicle" && r.bookValue != null ? r.bookValue : r.marketValue;
    return { ...r, value, gain: value - r.costBasis };
  });
  const totalCost = out.reduce((s, r) => s + r.costBasis, 0);
  const totalValue = out.reduce((s, r) => s + r.value, 0);
  const taxableGain = out.reduce((s, r) => s + Math.max(0, r.gain), 0);
  return {
    totalCost,
    totalValue,
    netUnrealisedGain: totalValue - totalCost,
    taxableGain,
    estimatedTax: opts.applyTax ? (taxableGain * rate) / 100 : 0,
    rows: out,
  };
}
