/**
 * IRR maths. Two generations live in this file:
 *  - `calculateIrr` (legacy, Newton + bisection, returns `number | null`): used by the asset
 *    detail page and `private-equity.ts`; left untouched on purpose.
 *  - `xirr` / `periodicIrr` / `solveSavingsPlan` / ... (the IRR comparison tool): robust
 *    root-bracketing solver with typed failures. See the section at the bottom of the file.
 */
import type {
  DatedFlow,
  FlowSummary,
  IrrResult,
  SavingsPlanInput,
  SavingsPlanResult,
} from "./irr-compare-types";

export type DatedCashFlow = {
  date: string; // ISO YYYY-MM-DD
  amount: number; // negative = outflow, positive = inflow
};

const DAY_MS = 1000 * 60 * 60 * 24;
const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-7;

function yearsBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / DAY_MS / 365;
}

function npv(rate: number, flows: DatedCashFlow[], t0: string): number {
  return flows.reduce(
    (sum, f) => sum + f.amount / Math.pow(1 + rate, yearsBetween(t0, f.date)),
    0,
  );
}

function npvDerivative(rate: number, flows: DatedCashFlow[], t0: string): number {
  return flows.reduce((sum, f) => {
    const t = yearsBetween(t0, f.date);
    if (t === 0) return sum;
    return sum - (t * f.amount) / Math.pow(1 + rate, t + 1);
  }, 0);
}

/**
 * XIRR — the annualized internal rate of return for a series of irregularly
 * dated cash flows, solved via Newton-Raphson (falling back to bisection if
 * it fails to converge). Returns `null` when there isn't a sign change in
 * the cash flows (no valid IRR exists) or the series is too short.
 */
