/**
 * "Contract holdings" of an Assurance-Vie contract: an optional, versioned list (metadata v2) of what the contract
 * actually holds (euro fund, funds, ETFs, real-estate units, ...), each with a value in the CONTRACT currency.
 *
 * Pure and defensive like `assurance-vie.ts` (which imports from here, never the other way round):
 * - `parseHoldings` sanitises anything it is given and never throws;
 * - `getHoldingsErrors` returns blocking validation codes (translation keys, `av_hold_err_*`);
 * - `getHoldingsWarnings` returns non-blocking notices;
 * - `reconcileHoldings` compares the holdings total with the contract's total value. It NEVER blocks saving;
 * - `deriveAllocationFromHoldings` turns the holdings into the euro-fund / unit-linked percentages.
 *
 * Nothing here is live pricing and nothing validates an ISIN against a registry: the amounts are whatever the
 * user types from the insurer's statement. Which supports a contract may hold depends on the contract itself.
 */

export const AV_MAX_HOLDINGS = 60;
/** Reconciliation tolerance, in contract-currency units (a rounding difference is not a mismatch). */
export const AV_HOLDINGS_TOLERANCE = 1;
/** Relative tolerance when comparing units x price with the entered value. */
const VALUE_MISMATCH_RATIO = 0.01;

export type AvHoldingType =
  | "euro_fund"
  | "fund_opcvm"
  | "etf"
  | "scpi_sci_opci"
  | "private_equity_fund"
  | "structured_product"
  | "bond"
  | "equity_direct"
  | "commodity_etc"
  | "money_market"
  | "cash_balance"
  | "other";

export const AV_HOLDING_TYPES: AvHoldingType[] = [
  "euro_fund",
  "fund_opcvm",
  "etf",
  "scpi_sci_opci",
  "private_equity_fund",
  "structured_product",
  "bond",
  "equity_direct",
  "commodity_etc",
  "money_market",
  "cash_balance",
  "other",
];

export type AvHolding = {
  /** Stable key for the form list (not personal data). */
  id: string;
  type: AvHoldingType;
  name: string;
  /** Optional ISIN (upper-cased, 12 characters) or "" when not given. */
  isin: string;
  ticker: string;
  units: number | null;
  unit_price: number | null;
  /** Value in the contract currency. Required for a row to count. */
  value: number | null;
  /** Optional ISO date the value was taken ("" when unknown). */
  as_of: string;
};

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const round2 = (n: number) => Math.round(n * 100) / 100;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const nonNeg = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const present = (v: unknown) => v !== null && v !== undefined && v !== "";
const badNum = (v: unknown) => present(v) && nonNeg(v) === null;

function isRealIsoDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = ISO_RE.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

export const isHoldingType = (v: unknown): v is AvHoldingType =>
  typeof v === "string" && (AV_HOLDING_TYPES as string[]).includes(v);

export const isValidIsin = (v: string): boolean => ISIN_RE.test(v);

export function emptyHolding(id: string, type: AvHoldingType = "fund_opcvm"): AvHolding {
  return { id, type, name: "", isin: "", ticker: "", units: null, unit_price: null, value: null, as_of: "" };
}

/** A form row with nothing typed in (apart from the default type) is a blank row, not a holding. */
export function isBlankHolding(h: Partial<AvHolding> | null | undefined): boolean {
  if (!h) return true;
  return !clean(h.name, 500) && !clean(h.isin, 500) && !clean(h.ticker, 500) && !present(h.units) && !present(h.unit_price) && !present(h.value) && !clean(h.as_of, 50);
}

function parseHolding(raw: unknown, index: number): AvHolding | null {
  if (!isRecord(raw)) return null;
  const isin = clean(raw.isin, 12).toUpperCase();
  const h: AvHolding = {
    id: clean(raw.id, 40) || `h${index}`,
    type: isHoldingType(raw.type) ? raw.type : "other",
    name: clean(raw.name, 120),
    isin: isValidIsin(isin) ? isin : "",
    ticker: clean(raw.ticker, 20).toUpperCase(),
    units: nonNeg(raw.units),
    unit_price: nonNeg(raw.unit_price),
    value: nonNeg(raw.value) === null ? null : round2(raw.value as number),
    as_of: isRealIsoDate(raw.as_of) ? raw.as_of : "",
  };
  if (isBlankHolding(h)) return null;
  return h;
}

/** Sanitises a stored / form holdings list: blank and malformed rows dropped, capped at `AV_MAX_HOLDINGS`. Never throws. */
export function parseHoldings(raw: unknown): AvHolding[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, AV_MAX_HOLDINGS)
    .map(parseHolding)
    .filter((h): h is AvHolding => h !== null);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Blocking problems of one row (codes are translation keys). A blank row has none. */
export function getHoldingRowErrors(raw: unknown, todayIso: string): string[] {
  if (!isRecord(raw)) return ["av_hold_err_row"];
  const h = raw as Partial<Record<keyof AvHolding, unknown>>;
  if (isBlankHolding(h as Partial<AvHolding>)) return [];
  const errors: string[] = [];
  if (present(h.type) && !isHoldingType(h.type)) errors.push("av_hold_err_type");
  if (!clean(h.name, 1000)) errors.push("av_hold_err_name");
  if (!present(h.value) || badNum(h.value)) errors.push("av_hold_err_value");
  if (badNum(h.units)) errors.push("av_hold_err_units");
  if (badNum(h.unit_price)) errors.push("av_hold_err_price");
  const isin = clean(h.isin, 1000);
  if (isin && !isValidIsin(isin.toUpperCase())) errors.push("av_hold_err_isin");
  if (present(h.as_of)) {
    if (!isRealIsoDate(h.as_of)) errors.push("av_hold_err_date");
    else if (h.as_of > todayIso) errors.push("av_hold_err_date_future");
  }
  return errors;
}

