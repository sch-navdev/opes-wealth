import { beforeEach, describe, expect, it, vi } from "vitest";

// The rate provider is network-backed; only its result shape matters here.
const getFxRatesMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/fx-client", () => ({ getFxRates: getFxRatesMock }));

import {
  DEFAULT_BASE_CURRENCY,
  convertAmount,
  convertToBaseCurrency,
  getExchangeRatesFromUsd,
} from "@/lib/fx";

const RATES = { USD: 1, EUR: 0.9, GBP: 0.8, JPY: 150, AED: 3.67 };

describe("convertAmount", () => {
  it("returns the amount unchanged for the same currency (identity)", () => {
    expect(convertAmount(123.45, "EUR", "EUR", RATES)).toBe(123.45);
    // Identity also holds for currencies missing from the table.
    expect(convertAmount(10, "XXX", "XXX", RATES)).toBe(10);
  });

  it("converts from the base currency", () => {
    expect(convertAmount(100, "USD", "EUR", RATES)).toBeCloseTo(90, 10);
    expect(convertAmount(100, "USD", "JPY", RATES)).toBeCloseTo(15000, 10);
  });

  it("converts into the base currency", () => {
    expect(convertAmount(90, "EUR", "USD", RATES)).toBeCloseTo(100, 10);
    expect(convertAmount(15000, "JPY", "USD", RATES)).toBeCloseTo(100, 10);
  });

  it("cross-converts through the base: EUR -> GBP = amount / 0.9 * 0.8", () => {
    expect(convertAmount(90, "EUR", "GBP", RATES)).toBeCloseTo(80, 10);
  });

  it("round-trips A -> B -> A back to the original amount", () => {
    for (const [a, b] of [
      ["USD", "EUR"],
      ["EUR", "JPY"],
      ["AED", "GBP"],
    ] as const) {
      const there = convertAmount(1234.56, a, b, RATES);
      expect(convertAmount(there, b, a, RATES)).toBeCloseTo(1234.56, 8);
    }
  });

  it("is invariant to which currency the table is anchored on", () => {
    // Re-anchor the same table on EUR (divide every rate by EUR's rate).
    const eurAnchored = Object.fromEntries(
      Object.entries(RATES).map(([k, v]) => [k, v / RATES.EUR]),
    );
    expect(convertAmount(250, "GBP", "AED", eurAnchored)).toBeCloseTo(
      convertAmount(250, "GBP", "AED", RATES),
      8,
    );
  });

  it("handles zero and negative amounts", () => {
    expect(convertAmount(0, "USD", "EUR", RATES)).toBe(0);
    expect(convertAmount(-100, "USD", "EUR", RATES)).toBeCloseTo(-90, 10);
  });

  it("treats a currency missing from the table as 1:1 against the base", () => {
    expect(convertAmount(100, "XXX", "USD", RATES)).toBeCloseTo(100, 10);
    expect(convertAmount(100, "USD", "XXX", RATES)).toBeCloseTo(100, 10);
    expect(convertAmount(100, "XXX", "EUR", RATES)).toBeCloseTo(90, 10);
  });

  it("with an empty rate table every conversion is 1:1", () => {
    expect(convertAmount(77, "USD", "EUR", {})).toBeCloseTo(77, 10);
  });
});

describe("convertToBaseCurrency", () => {
  it("is the same operation as convertAmount", () => {
    expect(convertToBaseCurrency(90, "EUR", "USD", RATES)).toBeCloseTo(100, 10);
    expect(convertToBaseCurrency(5, "AED", "AED", RATES)).toBe(5);
    expect(convertToBaseCurrency(80, "GBP", "EUR", RATES)).toBeCloseTo(
      convertAmount(80, "GBP", "EUR", RATES),
      12,
    );
  });

  it("normalising a mixed portfolio then summing matches hand maths", () => {
    const holdings: [number, string][] = [
      [100, "USD"],
      [90, "EUR"],
      [15000, "JPY"],
    ];
    const total = holdings.reduce(
      (s, [amt, cur]) => s + convertToBaseCurrency(amt, cur, "USD", RATES),
      0,
    );
    expect(total).toBeCloseTo(300, 8);
  });
});

describe("getExchangeRatesFromUsd", () => {
  beforeEach(() => getFxRatesMock.mockReset());

  it("exposes USD as the default base currency", () => {
    expect(DEFAULT_BASE_CURRENCY).toBe("USD");
  });

  it("returns the provider's rates when the call succeeds, asking for the default base", async () => {
    getFxRatesMock.mockResolvedValue({ ok: true, isMock: false, rates: { USD: 1, EUR: 0.5 } });
    await expect(getExchangeRatesFromUsd()).resolves.toEqual({ USD: 1, EUR: 0.5 });
    expect(getFxRatesMock).toHaveBeenCalledWith("USD");
  });

  it("passes a custom base through to the provider", async () => {
    getFxRatesMock.mockResolvedValue({ ok: true, isMock: false, rates: { EUR: 1 } });
    await getExchangeRatesFromUsd("EUR");
    expect(getFxRatesMock).toHaveBeenCalledWith("EUR");
  });

  it("falls back to a usable static table when the provider fails", async () => {
    getFxRatesMock.mockResolvedValue({ ok: false, code: "network_error", error: "down" });
    const rates = await getExchangeRatesFromUsd();
    expect(rates.USD).toBe(1);
    for (const code of ["EUR", "GBP", "AED", "CHF", "JPY", "CAD", "AUD", "SGD"]) {
      expect(rates[code]).toBeGreaterThan(0);
    }
    // The fallback is good enough to convert with: USD<->AED is the pegged ~3.67.
    expect(convertAmount(100, "USD", "AED", rates)).toBeCloseTo(367, 6);
    expect(convertAmount(367, "AED", "USD", rates)).toBeCloseTo(100, 6);
  });
});