export function calculateIrr(flows: DatedCashFlow[]): number | null {
  const nonZero = flows.filter((f) => f.amount !== 0);
  if (nonZero.length < 2) return null;

  const hasPositive = nonZero.some((f) => f.amount > 0);
  const hasNegative = nonZero.some((f) => f.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const sorted = [...nonZero].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const t0 = sorted[0].date;

  let rate = 0.1;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const value = npv(rate, sorted, t0);
    const derivative = npvDerivative(rate, sorted, t0);
    if (Math.abs(derivative) < 1e-12) break;
    const nextRate = rate - value / derivative;
    if (!Number.isFinite(nextRate)) break;
    if (Math.abs(nextRate - rate) < TOLERANCE) return nextRate;
    rate = nextRate;
  }

  // Newton-Raphson didn't converge — fall back to bisection over a wide,
  // sane range rather than returning a wild/NaN result.
  let low = -0.9999;
  let high = 10;
  let lowValue = npv(low, sorted, t0);
  const highValue = npv(high, sorted, t0);
  if (Math.sign(lowValue) === Math.sign(highValue)) return null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const midValue = npv(mid, sorted, t0);
    if (Math.abs(midValue) < TOLERANCE) return mid;
    if (Math.sign(midValue) === Math.sign(lowValue)) {
      low = mid;
      lowValue = midValue;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

// ===========================================================================
// IRR comparison tool maths (pure, no I/O)
//
// Conventions (also documented in tracker/Real-Estate-Multi-Currency.md):
//  - Every rate is an EFFECTIVE ANNUAL rate (a fraction: 0.0289 = 2.89 %).
//  - `xirr` discounts on actual/365 day counts, like Excel's XIRR.
//  - The savings plan uses the advisor calculator's convention: monthly rate
//    m = (1 + r)^(1/12) - 1, deposits at the END of each month.
// ===========================================================================

const MS_PER_DAY = 86_400_000;

/** Solver domain: effective annual rate from -99 % to +10,000 %. */
const MIN_RATE = -0.99;
const MAX_RATE = 100;
const X_LO = Math.log(1 + MIN_RATE);
const X_HI = Math.log(1 + MAX_RATE);
/** Scan resolution over x = ln(1 + r). */
const GRID_STEPS = 1024;

/** Cash flow at a time `t` in years from the first flow. */
type TimedFlow = { t: number; a: number };

function parseIsoDay(date: string): number {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(date)) return Number.NaN;
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

/** NPV as a function of x = ln(1 + r); NaN when it overflows. */
function npvAtLog(x: number, flows: TimedFlow[]): number {
  let sum = 0;
  for (const f of flows) sum += f.a * Math.exp(-f.t * x);
  return Number.isFinite(sum) ? sum : Number.NaN;
}

function npvLogDerivative(x: number, flows: TimedFlow[]): number {
  let sum = 0;
  for (const f of flows) sum -= f.t * f.a * Math.exp(-f.t * x);
  return Number.isFinite(sum) ? sum : Number.NaN;
}

/** Safeguarded Newton (Newton steps, bisection whenever they leave the bracket). `lo`/`hi` bracket a sign change. */
function refineRoot(lo: number, hi: number, flows: TimedFlow[]): number {
  let flo = npvAtLog(lo, flows);
  if (flo === 0) return lo;
  if (npvAtLog(hi, flows) === 0) return hi;
  // Orient so that npv(xl) < 0 < npv(xh).
  let xl = lo;
  let xh = hi;
  if (flo > 0) {
    xl = hi;
    xh = lo;
    flo = npvAtLog(xl, flows);
  }
  let x = 0.5 * (lo + hi);
  let dxOld = Math.abs(hi - lo);
  let dx = dxOld;
  let fx = npvAtLog(x, flows);
  let dfx = npvLogDerivative(x, flows);
  for (let i = 0; i < 200; i++) {
    const newtonOut =
      !Number.isFinite(dfx) ||
      ((x - xh) * dfx - fx) * ((x - xl) * dfx - fx) > 0 ||
      Math.abs(2 * fx) > Math.abs(dxOld * dfx);
    if (newtonOut) {
      dxOld = dx;
      dx = 0.5 * (xh - xl);
      x = xl + dx;
      if (x === xl) return x;
    } else {
      dxOld = dx;
      dx = fx / dfx;
      const previous = x;
      x -= dx;
      if (previous === x) return x;
    }
    if (Math.abs(dx) < 1e-15 * Math.max(1, Math.abs(x))) return x;
    fx = npvAtLog(x, flows);
    dfx = npvLogDerivative(x, flows);
    if (fx === 0) return x;
    if (fx < 0) xl = x;
    else xh = x;
  }
  return x;
}

/** Number of sign changes along the (time-ordered) flows, zeros ignored. */
function countSignChanges(flows: TimedFlow[]): number {
  let changes = 0;
  let previous = 0;
  for (const f of flows) {
    const sign = Math.sign(f.a);
    if (sign === 0) continue;
    if (previous !== 0 && sign !== previous) changes++;
    previous = sign;
  }
  return changes;
}

/** Solves sum a_i (1 + r)^(-t_i) = 0 on [-99 %, +10,000 %]. `flows` must be time-ordered with a != 0. */
function solveTimedFlows(flows: TimedFlow[]): IrrResult {
  if (flows.length < 2) return { ok: false, reason: "not_enough_flows" };
  const hasNegative = flows.some((f) => f.a < 0);
  const hasPositive = flows.some((f) => f.a > 0);
  if (!hasNegative || !hasPositive) return { ok: false, reason: "no_sign_change" };
  if (flows[flows.length - 1].t - flows[0].t <= 0) return { ok: false, reason: "not_enough_flows" };

  const roots: number[] = [];
  let prevX = X_LO;
  let prevF = npvAtLog(prevX, flows);
  if (prevF === 0) roots.push(prevX);
  for (let i = 1; i <= GRID_STEPS; i++) {
    const x = X_LO + ((X_HI - X_LO) * i) / GRID_STEPS;
    const fx = npvAtLog(x, flows);
    if (Number.isNaN(fx)) {
      prevX = x;
      prevF = fx;
      continue;
    }
    if (fx === 0) {
      roots.push(x);
    } else if (!Number.isNaN(prevF) && prevF !== 0 && Math.sign(prevF) !== Math.sign(fx)) {
      roots.push(refineRoot(prevX, x, flows));
    }
    prevX = x;
    prevF = fx;
  }
  if (roots.length === 0) return { ok: false, reason: "no_solution" };

  // Several roots: report the one closest to 0 % (the most economically plausible) and flag it.
  const best = roots.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
  const rate = Math.expm1(best);
  if (!Number.isFinite(rate)) return { ok: false, reason: "no_solution" };
  return { ok: true, rate, multipleRoots: roots.length > 1 && countSignChanges(flows) > 1 };
}

/**
 * XIRR: effective annual rate that zeroes the NPV of dated flows on actual/365 day counts
 * (the Excel convention). Same-date flows are netted. Failures are typed, never NaN.
 * `multipleRoots` is set when the flows change sign more than once AND another root exists.
 */
export function xirr(flows: DatedFlow[]): IrrResult {
  const byDay = new Map<number, number>();
  for (const f of flows) {
    const day = parseIsoDay(f.date);
    if (Number.isNaN(day) || typeof f.amount !== "number" || !Number.isFinite(f.amount)) {
      return { ok: false, reason: "no_solution" };
    }
    byDay.set(day, (byDay.get(day) ?? 0) + f.amount);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const netted = days.map((d) => ({ d, a: byDay.get(d) as number })).filter((f) => f.a !== 0);
  if (netted.length < 2) return { ok: false, reason: "not_enough_flows" };
  const t0 = netted[0].d;
  return solveTimedFlows(netted.map((f) => ({ t: (f.d - t0) / MS_PER_DAY / 365, a: f.a })));
}

/**
 * IRR of equally spaced flows (`amounts[k]` at period k), as an EFFECTIVE ANNUAL rate:
 * (1 + periodic IRR)^periodsPerYear - 1. Equivalent to XIRR with t = k / periodsPerYear.
 */
export function periodicIrr(amounts: number[], periodsPerYear: number): IrrResult {
  if (!(Number.isFinite(periodsPerYear) && periodsPerYear > 0)) return { ok: false, reason: "no_solution" };
  if (amounts.some((a) => typeof a !== "number" || !Number.isFinite(a))) return { ok: false, reason: "no_solution" };
  const timed: TimedFlow[] = [];
  amounts.forEach((a, k) => {
    if (a !== 0) timed.push({ t: k / periodsPerYear, a });
  });
  return solveTimedFlows(timed);
}

/** Headline figures of a stream: money in/out, gain, multiple and span in years (actual/365). */
export function summarizeFlows(flows: DatedFlow[]): FlowSummary {
  let moneyIn = 0;
  let moneyOut = 0;
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const f of flows) {
    if (!Number.isFinite(f.amount)) continue;
    if (f.amount < 0) moneyIn -= f.amount;
    else moneyOut += f.amount;
    const day = parseIsoDay(f.date);
    if (!Number.isNaN(day)) {
      first = Math.min(first, day);
      last = Math.max(last, day);
    }
  }
  return {
    moneyIn,
    moneyOut,
    gain: moneyOut - moneyIn,
    multiple: moneyIn > 0 ? moneyOut / moneyIn : null,
    years: Number.isFinite(first) ? (last - first) / MS_PER_DAY / 365 : 0,
  };
}

// ---------------------------------------------------------------------------
// Savings plan (the advisor calculator: initial capital + monthly saving -> final capital)
// ---------------------------------------------------------------------------

/** Start date used by `savingsPlanFlows` when none is injected (keeps output deterministic). */
export const DEFAULT_PLAN_START = "2026-01-01";

/** Number of monthly periods, or 0 when `years` is not a whole, positive number of months. */
function planMonths(years: number): number {
  const months = Math.round(years * 12);
  return Number.isFinite(months) && months >= 1 && Math.abs(months - years * 12) < 1e-6 ? months : 0;
}

/** Final value at month N for x = ln(1 + r): initial*(1+m)^N + monthly*((1+m)^N - 1)/m, m = e^(x/12) - 1. */
function planFinalAtLog(initial: number, monthly: number, months: number, x: number): number {
  const h = x / 12;
  const growth = Math.exp(months * h);
  const annuity = Math.abs(h) < 1e-12 ? months : Math.expm1(months * h) / Math.expm1(h);
  return initial * growth + monthly * annuity;
}

/**
 * Value of the plan after `years` at an effective annual rate (monthly rate (1+r)^(1/12)-1, deposits at
 * the END of each month). Returns NaN for invalid inputs (this is a projection helper, not a solver).
 * Screenshot cross-check: 30,000 + 300/month for 20 years at 2.89 % -> 149,956 after rounding.
 */
export function projectFinalCapital(args: {
  initial: number;
  monthly: number;
  years: number;
  effectiveAnnualRate: number;
}): number {
  const { initial, monthly, years, effectiveAnnualRate } = args;
  const months = planMonths(years);
  if (
    months === 0 ||
    !Number.isFinite(initial) ||
    !Number.isFinite(monthly) ||
    !Number.isFinite(effectiveAnnualRate) ||
    effectiveAnnualRate <= -1
  ) {
    return Number.NaN;
  }
  return planFinalAtLog(initial, monthly, months, Math.log1p(effectiveAnnualRate));
}

/**
 * Solves the effective annual rate for which `initial` + `monthly` per month grows to `finalCapital` after
 * `years`. Handles monthly = 0, initial = 0, a final capital below the deposits (negative rate) and equal to
 * them (0 %). The final value is increasing in the rate, so a bisection on x = ln(1 + r) is exact.
 */
export function solveSavingsPlan(input: SavingsPlanInput): SavingsPlanResult {
  const { initialCapital: initial, monthlySaving: monthly, finalCapital: target, years } = input;
  const months = planMonths(years);
  if (
    ![initial, monthly, target, years].every(Number.isFinite) ||
    initial < 0 ||
    monthly < 0 ||
    !(target > 0) ||
    !(years > 0) ||
    months === 0 ||
    initial + monthly <= 0
  ) {
    return { ok: false, reason: "invalid_input" };
  }

  const totalDeposits = initial + monthly * months;
  const build = (x: number): Extract<SavingsPlanResult, { ok: true }> => {
    const finalCapital = planFinalAtLog(initial, monthly, months, x);
    return {
      ok: true,
      effectiveAnnualRate: Math.expm1(x),
      nominalAnnualRate: 12 * Math.expm1(x / 12),
      totalDeposits,
      totalInterest: finalCapital - totalDeposits,
      finalCapital,
    };
  };

  if (Math.abs(target - totalDeposits) <= 1e-9 * Math.max(1, totalDeposits)) return build(0);

  let lo = X_LO;
  let hi = X_HI;
  const fLo = planFinalAtLog(initial, monthly, months, lo);
  const fHi = planFinalAtLog(initial, monthly, months, hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || target < fLo || target > fHi) {
    return { ok: false, reason: "no_solution" };
  }
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (planFinalAtLog(initial, monthly, months, mid) < target) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-16) break;
  }
  return build(0.5 * (lo + hi));
}