/** Blocking problems of the whole list, de-duplicated, in a stable order. Non-array input is treated as no holdings. */
export function getHoldingsErrors(raw: unknown, todayIso: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return ["av_hold_err_invalid"];
  const errors: string[] = [];
  if (raw.length > AV_MAX_HOLDINGS) errors.push("av_hold_err_count");
  for (const row of raw) {
    for (const code of getHoldingRowErrors(row, todayIso)) if (!errors.includes(code)) errors.push(code);
  }
  return errors;
}

/** Non-blocking notices for the list. */
export function getHoldingsWarnings(holdings: AvHolding[]): string[] {
  const warnings: string[] = [];
  const list = Array.isArray(holdings) ? holdings : [];
  const seen = new Set<string>();
  let duplicate = false;
  let valueMismatch = false;
  for (const h of list) {
    if (h.isin) {
      if (seen.has(h.isin)) duplicate = true;
      seen.add(h.isin);
    }
    if (h.units !== null && h.unit_price !== null && h.value !== null) {
      const expected = h.units * h.unit_price;
      if (Math.abs(expected - h.value) > Math.max(AV_HOLDINGS_TOLERANCE, Math.abs(expected) * VALUE_MISMATCH_RATIO)) valueMismatch = true;
    }
  }
  if (duplicate) warnings.push("av_hold_warn_duplicate_isin");
  if (valueMismatch) warnings.push("av_hold_warn_value_mismatch");
  return warnings;
}

// ---------------------------------------------------------------------------
// Totals, reconciliation, derived allocation
// ---------------------------------------------------------------------------

const counted = (h: Pick<AvHolding, "value">): number => (typeof h.value === "number" && Number.isFinite(h.value) && h.value > 0 ? h.value : 0);

export function holdingsTotal(holdings: Pick<AvHolding, "value">[]): number {
  return round2((Array.isArray(holdings) ? holdings : []).reduce((s, h) => s + counted(h), 0));
}

export type HoldingsTypeTotal = { type: AvHoldingType; total: number; count: number; share: number };

/** Totals by holding type, largest first (ties by type order); `share` is a fraction 0..1 of the holdings total. */
export function holdingsByType(holdings: Pick<AvHolding, "type" | "value">[]): HoldingsTypeTotal[] {
  const list = Array.isArray(holdings) ? holdings : [];
  const total = holdingsTotal(list);
  const map = new Map<AvHoldingType, { total: number; count: number }>();
  for (const h of list) {
    if (!isHoldingType(h.type) || counted(h) <= 0) continue;
    const cur = map.get(h.type) ?? { total: 0, count: 0 };
    cur.total += counted(h);
    cur.count += 1;
    map.set(h.type, cur);
  }
  return [...map.entries()]
    .map(([type, v]) => ({ type, total: round2(v.total), count: v.count, share: total > 0 ? v.total / total : 0 }))
    .sort((a, b) => b.total - a.total || AV_HOLDING_TYPES.indexOf(a.type) - AV_HOLDING_TYPES.indexOf(b.type));
}

export type HoldingsReconciliation =
  | { state: "none" }
  | {
      /** "match" within tolerance; "under": holdings below the contract value; "over": above. */
      state: "match" | "under" | "over";
      holdingsTotal: number;
      /** The contract value used, or null when it was not entered. */
      contractValue: number | null;
      /** holdingsTotal - contractValue (null when no contract value). */
      difference: number | null;
    };

/**
 * Compares the holdings total with the contract's total value. Informational: the caller never blocks on it.
 * No holdings -> "none". Holdings but no (or invalid) contract value -> "match" is not claimed: `contractValue` is null.
 */
export function reconcileHoldings(holdings: Pick<AvHolding, "value">[], contractValue: number | null | undefined): HoldingsReconciliation {
  const list = Array.isArray(holdings) ? holdings : [];
  if (!list.some((h) => counted(h) > 0)) return { state: "none" };
  const total = holdingsTotal(list);
  if (typeof contractValue !== "number" || !Number.isFinite(contractValue)) {
    return { state: "match", holdingsTotal: total, contractValue: null, difference: null };
  }
  const diff = round2(total - contractValue);
  const state = Math.abs(diff) <= AV_HOLDINGS_TOLERANCE ? "match" : diff < 0 ? "under" : "over";
  return { state, holdingsTotal: total, contractValue, difference: diff };
}

/**
 * Euro-fund vs unit-linked percentages derived from the holdings (by value). The euro fund is the "euro_fund"
 * type; EVERYTHING else (funds, ETFs, real estate, bonds, direct securities, ... and a cash balance) is counted
 * on the unit-linked side, because the contract model is a two-way split that adds up to 100. Returns null when
 * the holdings total nothing (the manual percentages then stay).
 */
export function deriveAllocationFromHoldings(holdings: Pick<AvHolding, "type" | "value">[]): { euro_fund_pct: number; uc_pct: number } | null {
  const list = Array.isArray(holdings) ? holdings : [];
  const total = holdingsTotal(list);
  if (total <= 0) return null;
  const euro = list.filter((h) => h.type === "euro_fund").reduce((s, h) => s + counted(h), 0);
  const euroPct = round2(Math.min(100, Math.max(0, (euro / total) * 100)));
  return { euro_fund_pct: euroPct, uc_pct: round2(100 - euroPct) };
}
