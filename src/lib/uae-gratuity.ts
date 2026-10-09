/**
 * UAE end-of-service gratuity: pure calculator and plan validation (no I/O, never throws).
 * Informational only, NOT legal advice. The rule set below is verified against public sources as of
 * `UAE_GRATUITY_RULES.asOf`; the UI shows that date.
 *
 * Law method (Federal Decree-Law 33 of 2021, Art. 51), foreign full-time worker, continuous contract:
 *  - basic wage only (never allowances, bonus or commission), daily wage = monthly basic / 30;
 *  - 21 days per year for each of the first 5 years, 30 days per year after the fifth;
 *  - part years pro rata, but nothing is due below 1 completed year;
 *  - the total cannot exceed 24 months of basic wage; the LAST basic wage is used;
 *  - days of absence without pay are not service.
 * Years convention: whole years by anniversary of the start date, the remainder / 365. Both the start
 * and the end date count as service days (2010-01-01 to 2019-12-31 is exactly 10 years).
 * Free zones (DIFC, ADGM) and UAE nationals follow other schemes: the UI warns, nothing is computed.
 */

export const UAE_GRATUITY_RULES = {
  asOf: "2026-10-09",
  source: "Federal Decree-Law No. 33 of 2021, Art. 51",
  daysPerYearFirstTier: 21,
  daysPerYearSecondTier: 30,
  firstTierYears: 5,
  capMonths: 24,
  daysPerMonthDivisor: 30,
  minYears: 1,
  paymentDueWithinDays: 14,
} as const;

export const MAX_WAGE_HISTORY = 50;
export const MAX_PAYMENTS = 100;
const MAX_MONEY = 1e12;
const DAY_MS = 86_400_000;

export type WageEntry = { from: string; basicMonthly: number };
export type GratuityPayment = { date: string; amount: number; note: string };

export type GratuityInput = {
  startDate: string;
  /** null / undefined: `today` (or the current date). */
  endDate?: string | null;
  today?: string;
  wageHistory: WageEntry[];
  unpaidLeaveDays?: number;
  payments?: GratuityPayment[];
  employerStatedBalance?: number | null;
};

export type GratuityWarning =
  | "grat_w_under_one_year"
  | "grat_w_cap_reached"
  | "grat_w_overpaid"
  | "grat_w_unpaid_leave_exceeds"
  | "grat_w_wage_before_start"
  | "grat_w_payment_ignored";

export type GratuityError = "grat_err_start" | "grat_err_end" | "grat_err_wage" | "grat_err_unpaid_leave";

export type Entitlement = {
  years: number;
  daysFirstTier: number;
  daysSecondTier: number;
  totalDays: number;
  /** Before the cap. */
  uncapped: number;
  amount: number;
  cap: number;
  capped: boolean;
};

export type PeriodSlice = {
  from: string;
  to: string;
  basicMonthly: number;
  serviceYears: number;
  entitlementDays: number;
  amount: number;
};

export type Reconciliation = {
  employerStated: number;
  computedOutstanding: number;
  /** employerStated - computedOutstanding; negative = employer states less than the calculation. */
  difference: number;
  status: "match" | "employer_lower" | "employer_higher";
};

export type GratuityResult =
  | { valid: false; errors: GratuityError[] }
  | {
      valid: true;
      startDate: string;
      endDate: string;
      lastBasic: number;
      service: { days: number; unpaidLeaveDays: number; years: number; wholeYears: number; extraDays: number };
      law: Entitlement;
      paid: { total: number; count: number; lastDate: string | null };
      outstanding: number;
      overpaidBy: number;
      /** Per month going forward at the current tier (0 once the cap is reached). */
      monthlyAccrual: number;
      period: { amount: number; difference: number; slices: PeriodSlice[] };
      sinceLastPayment: { from: string; years: number; entitlement: number };
      reconciliation: Reconciliation | null;
      warnings: GratuityWarning[];
    };

// ---------- dates ----------

/** Day number (days since epoch, UTC) of a strict YYYY-MM-DD, or null. */
export function parseDay(s: unknown): number | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return Math.round(t / DAY_MS);
}

export function formatDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function addYears(day: number, n: number): number {
  const d = new Date(day * DAY_MS);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return Math.round(d.getTime() / DAY_MS);
}

/** Years elapsed in [start, endExclusive): whole anniversaries plus remainder / 365. */
function yearsBetween(start: number, endExclusive: number): { years: number; whole: number; extraDays: number } {
  if (endExclusive <= start) return { years: 0, whole: 0, extraDays: 0 };
  let whole = 0;
  while (whole < 200 && addYears(start, whole + 1) <= endExclusive) whole++;
  const extraDays = endExclusive - addYears(start, whole);
  return { years: whole + extraDays / 365, whole, extraDays };
}