/** `isoDate` + `months`, keeping the start's day of month (clamped to the month's length). */
function addPlanMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const monthIndex = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/**
 * The plan as dated flows: the initial capital at `start`, one deposit at the end of each month (month k is
 * `start` + k months), and the final capital as the last inflow (same date as the last deposit). Deposits are
 * negative, the final capital positive. Returns [] for an invalid plan.
 */
export function savingsPlanFlows(input: SavingsPlanInput, start: string = DEFAULT_PLAN_START): DatedFlow[] {
  const { initialCapital, monthlySaving, finalCapital, years } = input;
  const months = planMonths(years);
  if (
    months === 0 ||
    Number.isNaN(parseIsoDay(start)) ||
    ![initialCapital, monthlySaving, finalCapital].every(Number.isFinite) ||
    initialCapital < 0 ||
    monthlySaving < 0 ||
    !(finalCapital > 0) ||
    initialCapital + monthlySaving <= 0
  ) {
    return [];
  }
  const flows: DatedFlow[] = [];
  const t0 = start.slice(0, 10);
  if (initialCapital > 0) flows.push({ date: t0, amount: -initialCapital });
  for (let k = 1; k <= months; k++) {
    if (monthlySaving > 0) flows.push({ date: addPlanMonths(t0, k), amount: -monthlySaving });
  }
  flows.push({ date: addPlanMonths(t0, months), amount: finalCapital });
  return flows;
}
