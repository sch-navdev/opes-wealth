/**
 * Retirement passive-income simulator maths (pure, no I/O). An illustration with the user's own
 * assumptions: not a forecast, not advice. Tax on withdrawals is NOT modelled (the desired income is
 * treated as net), returns are not guaranteed, and pensions / state benefits are out of scope.
 *
 * Conventions (shared with `solveSavingsPlan` / `projectFinalCapital` in `lib/irr.ts`):
 *  - every rate is an EFFECTIVE ANNUAL rate, as a fraction (0.05 = 5 %);
 *  - monthly rate m = (1 + r)^(1/12) - 1, deposits at the END of each month;
 *  - N = round(years * 12) months; the horizon used everywhere is N / 12 years.
 *
 * Formulas:
 *  - income at retirement (nominal) = desiredMonthly * (1 + inflation)^years
 *  - method "swr" (withdrawal rate):  target = incomeAtRetirement * 12 / swr
 *  - method "returns" (capital untouched, income = r * capital): target = incomeAtRetirement * 12 / r
 *  - assets grown = A * (1 + r)^years
 *  - gap = max(0, target - grown)
 *  - required monthly saving = gap * m / ((1 + m)^N - 1)  (gap / N when r = 0)
 */

export type WithdrawalMethod = "swr" | "returns";

export const DEFAULT_INFLATION = 0.02;
export const DEFAULT_WITHDRAWAL_RATE = 0.04;

export type RetirementInput = {
  currentAge: number;
  retirementAge: number;
  /** Desired NET monthly passive income, in today's money. */
  desiredMonthlyIncome: number;
  /** Effective annual return, fraction. Negative values are handled (the UI blocks them). */
  annualReturn: number;
  /** Effective annual inflation, fraction (0 allowed). */
  inflation: number;
  method: WithdrawalMethod;
  /** Safe withdrawal rate, fraction (used by the "swr" method). */
  withdrawalRate: number;
  /** Investable assets today. */
  startingAssets: number;
};

export type RetirementFailure =
  /** A field is missing, not finite, out of range or the figures overflow. */
  | "invalid_input"
  /** Retirement age is not after the current age. */
  | "age_order"
  /** Method "returns" needs a return above 0 %. */
  | "return_not_positive";

export type RetirementOk = {
  ok: true;
  years: number;
  months: number;
  /** Desired income grown by inflation (nominal, per month). */
  incomeAtRetirement: number;
  targetCapital: number;
  /** Starting assets grown at the return until retirement. */
  assetsGrown: number;
  /** max(0, target - grown). */
  gap: number;
  /** Monthly saving (end-of-month deposits) that closes the gap; 0 when on track. */
  requiredMonthly: number;
  onTrack: boolean;
  /** grown - target when on track, else 0. */
  surplus: number;
  /** Sum of the deposits over the horizon. */
  totalContributions: number;
  /** Growth earned on the deposits (gap - deposits). */
  contributionGrowth: number;
  /** Growth earned on the starting assets (grown - A). */
  assetGrowth: number;
};

export type RetirementResult = RetirementOk | { ok: false; reason: RetirementFailure };

const MAX_MONEY = 1e15;

/** Monthly-compounding annuity factor: ((1+m)^N - 1) / m for the effective annual rate `r`. */
function annuityFactor(r: number, months: number): number {
  const x = Math.log1p(r) / 12; // ln(1 + m)
  if (Math.abs(x) < 1e-12) return months;
  return Math.expm1(months * x) / Math.expm1(x);
}

/** Required end-of-month saving that grows `gap` over `months` at the effective annual rate `r`. */
export function monthlySavingForGap(gap: number, r: number, months: number): number {
  if (!(gap > 0)) return 0;
  const factor = annuityFactor(r, months);
  return factor > 0 && Number.isFinite(factor) ? gap / factor : Number.NaN;
}