function serviceAt(start: number, endInclusive: number, unpaid: number) {
  const raw = endInclusive - start + 1;
  if (raw <= 0) return { years: 0, whole: 0, extraDays: 0, days: 0 };
  const eff = raw - unpaid;
  if (eff <= 0) return { years: 0, whole: 0, extraDays: 0, days: 0 };
  return { ...yearsBetween(start, start + eff), days: eff };
}

// ---------- law ----------

const R = UAE_GRATUITY_RULES;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Days of entitlement for cumulative service years (0 below the minimum). */
function daysForYears(years: number): { d1: number; d2: number } {
  if (!(years >= R.minYears)) return { d1: 0, d2: 0 };
  return {
    d1: R.daysPerYearFirstTier * Math.min(years, R.firstTierYears),
    d2: R.daysPerYearSecondTier * Math.max(0, years - R.firstTierYears),
  };
}

/** Law-method entitlement for `years` of service at one basic wage. */
export function entitlementFor(years: number, basicMonthly: number): Entitlement {
  const y = Number.isFinite(years) && years > 0 ? years : 0;
  const basic = Number.isFinite(basicMonthly) && basicMonthly > 0 ? basicMonthly : 0;
  const { d1, d2 } = daysForYears(y);
  const uncapped = ((d1 + d2) * basic) / R.daysPerMonthDivisor;
  const cap = R.capMonths * basic;
  const capped = uncapped > cap;
  return {
    years: y,
    daysFirstTier: d1,
    daysSecondTier: d2,
    totalDays: d1 + d2,
    uncapped: round2(uncapped),
    amount: round2(Math.min(uncapped, cap)),
    cap: round2(cap),
    capped,
  };
}

export function reconcile(employerStated: number | null | undefined, outstanding: number): Reconciliation | null {
  if (employerStated == null || !Number.isFinite(employerStated) || employerStated < 0) return null;
  const difference = round2(employerStated - outstanding);
  const status = Math.abs(difference) < 1 ? "match" : difference < 0 ? "employer_lower" : "employer_higher";
  return { employerStated, computedOutstanding: outstanding, difference, status };
}

function cleanWages(history: unknown): WageEntry[] {
  if (!Array.isArray(history)) return [];
  const out: { from: number; basic: number }[] = [];
  for (const e of history.slice(0, MAX_WAGE_HISTORY)) {
    const from = parseDay((e as WageEntry)?.from);
    const basic = (e as WageEntry)?.basicMonthly;
    if (from == null || typeof basic !== "number" || !Number.isFinite(basic) || basic <= 0 || basic > MAX_MONEY) continue;
    out.push({ from, basic });
  }
  out.sort((a, b) => a.from - b.from);
  return out.map((o) => ({ from: formatDay(o.from), basicMonthly: o.basic }));
}

