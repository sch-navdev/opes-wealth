/**
 * Metadata for the "Assurance-Vie" asset category: a French life-insurance savings
 * contract. Stored in `assets.metadata` (same jsonb pattern as Companies / Vehicles /
 * Private Equity; migration 0036 only seeds the category row).
 *
 * The asset value (`assets.current_value`) is the TOTAL contract value as an ordinary
 * asset value. There is no live pricing and no unit-of-account (unité de compte) line
 * items / ISINs in this phase: the fund allocation is a pair of percentages and the
 * amounts shown in the UI are IMPLIED from the asset value.
 *
 * Everything here is pure and defensive: stored metadata is never trusted
 * (`parseAssuranceVieMetadata` sanitises anything it is given), and form state is
 * validated by `getAssuranceVieMetadataErrors` (error codes are translation keys).
 *
 * Dates are plain ISO calendar dates ("YYYY-MM-DD"). All date arithmetic works on
 * year/month/day numbers and UTC day counts, never on local-time `Date` instants, so the
 * result does not depend on the viewer's time zone. `today` is injectable everywhere.
 *
 * NOT in scope (deliberately): tax computation, estate-tax computation, unit-of-account
 * holdings and pricing, scheduling programmed premiums into the income calendar.
 */

/** The one place the tax constants live. Update here when the rules change. */
export const ASSURANCE_VIE_CONFIG = {
  /** Years from the CONTRACT OPENING date (not from each premium). */
  milestoneYears: 8,
  /** Annual allowance (abattement) on the GAINS part of withdrawals once the milestone is reached. */
  allowance: { currency: "EUR", single: 4600, couple: 9200 },
  /** Date the figures above were last recorded in the app. Not a claim about later legislation. */
  asOf: "2026-10-07",
  source: "French tax code, article 125-0 A (annual allowance on life-insurance withdrawals after 8 years)",
} as const;

export const AV_METADATA_VERSION = 1;
export const AV_MAX_BENEFICIARIES = 20;
/** Tolerance when checking that percentages total 100. */
export const AV_PCT_EPSILON = 0.01;

export type AvHousehold = "single" | "couple";
export type AvDepositType = "free" | "scheduled";
export type AvFrequency = "monthly" | "quarterly" | "yearly";
export type AvClauseType = "standard" | "free_text";

export const AV_HOUSEHOLDS: AvHousehold[] = ["single", "couple"];
export const AV_DEPOSIT_TYPES: AvDepositType[] = ["free", "scheduled"];
export const AV_FREQUENCIES: AvFrequency[] = ["monthly", "quarterly", "yearly"];
export const AV_CLAUSE_TYPES: AvClauseType[] = ["standard", "free_text"];

const PAYMENTS_PER_YEAR: Record<AvFrequency, number> = { monthly: 12, quarterly: 4, yearly: 1 };

export type AvBeneficiary = {
  /** Stable key for the form list (not personal data). */
  id: string;
  name: string;
  relationship: string;
  /** Share of the death benefit, in percent. */
  share_pct: number | null;
  clause: AvClauseType;
  clause_text: string;
};

export type AssuranceVieMetadata = {
  version: typeof AV_METADATA_VERSION;
  insurer: string;
  contract_name: string;
  contract_number: string;
  /** ISO date the contract was opened ("" when unknown). The 8-year clock starts here. */
  opened_on: string;
  household: AvHousehold;
  /** Percent of the contract in "Fonds en euros". `euro_fund_pct + uc_pct` = 100. */
  euro_fund_pct: number;
  /** Percent of the contract in "Unités de compte". */
  uc_pct: number;
  deposit_type: AvDepositType;
  /** Optional total of premiums paid so far. */
  premiums_paid_total: number | null;
  /** Programmed premiums (only kept when `deposit_type` is "scheduled"). */
  scheduled_amount: number | null;
  scheduled_frequency: AvFrequency;
  scheduled_day: number | null;
  scheduled_start_on: string;
  scheduled_end_on: string;
  /** Optional split of premiums by the holder's age when paid (informational only). */
  premiums_before_70: number | null;
  premiums_after_70: number | null;
  beneficiaries: AvBeneficiary[];
};

