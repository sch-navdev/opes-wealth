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
