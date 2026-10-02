import { parseEquityMetadata } from "@/lib/equities";
import { parsePrivateEquityMetadata } from "@/lib/private-equity";
import { parseRealEstateMetadata } from "@/lib/real-estate";
import {
  parseScpiMetadata,
  scpiAverageYield,
  scpiInvested,
  scpiReceived,
  scpiTrailingYield,
} from "@/lib/scpi";

/**
 * Passive income, derived directly from the holdings — no external feed:
 *
 *  - **reit**   REIT / SCPI holdings: dividends received in the last 12 months
 *               (gross); projected = invested capital × annual distribution
 *               rate, where the rate is the one the fund targets
 *               (`target_yield_pct`), else the average of the recorded annual
 *               rates (TDVM), else the realised trailing yield; with none of
 *               those, the not-yet-received ledger entries of the next 12 months.
 *  - **stocks** Equities: dividend/income receipts of the last 12 months;
 *               projected = that same run-rate for positions still held (a
 *               closed position projects nothing).
 *  - **rental** Real Estate: tenancy contracts' annual rent pro-rated over the
 *               days each contract overlaps the window — last 12 months, and
 *               next 12 months for contracts in force or starting later (an
 *               open-ended contract continues; an expired one is NOT assumed
 *               to renew). Gross: before property expenses.
 *  - **private_equity** projected distributions dated in the next 12 months.
 *               Realised distributions are stored undated, so the last-year
 *               figure is honestly 0 for these.
 *
 * Every amount is converted into the Base Currency with the caller's `toBase`.
 * There is no public REIT/SCPI data API (SCPI yields are published per fund by
 * the management companies / the ASPIM-IEIF association, not via an API we can
 * call), so the yields come from what the user recorded on each holding.
 * Projections are illustrative, not forecasts or advice.
 */
export type PassiveIncomeSource = "reit" | "stocks" | "rental" | "private_equity";

export const PASSIVE_INCOME_SOURCES: PassiveIncomeSource[] = [
  "reit",
  "stocks",
  "rental",
  "private_equity",
];

/** How a projection was derived — a translation-key suffix (`passive_method_<id>`). */
export type PassiveIncomeMethod =
  | "target_yield"
  | "yield_history"
  | "trailing_yield"
  | "scheduled"
  | "run_rate"
  | "contracts"
  | "distributions";

export type PassiveIncomeAsset = {
  id: string;
  name: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  asset_categories: { name: string } | null;
};

export type PassiveIncomeRow = {
  id: string;
  name: string;
  source: PassiveIncomeSource;
  /** Gross income received over the last 12 months, Base Currency. */
  lastYear: number;
  /** Expected gross income over the next 12 months, Base Currency. */
  projected: number;
  /** Projected ÷ the holding's value, percent; null without a value. */
  yieldPct: number | null;
  method: PassiveIncomeMethod | null;
};

export type PassiveIncomeSourceTotal = {
  source: PassiveIncomeSource;
  lastYear: number;
  projected: number;
  count: number;
};

export type PassiveIncomeSummary = {
  lastYear: number;
  projected: number;
  /** Projected ÷ total value of the income-producing holdings, percent. */
  yieldPct: number | null;
  bySource: PassiveIncomeSourceTotal[];
  rows: PassiveIncomeRow[];
};

const DAY_MS = 24 * 3600 * 1000;