export const EMPTY_ASSURANCE_VIE_METADATA: AssuranceVieMetadata = {
  version: AV_METADATA_VERSION,
  insurer: "",
  contract_name: "",
  contract_number: "",
  opened_on: "",
  household: "single",
  euro_fund_pct: 100,
  uc_pct: 0,
  deposit_type: "free",
  premiums_paid_total: null,
  scheduled_amount: null,
  scheduled_frequency: "monthly",
  scheduled_day: null,
  scheduled_start_on: "",
  scheduled_end_on: "",
  premiums_before_70: null,
  premiums_after_70: null,
  beneficiaries: [],
};

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** A finite, non-negative number or null. */
function amount(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

// ---------------------------------------------------------------------------
// Dates (calendar arithmetic, time-zone independent)
// ---------------------------------------------------------------------------

type Ymd = { y: number; m: number; d: number };

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Strict "YYYY-MM-DD" parser: a real calendar date between 1900 and 2200, else null. */
export function parseIsoDate(value: unknown): Ymd | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export const isValidIsoDate = (value: unknown): value is string => parseIsoDate(value) !== null;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const formatYmd = ({ y, m, d }: Ymd) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
const dayNumber = ({ y, m, d }: Ymd) => Math.round(Date.UTC(y, m - 1, d) / 86_400_000);

/** The viewer's calendar day as an ISO date (local components, not the UTC date). */
export function localTodayIso(now: Date = new Date()): string {
  return formatYmd({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

function resolveToday(today?: string | Date): Ymd {
  if (typeof today === "string") {
    const parsed = parseIsoDate(today);
    if (parsed) return parsed;
  }
  const date = today instanceof Date && !Number.isNaN(today.getTime()) ? today : new Date();
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

/**
 * `opened_on` plus `years`, same month and day. A day that does not exist in the target
 * month (29 February in a non-leap year) falls on the last day of that month.
 */
export function addYearsToIso(iso: string, years: number): string | null {
  const p = parseIsoDate(iso);
  if (!p) return null;
  const y = p.y + years;
  return formatYmd({ y, m: p.m, d: Math.min(p.d, daysInMonth(y, p.m)) });
}

// ---------------------------------------------------------------------------
// Parsing / sanitising stored metadata
// ---------------------------------------------------------------------------

function parseBeneficiary(raw: unknown, index: number): AvBeneficiary | null {
  if (!isRecord(raw)) return null;
  const b: AvBeneficiary = {
    id: clean(raw.id, 40) || `b${index}`,
    name: clean(raw.name, 120),
    relationship: clean(raw.relationship, 60),
    share_pct: typeof raw.share_pct === "number" && Number.isFinite(raw.share_pct) && raw.share_pct >= 0 && raw.share_pct <= 100 ? round2(raw.share_pct) : null,
    clause: oneOf(raw.clause, AV_CLAUSE_TYPES, "standard"),
    clause_text: clean(raw.clause_text, 500),
  };
  if (b.clause === "standard") b.clause_text = "";
  // A row with nothing in it is a blank form row, not a beneficiary.
  if (!b.name && !b.relationship && b.share_pct === null && !b.clause_text) return null;
  return b;
}

/**
 * Turns anything (a database value, form state, garbage) into a well-formed, versioned
 * metadata object. Never throws. Invalid values fall back to the empty defaults; the
 * allocation is repaired so it always totals 100 (euro share wins when both are present).
 */
export function parseAssuranceVieMetadata(raw: unknown): AssuranceVieMetadata {
  if (!isRecord(raw)) return { ...EMPTY_ASSURANCE_VIE_METADATA, beneficiaries: [] };

  const pct = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? round2(v) : null);
  const euroIn = pct(raw.euro_fund_pct);
  const ucIn = pct(raw.uc_pct);
  let euro = 100;
  let uc = 0;
  if (euroIn !== null) {
    euro = euroIn;
    uc = round2(100 - euroIn);
  } else if (ucIn !== null) {
    uc = ucIn;
    euro = round2(100 - ucIn);
  }

  const depositType = oneOf(raw.deposit_type, AV_DEPOSIT_TYPES, "free");
  const scheduled = depositType === "scheduled";
  const day = raw.scheduled_day;
  const startOn = isValidIsoDate(raw.scheduled_start_on) ? raw.scheduled_start_on : "";
  const endOn = isValidIsoDate(raw.scheduled_end_on) ? raw.scheduled_end_on : "";

  const beneficiaries = (Array.isArray(raw.beneficiaries) ? raw.beneficiaries : [])
    .slice(0, AV_MAX_BENEFICIARIES)
    .map(parseBeneficiary)
    .filter((b): b is AvBeneficiary => b !== null);

  return {
    version: AV_METADATA_VERSION,
    insurer: clean(raw.insurer, 120),
    contract_name: clean(raw.contract_name, 120),
    contract_number: clean(raw.contract_number, 60),
    opened_on: isValidIsoDate(raw.opened_on) ? raw.opened_on : "",
    household: oneOf(raw.household, AV_HOUSEHOLDS, "single"),
    euro_fund_pct: euro,
    uc_pct: uc,
    deposit_type: depositType,
    premiums_paid_total: amount(raw.premiums_paid_total),
    // Programmed-premium fields are only meaningful for a programmed contract: drop stale ones.
    scheduled_amount: scheduled ? amount(raw.scheduled_amount) : null,
    scheduled_frequency: scheduled ? oneOf(raw.scheduled_frequency, AV_FREQUENCIES, "monthly") : "monthly",
    scheduled_day: scheduled && typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 31 ? day : null,
    scheduled_start_on: scheduled ? startOn : "",
    scheduled_end_on: scheduled ? endOn : "",
    premiums_before_70: amount(raw.premiums_before_70),
    premiums_after_70: amount(raw.premiums_after_70),
    beneficiaries,
  };
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/**
 * Keeps the two allocation shares linked: editing one sets the other to the remainder.
 * `value` is clamped to 0–100; a missing / non-finite value counts as 0.
 */
export function linkAllocation(changed: "euro" | "uc", value: number | null): { euro_fund_pct: number; uc_pct: number } {
  const v = typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, round2(value))) : 0;
  const rest = round2(100 - v);
  return changed === "euro" ? { euro_fund_pct: v, uc_pct: rest } : { euro_fund_pct: rest, uc_pct: v };
}

export function allocationTotal(md: Pick<AssuranceVieMetadata, "euro_fund_pct" | "uc_pct">): number {
  return round2((Number(md.euro_fund_pct) || 0) + (Number(md.uc_pct) || 0));
}

/** Implied amounts of each segment from the total contract value (they add back up to it). */
export function impliedAllocationAmounts(
  totalValue: number,
  md: Pick<AssuranceVieMetadata, "euro_fund_pct" | "uc_pct">,
): { euro: number; uc: number } {
  const total = Number.isFinite(totalValue) ? totalValue : 0;
  const euro = round2((total * (Number(md.euro_fund_pct) || 0)) / 100);
  return { euro, uc: round2(total - euro) };
}

// ---------------------------------------------------------------------------
// Premiums
// ---------------------------------------------------------------------------

/** Programmed premium × payments per year, or null when no amount is set. */
export function scheduledAnnualAmount(
  md: Pick<AssuranceVieMetadata, "deposit_type" | "scheduled_amount" | "scheduled_frequency">,
): number | null {
  if (md.deposit_type !== "scheduled" || md.scheduled_amount === null || !(md.scheduled_amount > 0)) return null;
  return round2(md.scheduled_amount * PAYMENTS_PER_YEAR[md.scheduled_frequency]);
}

/** True when the optional premiums-by-age split has at least one value (drives the neutral info line). */
export function hasPremiumAgeSplit(md: Pick<AssuranceVieMetadata, "premiums_before_70" | "premiums_after_70">): boolean {
  return md.premiums_before_70 !== null || md.premiums_after_70 !== null;
}

// ---------------------------------------------------------------------------
// Beneficiaries
// ---------------------------------------------------------------------------

export type BeneficiarySharesState = "none" | "complete" | "mismatch";

/** Sum of the shares that were entered (blank shares count for nothing). */
export function beneficiarySharesTotal(list: Pick<AvBeneficiary, "share_pct">[]): number {
  return round2(list.reduce((sum, b) => sum + (typeof b.share_pct === "number" && Number.isFinite(b.share_pct) ? b.share_pct : 0), 0));
}

/** "none": no share entered; "complete": shares total 100; "mismatch": entered but not 100 (a warning, not an error). */
export function beneficiarySharesState(list: Pick<AvBeneficiary, "share_pct">[]): BeneficiarySharesState {
  const anyShare = list.some((b) => typeof b.share_pct === "number" && Number.isFinite(b.share_pct));
  if (!anyShare) return "none";
  return Math.abs(beneficiarySharesTotal(list) - 100) <= AV_PCT_EPSILON ? "complete" : "mismatch";
}

export function emptyBeneficiary(id: string): AvBeneficiary {
  return { id, name: "", relationship: "", share_pct: null, clause: "standard", clause_text: "" };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const present = (v: unknown) => v !== null && v !== undefined && v !== "";
const bad = (v: unknown) => present(v) && !(typeof v === "number" && Number.isFinite(v) && v >= 0);

/**
 * Blocking problems as translation keys. Expects form-state-shaped input but never
 * throws on garbage (a non-object yields `av_err_invalid`). The beneficiaries total is NOT
 * an error (see `getAssuranceVieWarnings`).
 */
export function getAssuranceVieMetadataErrors(raw: unknown, today?: string | Date): string[] {
  if (!isRecord(raw)) return ["av_err_invalid"];
  const errors: string[] = [];
  const todayIso = formatYmd(resolveToday(today));

  if (present(raw.opened_on)) {
    if (!isValidIsoDate(raw.opened_on)) errors.push("av_err_opened_invalid");
    else if (raw.opened_on > todayIso) errors.push("av_err_opened_future");
  }

  const euro = raw.euro_fund_pct;
  const uc = raw.uc_pct;
  const inRange = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
  if (!inRange(euro) || !inRange(uc)) errors.push("av_err_allocation_range");
  else if (Math.abs((euro as number) + (uc as number) - 100) > AV_PCT_EPSILON) errors.push("av_err_allocation_total");

  if (bad(raw.premiums_paid_total) || bad(raw.premiums_before_70) || bad(raw.premiums_after_70)) {
    errors.push("av_err_premium_negative");
  }

  if (raw.deposit_type === "scheduled") {
    const amt = raw.scheduled_amount;
    if (!(typeof amt === "number" && Number.isFinite(amt) && amt > 0)) errors.push("av_err_scheduled_amount");
    if (!(AV_FREQUENCIES as string[]).includes(raw.scheduled_frequency as string)) errors.push("av_err_scheduled_frequency");
    const day = raw.scheduled_day;
    if (!(typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 31)) errors.push("av_err_scheduled_day");
    const start = raw.scheduled_start_on;
    const end = raw.scheduled_end_on;
    if ((present(start) && !isValidIsoDate(start)) || (present(end) && !isValidIsoDate(end))) {
      errors.push("av_err_scheduled_dates");
    } else if (isValidIsoDate(start) && isValidIsoDate(end) && end < start) {
      errors.push("av_err_scheduled_dates");
    }
  }

  const list = Array.isArray(raw.beneficiaries) ? raw.beneficiaries : [];
  if (list.length > AV_MAX_BENEFICIARIES) errors.push("av_err_bene_count");
  let nameMissing = false;
  let shareBad = false;
  for (const item of list) {
    if (!isRecord(item)) continue;
    const name = clean(item.name, 1000);
    const anyOther = !!clean(item.relationship, 1000) || present(item.share_pct) || !!clean(item.clause_text, 1000);
    if (!name && anyOther) nameMissing = true;
    if (present(item.share_pct) && !(typeof item.share_pct === "number" && Number.isFinite(item.share_pct) && item.share_pct >= 0 && item.share_pct <= 100)) {
      shareBad = true;
    }
  }
  if (nameMissing) errors.push("av_err_bene_name");
  if (shareBad) errors.push("av_err_bene_share");

  return errors;
}

/** Non-blocking notices as translation keys. */
export function getAssuranceVieWarnings(md: AssuranceVieMetadata): string[] {
  const warnings: string[] = [];
  const list = Array.isArray(md.beneficiaries) ? md.beneficiaries : [];
  if (beneficiarySharesState(list) === "mismatch") warnings.push("av_warn_bene_total");
  const total = md.premiums_paid_total;
  const split = (md.premiums_before_70 ?? 0) + (md.premiums_after_70 ?? 0);
  if (total !== null && split > total + AV_PCT_EPSILON) warnings.push("av_warn_premium_split");
  return warnings;
}

// ---------------------------------------------------------------------------
// The 8-year milestone
// ---------------------------------------------------------------------------

export type AllowanceInfo = {
  household: AvHousehold;
  amount: number;
  currency: string;
  asOf: string;
};

/** Annual allowance on the GAINS part of withdrawals after the milestone, for the household status. */
export function allowanceForHousehold(household: AvHousehold): AllowanceInfo {
  const { allowance, asOf } = ASSURANCE_VIE_CONFIG;
  return {
    household,
    amount: household === "couple" ? allowance.couple : allowance.single,
    currency: allowance.currency,
    asOf,
  };
}

export type MilestoneStatus =
  | { kind: "unknown" }
  | {
      kind: "before";
      /** ISO date of the 8th anniversary of the opening date. */
      date: string;
      daysRemaining: number;
      /** Whole calendar months remaining (the leftover days are not counted). */
      monthsRemaining: number;
      allowance: AllowanceInfo;
    }
  | { kind: "reached"; date: string; daysSince: number; allowance: AllowanceInfo };

/**
 * Where the contract stands against the 8-year milestone. The clock runs from the
 * CONTRACT OPENING date. On the anniversary itself the milestone counts as reached
 * (`daysSince` 0). Informational only: no tax amount is computed.
 */
export function computeMilestone(
  openedOn: unknown,
  household: AvHousehold = "single",
  today?: string | Date,
): MilestoneStatus {
  const opened = parseIsoDate(openedOn);
  if (!opened) return { kind: "unknown" };
  const target = parseIsoDate(addYearsToIso(formatYmd(opened), ASSURANCE_VIE_CONFIG.milestoneYears));
  if (!target) return { kind: "unknown" };

  const now = resolveToday(today);
  const diff = dayNumber(target) - dayNumber(now);
  const allowance = allowanceForHousehold(household);
  const date = formatYmd(target);

  if (diff <= 0) return { kind: "reached", date, daysSince: Math.abs(diff), allowance };

  let months = (target.y - now.y) * 12 + (target.m - now.m);
  if (target.d < now.d) months -= 1;
  return { kind: "before", date, daysRemaining: diff, monthsRemaining: Math.max(0, months), allowance };
}
