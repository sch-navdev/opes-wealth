import { convertToBaseCurrency } from "@/lib/fx";

/**
 * Starting point of the retirement simulator: "current investable net assets", per category, in the
 * display currency. The app does not mark a primary residence, so instead of guessing, the simulator
 * lists the categories and lets the user switch each one in or out.
 *
 *  - Value = the holding's `current_value` (the user's share, as the dashboard scales it). For Real
 *    Estate that is already the equity (market value minus the property's own linked loan); nothing else
 *    is subtracted: standalone liabilities are not netted off because they are not linked to a category.
 *  - Liability rows are skipped; negative or non-finite values are ignored.
 */
export type RetirementHolding = {
  currency: string;
  current_value: number;
  is_liability: boolean;
  asset_categories: { name: string } | null;
};

export type CategoryAmount = { category: string; amount: number };

/** Liquid and market assets: switched ON by default. */
export const DEFAULT_INCLUDED_CATEGORIES = [
  "Cash",
  "Equities",
  "Crypto",
  "Precious Metals",
  "SCPI",
  "Assurance-Vie",
] as const;

/** Switched OFF by default (illiquid, or a home / consumption asset); the user can include any of them. */
export const DEFAULT_EXCLUDED_CATEGORIES = [
  "Real Estate",
  "Private Equity",
  "Companies",
  "Startups",
  "Vehicles",
  "Exotic Assets",
] as const;

export function isIncludedByDefault(category: string): boolean {
  return (DEFAULT_INCLUDED_CATEGORIES as readonly string[]).includes(category);
}

/** Sum of the holdings per category (display currency), largest first; empty categories are dropped. */
export function buildInvestableBreakdown(
  holdings: RetirementHolding[],
  base: string,
  rates: Record<string, number>,
): CategoryAmount[] {
  const byCategory = new Map<string, number>();
  for (const h of holdings) {
    if (h.is_liability) continue;
    const category = h.asset_categories?.name;
    if (!category || category === "Liabilities") continue;
    const amount = convertToBaseCurrency(h.current_value, h.currency, base, rates);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    byCategory.set(category, (byCategory.get(category) ?? 0) + amount);
  }
  return [...byCategory.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Total of the categories that are switched on. `included` = null means "the defaults". */
export function investableTotal(breakdown: CategoryAmount[], included: string[] | null): number {
  return breakdown
    .filter((row) => (included ? included.includes(row.category) : isIncludedByDefault(row.category)))
    .reduce((sum, row) => sum + row.amount, 0);
}
