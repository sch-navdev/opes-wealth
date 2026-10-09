import { describe, expect, it } from "vitest";
import { positionShare } from "./portfolio";

const portfolio = { totalAssets: 200_000, categoryTotal: 50_000, currency: "USD", linkedAccounts: [] };

describe("positionShare", () => {
  it("is the value (converted to the portfolio currency) over each total", () => {
    // 10 EUR-units at rate 0.5 EUR per USD => 20,000 EUR = 40,000 USD
    const s = positionShare({ value: 20_000, currency: "EUR", portfolio, ratesFromUsd: { USD: 1, EUR: 0.5 } });
    expect(s.ofPortfolio).toBeCloseTo(0.2, 10);
    expect(s.ofCategory).toBeCloseTo(0.8, 10);
  });

  it("is null without portfolio figures or a positive value, and capped at 100 %", () => {
    expect(positionShare({ value: 5, currency: "USD", portfolio: null, ratesFromUsd: {} })).toEqual({ ofPortfolio: null, ofCategory: null });
    expect(positionShare({ value: 0, currency: "USD", portfolio, ratesFromUsd: {} })).toEqual({ ofPortfolio: null, ofCategory: null });
    expect(positionShare({ value: 900_000, currency: "USD", portfolio, ratesFromUsd: {} }).ofPortfolio).toBe(1);
  });
});
