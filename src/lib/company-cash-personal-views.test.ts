/**
 * Company bank accounts stay out of the PERSONAL cash views: emergency-fund accounts / daily-expense
 * transactions (waterfall loader), the liquid cash of Future Projects and the retirement starting assets.
 * Invented fixtures only.
 */
import { describe, expect, it } from "vitest";
import { splitAssets } from "@/lib/cash-flow-waterfall-server";
import { summariseHoldings } from "@/lib/planning-data";
import { buildInvestableBreakdown, investableTotal, isIncludedByDefault } from "@/lib/retirement-assets";
import { COMPANY_CASH_CATEGORY } from "@/lib/company-cash";

const RATES = { USD: 1, AED: 4 };

const asset = (id: string, category: string, current_value: number, metadata: Record<string, unknown> | null = null, over: Record<string, unknown> = {}) => ({
  id,
  name: `Asset ${id}`,
  currency: "USD",
  current_value,
  is_liability: false,
  metadata,
  asset_categories: { name: category },
  ...over,
});

const holdings = [
  asset("co", "Companies", 5000),
  asset("p", "Cash", 100, { account_type: "checking" }),
  asset("cc", "Cash", 900, { company_id: "co", account_type: "checking" }),
  asset("orphan", "Cash", 40, { company_id: "deleted" }),
  asset("eq", "Equities", 300),
];

describe("waterfall loader: splitAssets", () => {
  it("returns only personal Cash accounts: a company account is not emergency savings and its transactions are never loaded", () => {
    const { accounts } = splitAssets(holdings);
    expect(accounts.map((a) => a.id)).toEqual(["p", "orphan"]);
  });

  it("without any Companies row to resolve against, nothing is dropped by mistake", () => {
    const { accounts } = splitAssets(holdings.filter((h) => h.id !== "co"));
    // the link no longer resolves, so the account is a personal one again
    expect(accounts.map((a) => a.id)).toEqual(["p", "cc", "orphan"]);
  });
});

describe("Future Projects liquid cash: summariseHoldings", () => {
  it("excludes company cash from liquid cash", () => {
    const r = summariseHoldings(holdings, "USD", RATES);
    expect(r.liquidCash).toBe(140);
  });

  it("converts to the base currency", () => {
    const r = summariseHoldings([...holdings, asset("aed", "Cash", 400, null, { currency: "AED" })], "USD", RATES);
    expect(r.liquidCash).toBe(240);
  });

  it("still works for rows without an id (company_id then counts as given)", () => {
    const r = summariseHoldings(
      [
        { currency: "USD", current_value: 10, is_liability: false, metadata: null, asset_categories: { name: "Cash" } },
        { currency: "USD", current_value: 99, is_liability: false, metadata: { company_id: "x" }, asset_categories: { name: "Cash" } },
      ],
      "USD",
      RATES,
    );
    expect(r.liquidCash).toBe(10);
  });
});

describe("retirement simulator starting assets", () => {
  it("lists company cash as its own category, off by default, and not inside Cash", () => {
    const breakdown = buildInvestableBreakdown(holdings, "USD", RATES);
    const by = Object.fromEntries(breakdown.map((r) => [r.category, r.amount]));
    expect(by).toEqual({ Companies: 5000, [COMPANY_CASH_CATEGORY]: 900, Equities: 300, Cash: 140 });
    expect(isIncludedByDefault(COMPANY_CASH_CATEGORY)).toBe(false);
    // default total: Cash + Equities (+ the other default categories), never company cash
    expect(investableTotal(breakdown, null)).toBe(140 + 300);
    // the user can still switch it on
    expect(investableTotal(breakdown, ["Cash", COMPANY_CASH_CATEGORY])).toBe(140 + 900);
  });

  it("the breakdown still adds up to every non-liability holding", () => {
    const breakdown = buildInvestableBreakdown(holdings, "USD", RATES);
    expect(breakdown.reduce((s, r) => s + r.amount, 0)).toBe(5000 + 100 + 900 + 40 + 300);
  });
});
