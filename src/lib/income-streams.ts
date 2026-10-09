import { convertAmount } from "@/lib/fx";

/**
 * Personal Cash Flow, step 1: EARNED income streams (salary, bonus, freelance...). Amounts are NET:
 * what lands in the bank. Pure helpers (no I/O, never throw): validation that returns error codes,
 * monthly normalisation in the Base Currency, expansion into dated occurrences for a 12-month window
 * and totals by month / kind. The codes are also i18n keys (`cf_err_*`).
 *
 * Schedule rules (`pay_day` null = the 1st; day 29-31 is clamped to the month's last day):
 *  - monthly    every month
 *  - quarterly  4 payments, 3 months apart, starting `pay_month` (default: the start date's month)
 *  - annual     once a year in `pay_month` (required)
 *  - one_off    once, on the first `pay_month` / `pay_day` on or after `start_date` (`pay_month` required)
 * A payment counts only when its date is within [start_date, end_date] (end inclusive, null = open).
 *
 * Monthly equivalent (run-rate): monthly x1, quarterly /3, annual /12; one-off 0 (it is not recurring;
 * it IS part of the 12-month window total). Streams already ended at `asOf` have no run-rate.
 */
export const INCOME_KINDS = ["salary", "bonus", "freelance", "rental", "pension", "dividend_other", "other"] as const;
export type IncomeKind = (typeof INCOME_KINDS)[number];

export const INCOME_FREQUENCIES = ["monthly", "quarterly", "annual", "one_off"] as const;
export type IncomeFrequency = (typeof INCOME_FREQUENCIES)[number];

export type IncomeStreamInput = {
  kind: IncomeKind;
  label: string;
  source_name: string;
  /** NET amount per payment, in `currency`. */
  amount: number;
  currency: string;
  frequency: IncomeFrequency;
  pay_day: number | null;
  pay_month: number | null;
  /** YYYY-MM-DD */
  start_date: string;
  end_date: string | null;
  notes: string;
};

export type IncomeStream = IncomeStreamInput & { id: string };

export type IncomeStreamError =
  | "cf_err_kind"
  | "cf_err_label"
  | "cf_err_source"
  | "cf_err_amount"
  | "cf_err_currency"
  | "cf_err_frequency"
  | "cf_err_pay_day"
  | "cf_err_pay_month"
  | "cf_err_start"
  | "cf_err_end"
  | "cf_err_notes";

export type IncomeStreamValidation =
  | { ok: true; value: IncomeStreamInput }
  | { ok: false; error: IncomeStreamError };

const MAX_AMOUNT = 1e13;

function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function intOrNull(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) ? n : undefined;
}

/** Validates untrusted input (a form, a request). Returns the cleaned value or the FIRST error code; never throws. */
export function validateIncomeStream(raw: unknown): IncomeStreamValidation {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fail = (error: IncomeStreamError): IncomeStreamValidation => ({ ok: false, error });

  if (!INCOME_KINDS.includes(r.kind as IncomeKind)) return fail("cf_err_kind");
  const label = typeof r.label === "string" ? r.label.trim() : "";
  if (label.length < 1 || label.length > 120) return fail("cf_err_label");
  const source = typeof r.source_name === "string" ? r.source_name.trim() : r.source_name == null ? "" : null;
  if (source === null || source.length > 120) return fail("cf_err_source");

  const amount = typeof r.amount === "number" ? r.amount : typeof r.amount === "string" && r.amount.trim() !== "" ? Number(r.amount) : NaN;
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) return fail("cf_err_amount");

  const currency = typeof r.currency === "string" ? r.currency.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currency)) return fail("cf_err_currency");
  if (!INCOME_FREQUENCIES.includes(r.frequency as IncomeFrequency)) return fail("cf_err_frequency");
  const frequency = r.frequency as IncomeFrequency;

  const payDay = intOrNull(r.pay_day);
  if (payDay === undefined || (payDay !== null && (payDay < 1 || payDay > 31))) return fail("cf_err_pay_day");
  let payMonth = intOrNull(r.pay_month);
  if (payMonth === undefined || (payMonth !== null && (payMonth < 1 || payMonth > 12))) return fail("cf_err_pay_month");
  if ((frequency === "annual" || frequency === "one_off") && payMonth === null) return fail("cf_err_pay_month");
  if (frequency === "monthly") payMonth = null;

  if (!isIsoDate(r.start_date)) return fail("cf_err_start");
  const endRaw = r.end_date === "" || r.end_date === undefined ? null : r.end_date;
  if (endRaw !== null && (!isIsoDate(endRaw) || endRaw < r.start_date)) return fail("cf_err_end");

  const notes = typeof r.notes === "string" ? r.notes.trim() : r.notes == null ? "" : null;
  if (notes === null || notes.length > 2000) return fail("cf_err_notes");

  return {
    ok: true,
    value: {
      kind: r.kind as IncomeKind,
      label,
      source_name: source,
      amount: Math.round(amount * 100) / 100,
      currency,
      frequency,
      pay_day: payDay,
      pay_month: payMonth,
      start_date: r.start_date,
      end_date: endRaw as string | null,
      notes,
    },
  };
}

/** Builds a stream from a database row (numeric columns may arrive as strings); null when the row is unusable. */
export function parseIncomeStreamRow(row: unknown): IncomeStream | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  const v = validateIncomeStream({ ...r, end_date: r.end_date ?? null });
  return v.ok ? { id: r.id, ...v.value } : null;
}

const PER_MONTH: Record<IncomeFrequency, number> = { monthly: 1, quarterly: 1 / 3, annual: 1 / 12, one_off: 0 };

