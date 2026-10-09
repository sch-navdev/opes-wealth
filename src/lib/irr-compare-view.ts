/**
 * Pure view logic of the IRR comparison page: locale-aware number parsing, validation of the
 * manual savings-plan fields, and the computed card ("side") for a manual plan or a holding.
 * The maths is in `lib/irr.ts`; the holding flows come from `compare/actions.ts`.
 */
import { moneyFormatter } from "./money-parts";
import { savingsPlanFlows, solveSavingsPlan, summarizeFlows, xirr } from "@/lib/irr";
import type {
  ComparableHolding,
  CompareSideResult,
  DatedFlow,
  IrrResult,
  SavingsPlanInput,
} from "@/lib/irr-compare-types";

/* ---------- locale-aware number parsing ---------- */

/**
 * Parses what a person types in `locale` ("1 234,5" in French, "1,234.5" in English, "30'000").
 * Returns null for empty or unparseable text. Accepts a lone "." or "," as decimal mark unless it
 * is the locale's group mark followed by exactly three digits ("1.500" in German = 1500).
 */
export function parseLocaleNumber(text: string, locale: string): number | null {
  let s = text.trim().replace(/[\s  '’]/g, "");
  if (s === "") return null;

  let group = ",";
  let decimal = ".";
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    group = parts.find((p) => p.type === "group")?.value ?? group;
    decimal = parts.find((p) => p.type === "decimal")?.value ?? decimal;
  } catch {
    // unknown locale: English separators
  }

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalChar = lastDot > lastComma ? "." : ",";
    const groupChar = decimalChar === "." ? "," : ".";
    s = s.split(groupChar).join("").replace(decimalChar, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const ch = lastDot >= 0 ? "." : ",";
    const count = s.split(ch).length - 1;
    const digitsAfter = s.length - s.lastIndexOf(ch) - 1;
    if (count > 1) s = s.split(ch).join("");
    else if (ch === group && ch !== decimal && digitsAfter === 3) s = s.replace(ch, "");
    else s = s.replace(ch, ".");
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ---------- manual savings plan ---------- */

export type ManualFields = { initial: string; monthly: string; final: string; years: string };
export type ManualField = keyof ManualFields;
export type ManualError = "required" | "number" | "negative" | "final" | "years";

export type ManualValidation = {
  /** Set only when every field is valid. */
  input: SavingsPlanInput | null;
  errors: Partial<Record<ManualField, ManualError>>;
  /** Initial capital and monthly saving are both zero. */
  nothingInvested: boolean;
  /** No field has been typed yet. */
  blank: boolean;
};

export const MIN_YEARS = 1 / 12;
export const MAX_YEARS = 100;

/** Initial capital and monthly saving may stay empty (= 0); final capital and duration are required. */
export function validateManual(fields: ManualFields, locale: string): ManualValidation {
  const errors: ManualValidation["errors"] = {};
  const value = (field: ManualField, optional: boolean): number => {
    const text = fields[field];
    if (text.trim() === "") {
      if (!optional) errors[field] = "required";
      return 0;
    }
    const n = parseLocaleNumber(text, locale);
    if (n === null) {
      errors[field] = "number";
      return 0;
    }
    if (n < 0) errors[field] = "negative";
    return n;
  };

  const initialCapital = value("initial", true);
  const monthlySaving = value("monthly", true);
  const finalCapital = value("final", false);
  const years = value("years", false);
  if (!errors.final && finalCapital <= 0) errors.final = "final";
  // The solver works in whole months (20 years, 1.5 years = 18 months).
  const wholeMonths = Math.abs(Math.round(years * 12) - years * 12) < 1e-6;
  if (!errors.years && (years < MIN_YEARS - 1e-9 || years > MAX_YEARS || !wholeMonths)) errors.years = "years";

  const nothingInvested = !errors.initial && !errors.monthly && initialCapital <= 0 && monthlySaving <= 0;
  // Only the four fields count (callers may pass a wider state object).
  const blank = [fields.initial, fields.monthly, fields.final, fields.years].every((t) => t.trim() === "");
  const valid = Object.keys(errors).length === 0 && !nothingInvested;
  return {
    input: valid ? { initialCapital, monthlySaving, finalCapital, years } : null,
    errors,
    nothingInvested,
    blank,
  };
}

/* ---------- computed sides ---------- */

/** Running net position by date (same-day flows are summed). */
export function cumulativeSeries(flows: DatedFlow[]): { date: string; value: number }[] {
  const byDate = new Map<string, number>();
  for (const f of flows) byDate.set(f.date, (byDate.get(f.date) ?? 0) + f.amount);
  let running = 0;
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => {
      running += amount;
      return { date, value: running };
    });
}

function buildSide(
  label: string,
  currency: string,
  flows: DatedFlow[],
  irr: IrrResult,
  extra: Partial<CompareSideResult> = {},
): CompareSideResult {
  const warnings: CompareSideResult["warnings"] = [...(extra.warnings ?? [])];
  if (irr.ok && irr.multipleRoots) warnings.push("multiple_roots");
  return {
    label,
    currency,
    irr,
    summary: summarizeFlows(flows),
    series: cumulativeSeries(flows),
    ...extra,
    warnings,
  };
}

/** The card of a manual savings plan (null while the fields are invalid). */
export function computeManualSide(label: string, currency: string, input: SavingsPlanInput): CompareSideResult {
  const plan = solveSavingsPlan(input);
  const flows = savingsPlanFlows(input);
  if (!plan.ok) {
    const reason = plan.reason === "invalid_input" ? "no_solution" : plan.reason;
    return buildSide(label, currency, flows, { ok: false, reason });
  }
  return buildSide(label, currency, flows, { ok: true, rate: plan.effectiveAnnualRate, multipleRoots: false }, { plan });
}

/** True when a holding can be compared (it has flows and no `unavailable` reason). */
export function isHoldingAvailable(h: ComparableHolding): boolean {
  return !h.unavailable && (h.flows?.length ?? 0) > 0;
}

/** The card of one of the user's holdings, or null when it is unavailable. */
export function computeHoldingSide(label: string, h: ComparableHolding): CompareSideResult | null {
  if (!isHoldingAvailable(h) || !h.flows) return null;
  const warnings: CompareSideResult["warnings"] = [];
  if (h.includes && !h.includes.income) warnings.push("income_excluded");
  if (h.includes && !h.includes.financing) warnings.push("financing_excluded");
  return buildSide(label, h.currency, h.flows, xirr(h.flows), { warnings });
}

/* ---------- comparison ---------- */

/** Horizons further apart than this many years trigger the "different horizons" warning. */
export const HORIZON_TOLERANCE_YEARS = 0.5;

export function horizonsDiffer(a: CompareSideResult, b: CompareSideResult): boolean {
  if (!a.summary || !b.summary) return false;
  return Math.abs(a.summary.years - b.summary.years) > HORIZON_TOLERANCE_YEARS;
}

/** A minus B in percentage points, or null when either rate is missing. */
export function rateDifferencePp(a: CompareSideResult, b: CompareSideResult): number | null {
  if (!a.irr.ok || !b.irr.ok) return null;
  return (a.irr.rate - b.irr.rate) * 100;
}

/* ---------- formatting ---------- */

export function formatRate(rate: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rate);
}

/** Signed difference in percentage points, e.g. "+1.25". */
export function formatPoints(points: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(points);
}

export function formatMoney(n: number, locale: string, currency: string): string {
  try {
    return moneyFormatter(locale, currency, { maximumFractionDigits: 0 }).format(n);
  } catch {
    return n.toLocaleString(locale, { maximumFractionDigits: 0 });
  }
}

export function formatYears(years: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(years);
}

export function formatMultiple(multiple: number | null, locale: string): string {
  return multiple === null ? "-" : `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(multiple)}x`;
}