export function calculateGratuity(input: GratuityInput): GratuityResult {
  try {
    const errors: GratuityError[] = [];
    const start = parseDay(input?.startDate);
    if (start == null) errors.push("grat_err_start");
    const todayStr = input?.today ?? new Date().toISOString().slice(0, 10);
    const endStr = input?.endDate ? input.endDate : todayStr;
    const end = parseDay(endStr);
    if (end == null || (start != null && end < start)) errors.push("grat_err_end");
    const unpaid = input?.unpaidLeaveDays ?? 0;
    if (!Number.isInteger(unpaid) || unpaid < 0 || unpaid > 36_500) errors.push("grat_err_unpaid_leave");
    const wages = cleanWages(input?.wageHistory);
    if (wages.length === 0) errors.push("grat_err_wage");
    if (errors.length > 0 || start == null || end == null) return { valid: false, errors };

    const warnings: GratuityWarning[] = [];
    // Last basic wage: the latest entry in force on the end date (else the first entry).
    const inForce = wages.filter((w) => parseDay(w.from)! <= end);
    const lastWage = inForce.length > 0 ? inForce[inForce.length - 1] : wages[0];
    const lastBasic = lastWage.basicMonthly;
    if (parseDay(wages[0].from)! > start) warnings.push("grat_w_wage_before_start");

    const svc = serviceAt(start, end, unpaid);
    if (unpaid >= end - start + 1) warnings.push("grat_w_unpaid_leave_exceeds");
    const law = entitlementFor(svc.years, lastBasic);
    if (svc.years < R.minYears) warnings.push("grat_w_under_one_year");
    if (law.capped) warnings.push("grat_w_cap_reached");

    // Payments already received.
    let paidTotal = 0;
    let paidCount = 0;
    let lastPaid: number | null = null;
    const rawPayments = Array.isArray(input.payments) ? input.payments.slice(0, MAX_PAYMENTS) : [];
    for (const p of rawPayments) {
      const d = parseDay(p?.date);
      if (d == null || typeof p.amount !== "number" || !Number.isFinite(p.amount) || p.amount < 0 || p.amount > MAX_MONEY) {
        if (!warnings.includes("grat_w_payment_ignored")) warnings.push("grat_w_payment_ignored");
        continue;
      }
      paidTotal += p.amount;
      paidCount++;
      if (lastPaid == null || d > lastPaid) lastPaid = d;
    }
    paidTotal = round2(paidTotal);
    const outstanding = round2(Math.max(0, law.amount - paidTotal));
    const overpaidBy = round2(Math.max(0, paidTotal - law.amount));
    if (overpaidBy > 0) warnings.push("grat_w_overpaid");

    // Accrual going forward.
    const rate = svc.years < R.firstTierYears ? R.daysPerYearFirstTier : R.daysPerYearSecondTier;
    const monthlyAccrual = law.capped || law.amount >= law.cap ? 0 : round2(((rate / 12) * lastBasic) / R.daysPerMonthDivisor);

    // Period-accrual view: each slice of service at the basic wage in force then.
    const slices: PeriodSlice[] = [];
    const rawDays = end - start + 1;
    let prevYears = 0;
    let periodRaw = 0;
    const totalYears = svc.years;
    const gated = totalYears >= R.minYears;
    for (let i = 0; i < wages.length; i++) {
      const wFrom = i === 0 ? start : Math.max(start, parseDay(wages[i].from)!);
      const next = i + 1 < wages.length ? parseDay(wages[i + 1].from)! - 1 : end;
      const wTo = Math.min(end, next);
      if (wTo < wFrom) continue;
      const share = Math.round((unpaid * (wTo - start + 1)) / rawDays);
      const cum = wTo === end ? totalYears : serviceAt(start, wTo, share).years;
      const a = prevYears;
      const b = Math.max(a, cum);
      const days = gated
        ? R.daysPerYearFirstTier * Math.max(0, Math.min(b, R.firstTierYears) - Math.min(a, R.firstTierYears)) +
          R.daysPerYearSecondTier * Math.max(0, b - Math.max(a, R.firstTierYears))
        : 0;
      const amount = (days * wages[i].basicMonthly) / R.daysPerMonthDivisor;
      periodRaw += amount;
      slices.push({
        from: formatDay(wFrom),
        to: formatDay(wTo),
        basicMonthly: wages[i].basicMonthly,
        serviceYears: round2(b - a),
        entitlementDays: round2(days),
        amount: round2(amount),
      });
      prevYears = b;
    }
    const periodAmount = round2(Math.min(periodRaw, law.cap));

    // Since the last payment: law-method entitlement added after the last paid date.
    let sinceFrom = start;
    let sinceEntitlement = law.amount;
    let sinceYears = svc.years;
    if (lastPaid != null) {
      sinceFrom = Math.min(lastPaid + 1, end + 1);
      const atPaid = lastPaid >= start ? serviceAt(start, lastPaid, Math.round((unpaid * (lastPaid - start + 1)) / rawDays)) : null;
      const before = atPaid ? entitlementFor(atPaid.years, lastBasic).amount : 0;
      sinceEntitlement = round2(Math.max(0, law.amount - before));
      sinceYears = Math.max(0, svc.years - (atPaid?.years ?? 0));
    }

    return {
      valid: true,
      startDate: formatDay(start),
      endDate: formatDay(end),
      lastBasic,
      service: { days: svc.days, unpaidLeaveDays: unpaid, years: svc.years, wholeYears: svc.whole, extraDays: svc.extraDays },
      law,
      paid: { total: paidTotal, count: paidCount, lastDate: lastPaid == null ? null : formatDay(lastPaid) },
      outstanding,
      overpaidBy,
      monthlyAccrual,
      period: { amount: periodAmount, difference: round2(periodAmount - law.amount), slices },
      sinceLastPayment: { from: formatDay(sinceFrom), years: sinceYears, entitlement: sinceEntitlement },
      reconciliation: reconcile(input.employerStatedBalance, outstanding),
      warnings,
    };
  } catch {
    return { valid: false, errors: ["grat_err_start"] };
  }
}

// ---------- plan (stored row) validation ----------

export type ContractType = "unlimited" | "limited";

export type EndOfServicePlanInput = {
  employer: string;
  start_date: string;
  end_date: string | null;
  contract_type: ContractType;
  unpaid_leave_days: number;
  wage_history: WageEntry[];
  payments: GratuityPayment[];
  employer_stated_balance: number | null;
  currency: string;
  notes: string;
};

export type EndOfServicePlan = EndOfServicePlanInput & { id: string };