function shiftYears(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/** Whole days in [from, to] inclusive; 0 when empty. */
function daysBetween(from: string, to: string): number {
  if (to < from) return 0;
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
}

function sumIncomeIn(entries: { date: string; amount: number }[], from: string, to: string): number {
  return entries
    .filter((e) => e.date >= from && e.date <= to && Number.isFinite(e.amount))
    .reduce((s, e) => s + e.amount, 0);
}

/** Annual rent earned inside [from, to] from the tenancy contracts (pro-rated by days). */
export function rentInWindow(
  contracts: { start_date: string; end_date: string; annual_rent: number | null }[],
  from: string,
  to: string,
): number {
  let total = 0;
  for (const c of contracts) {
    if (!c.start_date || !(c.annual_rent && c.annual_rent > 0)) continue;
    const start = c.start_date > from ? c.start_date : from;
    // No end date on file: the lease is treated as running through the window.
    const contractEnd = c.end_date || to;
    const end = contractEnd < to ? contractEnd : to;
    total += (c.annual_rent * daysBetween(start, end)) / 365;
  }
  return total;
}

type Computed = {
  lastYear: number;
  projected: number;
  method: PassiveIncomeMethod | null;
};

function computeReit(asset: PassiveIncomeAsset, today: string, yearAgo: string, yearAhead: string): Computed {
  const md = parseScpiMetadata(asset.metadata);
  const shares = asset.quantity;
  const lastYear = scpiReceived(md, yearAgo);
  const invested = scpiInvested(md, shares);
  const trailing = scpiTrailingYield(md, shares, today);

  let rate: number | null = null;
  let method: PassiveIncomeMethod | null = null;
  if (md.target_yield_pct != null && md.target_yield_pct > 0) {
    rate = md.target_yield_pct;
    method = "target_yield";
  } else if (scpiAverageYield(md) != null) {
    rate = scpiAverageYield(md);
    method = "yield_history";
  } else if (trailing != null) {
    rate = trailing;
    method = "trailing_yield";
  }
  if (rate != null && invested > 0) {
    return { lastYear, projected: (invested * rate) / 100, method };
  }

  const scheduled = md.dividends
    .filter((d) => d.status === "expected" && d.date > today && d.date <= yearAhead)
    .reduce((s, d) => s + d.amount, 0);
  return { lastYear, projected: scheduled, method: scheduled > 0 ? "scheduled" : null };
}

function computeStock(asset: PassiveIncomeAsset, today: string, yearAgo: string): Computed {
  const md = parseEquityMetadata(asset.metadata);
  const lastYear = sumIncomeIn(md.income ?? [], yearAgo, today);
  const held = asset.quantity > 0;
  return { lastYear, projected: held ? lastYear : 0, method: held && lastYear > 0 ? "run_rate" : null };
}

function computeRental(asset: PassiveIncomeAsset, today: string, yearAgo: string, yearAhead: string): Computed {
  const contracts = parseRealEstateMetadata(asset.metadata).tenancy_contracts ?? [];
  const lastYear = rentInWindow(contracts, yearAgo, today);
  const next = shiftOneDay(today);
  const projected = rentInWindow(contracts, next, yearAhead);
  return { lastYear, projected, method: projected > 0 ? "contracts" : null };
}

function shiftOneDay(iso: string): string {
  return new Date(Date.parse(iso) + DAY_MS).toISOString().slice(0, 10);
}

function computePrivateEquity(asset: PassiveIncomeAsset, today: string, yearAhead: string): Computed {
  const md = parsePrivateEquityMetadata(asset.metadata);
  const projected = sumIncomeIn(
    md.projected_distributions.map((d) => ({ date: d.due_date, amount: d.amount })),
    shiftOneDay(today),
    yearAhead,
  );
  return { lastYear: 0, projected, method: projected > 0 ? "distributions" : null };
}

/**
 * Builds the passive-income summary for every income-producing holding.
 * `valueBase` should be the holding's gross value in the Base Currency (the
 * yield denominator); `toBase` converts an amount in the asset's own currency.
 */
export function buildPassiveIncome(
  assets: PassiveIncomeAsset[],
  today: string,
  toBase: (amount: number, currency: string) => number,
  valueBase: (asset: PassiveIncomeAsset) => number,
): PassiveIncomeSummary {
  const yearAgo = shiftOneDay(shiftYears(today, -1));
  const yearAhead = shiftYears(today, 1);

  const rows: PassiveIncomeRow[] = [];
  for (const asset of assets) {
    if (asset.is_liability) continue;
    const category = asset.asset_categories?.name;
    let source: PassiveIncomeSource;
    let c: Computed;
    if (category === "SCPI") {
      source = "reit";
      c = computeReit(asset, today, yearAgo, yearAhead);
    } else if (category === "Equities") {
      source = "stocks";
      c = computeStock(asset, today, yearAgo);
    } else if (category === "Real Estate") {
      source = "rental";
      c = computeRental(asset, today, yearAgo, yearAhead);
    } else if (category === "Private Equity") {
      source = "private_equity";
      c = computePrivateEquity(asset, today, yearAhead);
    } else {
      continue;
    }
    if (c.lastYear === 0 && c.projected === 0) continue;

    const value = valueBase(asset);
    const projected = toBase(c.projected, asset.currency);
    rows.push({
      id: asset.id,
      name: asset.name,
      source,
      lastYear: toBase(c.lastYear, asset.currency),
      projected,
      yieldPct: value > 0 ? (projected / value) * 100 : null,
      method: c.method,
    });
  }

  const bySource = PASSIVE_INCOME_SOURCES.map((source): PassiveIncomeSourceTotal => {
    const mine = rows.filter((r) => r.source === source);
    return {
      source,
      lastYear: mine.reduce((s, r) => s + r.lastYear, 0),
      projected: mine.reduce((s, r) => s + r.projected, 0),
      count: mine.length,
    };
  });

  const lastYear = rows.reduce((s, r) => s + r.lastYear, 0);
  const projected = rows.reduce((s, r) => s + r.projected, 0);
  const producingValue = assets
    .filter((a) => rows.some((r) => r.id === a.id))
    .reduce((s, a) => s + valueBase(a), 0);

  return {
    lastYear,
    projected,
    yieldPct: producingValue > 0 ? (projected / producingValue) * 100 : null,
    bySource,
    rows: rows.sort((a, b) => Math.max(b.projected, b.lastYear) - Math.max(a.projected, a.lastYear)),
  };
}