/** True when the stream has not ended at `asOf` (YYYY-MM-DD). */
export function isStreamCurrent(s: Pick<IncomeStream, "end_date">, asOf: string): boolean {
  return s.end_date === null || s.end_date >= asOf;
}

/** Run-rate of one stream per month in its own currency (0 for one-off or an ended stream). */
export function monthlyEquivalent(s: IncomeStream, asOf: string): number {
  return isStreamCurrent(s, asOf) ? s.amount * PER_MONTH[s.frequency] : 0;
}

/** Run-rate per month in `baseCurrency`. */
export function monthlyEquivalentBase(s: IncomeStream, asOf: string, baseCurrency: string, rates: Record<string, number>): number {
  return convertAmount(monthlyEquivalent(s, asOf), s.currency, baseCurrency, rates);
}

export type IncomeOccurrence = {
  streamId: string;
  kind: IncomeKind;
  label: string;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM */
  month: string;
  /** NET, in `currency`. */
  amount: number;
  currency: string;
  /** NET, in the Base Currency. */
  baseAmount: number;
};

function monthKey(year: number, monthIndex: number): string {
  const y = year + Math.floor(monthIndex / 12);
  const m = ((monthIndex % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function dateIn(monthKeyStr: string, day: number): string {
  const [y, m] = monthKeyStr.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monthKeyStr}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** The `months` consecutive "YYYY-MM" keys starting with the month of `firstMonth` ("YYYY-MM" or a date). */
export function windowMonths(firstMonth: string, months = 12): string[] {
  const y = Number(firstMonth.slice(0, 4));
  const m = Number(firstMonth.slice(5, 7)) - 1;
  return Array.from({ length: months }, (_, i) => monthKey(y, m + i));
}

/** The payment dates of one stream inside the given months, in order. */
function scheduledDates(s: IncomeStream, keys: string[]): string[] {
  const day = s.pay_day ?? 1;
  const startMonthNo = Number(s.start_date.slice(5, 7));
  const out: string[] = [];
  for (const key of keys) {
    const monthNo = Number(key.slice(5, 7));
    let hit = false;
    if (s.frequency === "monthly") hit = true;
    else if (s.frequency === "quarterly") hit = (((monthNo - (s.pay_month ?? startMonthNo)) % 3) + 3) % 3 === 0;
    else if (s.frequency === "annual") hit = monthNo === s.pay_month;
    else hit = monthNo === s.pay_month;
    if (!hit) continue;
    const date = dateIn(key, day);
    if (date < s.start_date || (s.end_date !== null && date > s.end_date)) continue;
    if (s.frequency === "one_off") {
      // Only the FIRST date on or after the start date.
      const startYear = Number(s.start_date.slice(0, 4));
      let first = dateIn(`${startYear}-${String(s.pay_month).padStart(2, "0")}`, day);
      if (first < s.start_date) first = dateIn(`${startYear + 1}-${String(s.pay_month).padStart(2, "0")}`, day);
      if (date !== first) continue;
    }
    out.push(date);
  }
  return out;
}

/**
 * Dated payments of all `streams` in the 12 (or `months`) calendar months starting with `firstMonth`,
 * sorted by date, with each amount also converted to `baseCurrency`.
 */
export function expandIncomeStreams(
  streams: IncomeStream[],
  firstMonth: string,
  rates: Record<string, number>,
  baseCurrency: string,
  months = 12,
): IncomeOccurrence[] {
  const keys = windowMonths(firstMonth, months);
  const out: IncomeOccurrence[] = [];
  for (const s of streams) {
    if (!(s.amount > 0)) continue;
    for (const date of scheduledDates(s, keys)) {
      out.push({
        streamId: s.id,
        kind: s.kind,
        label: s.label,
        date,
        month: date.slice(0, 7),
        amount: s.amount,
        currency: s.currency,
        baseAmount: convertAmount(s.amount, s.currency, baseCurrency, rates),
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

export function totalsByMonth(occurrences: IncomeOccurrence[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of occurrences) out[o.month] = (out[o.month] ?? 0) + o.baseAmount;
  return out;
}

export function totalsByKind(occurrences: IncomeOccurrence[]): Record<IncomeKind, number> {
  const out = Object.fromEntries(INCOME_KINDS.map((k) => [k, 0])) as Record<IncomeKind, number>;
  for (const o of occurrences) out[o.kind] += o.baseAmount;
  return out;
}

/** The three legend groups of the earned-income layer in the income calendar. */
export type EarnedGroup = "salary" | "bonus" | "other";

export function earnedGroupOf(kind: IncomeKind): EarnedGroup {
  return kind === "salary" ? "salary" : kind === "bonus" ? "bonus" : "other";
}

export type IncomeStreamsSummary = {
  /** Sum of the run-rates, Base Currency per month (one-off and ended streams excluded). */
  monthlyEquivalent: number;
  /** Total of the next 12 calendar months' payments, Base Currency (one-offs included). */
  next12Months: number;
};

export function summarizeIncomeStreams(
  streams: IncomeStream[],
  asOf: string,
  rates: Record<string, number>,
  baseCurrency: string,
): IncomeStreamsSummary {
  const monthly = streams.reduce((s, x) => s + monthlyEquivalentBase(x, asOf, baseCurrency, rates), 0);
  const occ = expandIncomeStreams(streams, asOf, rates, baseCurrency);
  return { monthlyEquivalent: monthly, next12Months: occ.reduce((s, o) => s + o.baseAmount, 0) };
}
