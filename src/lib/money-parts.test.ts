import { describe, expect, it } from "vitest";
import { changedPositionsFromRight, moneyParts } from "./money-parts";

describe("moneyParts", () => {
  it("splits code, whole part and decimals", () => {
    const p = moneyParts(1234567.5, "usd", "en-US");
    expect(p).toMatchObject({ negative: false, currency: "USD", integer: "1,234,567", decimal: ".50" });
    expect(p.text).toBe("USD 1,234,567.50");
  });

  it("keeps the sign and follows the locale's separators", () => {
    const p = moneyParts(-1234.5, "EUR", "de-DE");
    expect(p.negative).toBe(true);
    expect(p.integer).toBe("1.234");
    expect(p.decimal).toBe(",50");
  });

  it("uses the currency's own decimals and honours fractionDigits", () => {
    expect(moneyParts(1500, "JPY", "en-US").decimal).toBe("");
    expect(moneyParts(1234.567, "USD", "en-US", { fractionDigits: 0 })).toMatchObject({ integer: "1,235", decimal: "" });
    expect(moneyParts(1.5, "KWD", "en-US").decimal).toBe(".500");
  });

  it("falls back for an unknown currency code and for non-finite values", () => {
    expect(moneyParts(10, "ZZ", "en-US")).toMatchObject({ currency: "ZZ", integer: "10", decimal: ".00" });
    expect(moneyParts(Number.NaN, "USD", "en-US")).toMatchObject({ integer: "–", decimal: "" });
    expect(moneyParts(Number.POSITIVE_INFINITY, "USD", "en-US").text).toBe("USD –");
  });

  it("handles zero and tiny values", () => {
    expect(moneyParts(0, "AED", "en-US").text).toBe("AED 0.00");
    expect(moneyParts(-0.004, "USD", "en-US", { fractionDigits: 2 }).integer).toBe("0");
  });
});

describe("changedPositionsFromRight", () => {
  it("is empty when nothing changed", () => {
    expect(changedPositionsFromRight("1,000", "1,000").size).toBe(0);
  });

  it("marks only the places that changed, counted from the right", () => {
    expect([...changedPositionsFromRight("1,234", "1,239")]).toEqual([0]);
    expect([...changedPositionsFromRight("1,234", "1,334")]).toEqual([2]);
  });

  it("marks every place when the figure grows a digit", () => {
    expect([...changedPositionsFromRight("999", "1,000")].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