export function computeRetirement(input: RetirementInput): RetirementResult {
  const {
    currentAge,
    retirementAge,
    desiredMonthlyIncome: income,
    annualReturn: r,
    inflation: i,
    method,
    withdrawalRate: swr,
    startingAssets: assets,
  } = input;

  if (![currentAge, retirementAge, income, r, i, swr, assets].every(Number.isFinite)) {
    return { ok: false, reason: "invalid_input" };
  }
  if (currentAge < 0 || retirementAge > 150 || income <= 0 || assets < 0 || r <= -1 || i <= -1) {
    return { ok: false, reason: "invalid_input" };
  }
  if (method !== "swr" && method !== "returns") return { ok: false, reason: "invalid_input" };
  if (retirementAge <= currentAge) return { ok: false, reason: "age_order" };
  const months = Math.round((retirementAge - currentAge) * 12);
  if (months < 1) return { ok: false, reason: "age_order" };
  const years = months / 12;

  if (method === "swr" && !(swr > 0)) return { ok: false, reason: "invalid_input" };
  if (method === "returns" && !(r > 0)) return { ok: false, reason: "return_not_positive" };

  const incomeAtRetirement = income * Math.pow(1 + i, years);
  const targetCapital = (incomeAtRetirement * 12) / (method === "swr" ? swr : r);
  const assetsGrown = assets * Math.pow(1 + r, years);
  if (![incomeAtRetirement, targetCapital, assetsGrown].every((n) => Number.isFinite(n) && n < MAX_MONEY)) {
    return { ok: false, reason: "invalid_input" };
  }

  const gap = Math.max(0, targetCapital - assetsGrown);
  const requiredMonthly = monthlySavingForGap(gap, r, months);
  if (!Number.isFinite(requiredMonthly)) return { ok: false, reason: "invalid_input" };
  const totalContributions = requiredMonthly * months;

  return {
    ok: true,
    years,
    months,
    incomeAtRetirement,
    targetCapital,
    assetsGrown,
    gap,
    requiredMonthly,
    onTrack: gap <= 0,
    surplus: gap <= 0 ? assetsGrown - targetCapital : 0,
    totalContributions,
    contributionGrowth: gap - totalContributions,
    assetGrowth: assetsGrown - assets,
  };
}

export type SensitivityRow = {
  kind: "return" | "inflation";
  /** The varied rate, fraction. */
  value: number;
  /** True for the row that matches the current inputs. */
  base: boolean;
  /** Required monthly saving, or null when the case cannot be computed (e.g. returns-only at 0 %). */
  requiredMonthly: number | null;
};

/** Required saving at r - 1 pt, r, r + 1 pt (inflation unchanged) and at inflation 0 / 2 / 3 % (return unchanged). */
export function sensitivity(input: RetirementInput): SensitivityRow[] {
  const at = (patch: Partial<RetirementInput>): number | null => {
    const res = computeRetirement({ ...input, ...patch });
    return res.ok ? res.requiredMonthly : null;
  };
  const rows: SensitivityRow[] = [];
  for (const delta of [-0.01, 0, 0.01]) {
    const value = Math.round((input.annualReturn + delta) * 1e6) / 1e6;
    rows.push({ kind: "return", value, base: delta === 0, requiredMonthly: at({ annualReturn: value }) });
  }
  for (const value of [0, 0.02, 0.03]) {
    rows.push({
      kind: "inflation",
      value,
      base: Math.abs(value - input.inflation) < 1e-9,
      requiredMonthly: at({ inflation: value }),
    });
  }
  return rows;
}

export type ProjectionSegment = "assets" | "assetGrowth" | "contributions" | "contributionGrowth";

/**
 * What the capital at retirement is made of, in the order the stacked bar draws it. Segments are
 * non-negative and sum to the target capital (or, when on track, to the projected assets).
 */
export function projectionBreakdown(
  startingAssets: number,
  result: RetirementOk,
): { id: ProjectionSegment; amount: number }[] {
  return [
    { id: "assets" as const, amount: Math.max(0, startingAssets) },
    { id: "assetGrowth" as const, amount: Math.max(0, result.assetGrowth) },
    { id: "contributions" as const, amount: Math.max(0, result.totalContributions) },
    { id: "contributionGrowth" as const, amount: Math.max(0, result.contributionGrowth) },
  ];
}

/** Parses a user-typed number ("4.5", "4,5", " 3 000 "); NaN when empty or not a number. */
export function parseNumberInput(text: string): number {
  const cleaned = text.trim().replace(/[\s  ]/g, "").replace(",", ".");
  if (cleaned === "") return Number.NaN;
  return Number(cleaned);
}
