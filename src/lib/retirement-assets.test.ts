import { describe, expect, it } from "vitest";
import {
  buildInvestableBreakdown,
  investableTotal,
  isIncludedByDefault,
  type RetirementHolding,
} from "@/lib/retirement-assets";

const rates = { USD: 1, EUR: 0.5, AED: 4 };
const h = (category: string, value: number, currency = "USD", is_liability = false): RetirementHolding => ({
  currency,
  current_value: value,
  is_liability,
  asset_categories: { name: category },
});

describe("buildInvestableBreakdown", () => {
  it("sums per category, converts to the display currency and sorts largest first", () => {
    const rows = buildInvestableBreakdown(
      [h("Cash", 100), h("Cash", 50, "EUR"), h("Equities", 1000), h("Crypto", 40, "AED")],
      "USD",
      rates,
    );
    // 50 EUR at 0.5 EUR/USD = 100 USD; 40 AED at 4 AED/USD = 10 USD
    expect(rows).toEqual([
      { category: "Equities", amount: 1000 },
      { category: "Cash", amount: 200 },
      { category: "Crypto", amount: 10 },
    ]);
  });

  it("skips liabilities, the Liabilities category, zero, negative and non-finite values", () => {
    const rows = buildInvestableBreakdown(
      [h("Cash", 100, "USD", true), h("Liabilities", 500), h("Equities", 0), h("Crypto", -5), h("SCPI", Number.NaN), h("Cash", 10)],
      "USD",
      rates,
    );
    expect(rows).toEqual([{ category: "Cash", amount: 10 }]);
  });

  it("ignores rows without a category", () => {
    expect(buildInvestableBreakdown([{ currency: "USD", current_value: 5, is_liability: false, asset_categories: null }], "USD", rates)).toEqual([]);
  });
});

describe("investableTotal", () => {
  const rows = [
    { category: "Cash", amount: 100 },
    { category: "Real Estate", amount: 900 },
    { category: "Vehicles", amount: 50 },
    { category: "Equities", amount: 200 },
  ];
  it("uses the defaults: liquid and market assets in, Real Estate and Vehicles out", () => {
    expect(isIncludedByDefault("Cash")).toBe(true);
    expect(isIncludedByDefault("Real Estate")).toBe(false);
    expect(investableTotal(rows, null)).toBe(300);
  });
  it("follows an explicit selection", () => {
    expect(investableTotal(rows, ["Real Estate"])).toBe(900);
    expect(investableTotal(rows, [])).toBe(0);
  });
});