export type PlanError =
  | "grat_err_employer"
  | "grat_err_start"
  | "grat_err_end"
  | "grat_err_contract"
  | "grat_err_unpaid_leave"
  | "grat_err_wage"
  | "grat_err_wage_count"
  | "grat_err_payment"
  | "grat_err_payment_count"
  | "grat_err_stated"
  | "grat_err_currency"
  | "grat_err_notes";

export type PlanValidation = { ok: true; value: EndOfServicePlanInput } | { ok: false; error: PlanError };

const isMoney = (n: unknown, allowZero: boolean): n is number =>
  typeof n === "number" && Number.isFinite(n) && n <= MAX_MONEY && (allowZero ? n >= 0 : n > 0);

export function validatePlan(raw: unknown): PlanValidation {
  try {
    const r = (raw ?? {}) as Record<string, unknown>;
    const employer = typeof r.employer === "string" ? r.employer.trim() : "";
    if (employer.length < 1 || employer.length > 120) return { ok: false, error: "grat_err_employer" };
    const start = parseDay(r.start_date);
    if (start == null) return { ok: false, error: "grat_err_start" };
    let endDate: string | null = null;
    if (r.end_date != null && r.end_date !== "") {
      const e = parseDay(r.end_date);
      if (e == null || e < start) return { ok: false, error: "grat_err_end" };
      endDate = r.end_date as string;
    }
    if (r.contract_type !== "unlimited" && r.contract_type !== "limited") return { ok: false, error: "grat_err_contract" };
    const unpaid = r.unpaid_leave_days ?? 0;
    if (typeof unpaid !== "number" || !Number.isInteger(unpaid) || unpaid < 0 || unpaid > 36_500) return { ok: false, error: "grat_err_unpaid_leave" };
    if (!Array.isArray(r.wage_history) || r.wage_history.length < 1) return { ok: false, error: "grat_err_wage" };
    if (r.wage_history.length > MAX_WAGE_HISTORY) return { ok: false, error: "grat_err_wage_count" };
    const wages: WageEntry[] = [];
    for (const w of r.wage_history as WageEntry[]) {
      if (parseDay(w?.from) == null || !isMoney(w?.basicMonthly, false)) return { ok: false, error: "grat_err_wage" };
      wages.push({ from: w.from, basicMonthly: w.basicMonthly });
    }
    wages.sort((a, b) => parseDay(a.from)! - parseDay(b.from)!);
    const payRaw = r.payments ?? [];
    if (!Array.isArray(payRaw)) return { ok: false, error: "grat_err_payment" };
    if (payRaw.length > MAX_PAYMENTS) return { ok: false, error: "grat_err_payment_count" };
    const payments: GratuityPayment[] = [];
    for (const p of payRaw as GratuityPayment[]) {
      const note = typeof p?.note === "string" ? p.note.trim() : "";
      if (parseDay(p?.date) == null || !isMoney(p?.amount, true) || note.length > 200) return { ok: false, error: "grat_err_payment" };
      payments.push({ date: p.date, amount: p.amount, note });
    }
    payments.sort((a, b) => parseDay(a.date)! - parseDay(b.date)!);
    let stated: number | null = null;
    if (r.employer_stated_balance != null && r.employer_stated_balance !== "") {
      if (!isMoney(r.employer_stated_balance, true)) return { ok: false, error: "grat_err_stated" };
      stated = r.employer_stated_balance;
    }
    const currency = typeof r.currency === "string" ? r.currency.trim().toUpperCase() : "";
    if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "grat_err_currency" };
    const notes = typeof r.notes === "string" ? r.notes : "";
    if (notes.length > 2000) return { ok: false, error: "grat_err_notes" };
    return {
      ok: true,
      value: {
        employer,
        start_date: r.start_date as string,
        end_date: endDate,
        contract_type: r.contract_type,
        unpaid_leave_days: unpaid,
        wage_history: wages,
        payments,
        employer_stated_balance: stated,
        currency,
        notes,
      },
    };
  } catch {
    return { ok: false, error: "grat_err_employer" };
  }
}

/** Reads a DB row into a plan; null when it does not parse. Never throws. */
export function parsePlanRow(row: unknown): EndOfServicePlan | null {
  try {
    const r = row as Record<string, unknown>;
    if (typeof r?.id !== "string") return null;
    const stated = r.employer_stated_balance;
    const v = validatePlan({
      employer: r.employer,
      start_date: r.start_date,
      end_date: r.end_date ?? null,
      contract_type: r.contract_type,
      unpaid_leave_days: r.unpaid_leave_days,
      wage_history: r.wage_history,
      payments: r.payments,
      employer_stated_balance: stated == null ? null : Number(stated),
      currency: typeof r.currency === "string" ? r.currency.trim() : r.currency,
      notes: r.notes ?? "",
    });
    return v.ok ? { ...v.value, id: r.id } : null;
  } catch {
    return null;
  }
}
