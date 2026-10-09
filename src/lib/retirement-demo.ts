import { computeRetirement, DEFAULT_INFLATION, DEFAULT_WITHDRAWAL_RATE } from "@/lib/retirement";

/**
 * Starting inputs of the retirement simulator for the public, read-only demo account. Text values, exactly as
 * the simulator keeps them (a visitor's own edits, kept in the browser, always win over these).
 */
export type RetirementPreset = {
  age: string;
  retAge: string;
  income: string;
  ret: string;
  inflation: string;
  swr: string;
};

export const DEMO_RETIREMENT_AGE = 42;
export const DEMO_RETIREMENT_RETIREMENT_AGE = 60;
export const DEMO_RETIREMENT_RETURN = 0.05;
/** The demo's desired income is sized so the target is this share of the projected assets (the rest is headroom). */
export const DEMO_RETIREMENT_TARGET_SHARE = 0.7;
const INCOME_STEP = 500;

/**
 * A preset that shows the "on track" state for a demo portfolio of `portfolioTotal` (the default-included
 * categories, in the display currency). The desired income is derived from the portfolio rather than typed, so
 * the demo reads the same whatever currency the visitor views it in: it is the largest round figure (a multiple
 * of 500) whose target capital stays at `DEMO_RETIREMENT_TARGET_SHARE` of the grown assets. Returns null when
 * the portfolio is too small to give a meaningful figure (the simulator then keeps its normal defaults).
 */
export function demoRetirementPreset(portfolioTotal: number): RetirementPreset | null {
  if (!Number.isFinite(portfolioTotal) || portfolioTotal <= 0) return null;
  const years = DEMO_RETIREMENT_RETIREMENT_AGE - DEMO_RETIREMENT_AGE;
  const grown = portfolioTotal * Math.pow(1 + DEMO_RETIREMENT_RETURN, years);
  const incomeAtRetirement = (DEMO_RETIREMENT_TARGET_SHARE * grown * DEFAULT_WITHDRAWAL_RATE) / 12;
  const income = Math.floor(incomeAtRetirement / Math.pow(1 + DEFAULT_INFLATION, years) / INCOME_STEP) * INCOME_STEP;
  if (!(income >= INCOME_STEP)) return null;
  return {
    age: String(DEMO_RETIREMENT_AGE),
    retAge: String(DEMO_RETIREMENT_RETIREMENT_AGE),
    income: String(income),
    ret: String(DEMO_RETIREMENT_RETURN * 100),
    inflation: String(DEFAULT_INFLATION * 100),
    swr: String(DEFAULT_WITHDRAWAL_RATE * 100),
  };
}

/** Convenience used by the tests and the seed notes: is the preset on track with the given assets? */
export function isDemoPresetOnTrack(portfolioTotal: number): boolean {
  const preset = demoRetirementPreset(portfolioTotal);
  if (!preset) return false;
  const result = computeRetirement({
    currentAge: Number(preset.age),
    retirementAge: Number(preset.retAge),
    desiredMonthlyIncome: Number(preset.income),
    annualReturn: Number(preset.ret) / 100,
    inflation: Number(preset.inflation) / 100,
    method: "swr",
    withdrawalRate: Number(preset.swr) / 100,
    startingAssets: portfolioTotal,
  });
  return result.ok && result.onTrack;
}
