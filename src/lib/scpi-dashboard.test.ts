import { describe, expect, it } from "vitest";
import { buildScpiBlockData, type ScpiBlockAsset } from "@/lib/scpi-dashboard";

// Invented holdings. rates: units of currency per 1 USD (same convention as lib/fx).
const rates = { USD: 1, EUR: 0.5 };
const TODAY = "2026-10-09";

const scpi = (id: string, over: Partial<ScpiBlockAsset> & { md?: Record<string, unknown> } = {}): ScpiBlockAsset => ({
  id,
  name: `SCPI ${id}`,
  quantity: 10,
  current_value: 1800,
  currency: "EUR",
  metadata: {
    subscription_price: 200,
    entry_fee_pct: 10,
    target_yield_pct: 5,
    management_company: "Test Gestion",
    ...(over.md ?? {}),
  },
  asset_categories: { name: "SCPI" },
  ...over,
});

describe("buildScpiBlockData", () => {
  it("empty without SCPI holdings (other categories and liabilities ignored)", () => {
    const d = buildScpiBlockData(
      [
        { ...scpi("a"), asset_categories: { name: "Equities" } },
        { ...scpi("b"), is_liability: true },
      ],
      "USD",
      rates,
      TODAY,
    );
    expect(d).toEqual({ holdings: [], totalValueBase: 0, weightedRatePct: null });
  });

  it("totals in the base currency, largest first, with the indicator ratios and date", () => {
    const d = buildScpiBlockData(
      [
        scpi("small", { current_value: 900 }),
        scpi("big", {
          current_value: 1800,
          md: {
            withdrawal_value: 180,
            indicators: [{ id: "i", as_of: "2026-06-30", vdrec: 220, vdrea: 189, source_note: "" }],
          },
        }),
      ],
      "EUR",
      rates,
      TODAY,
    );
    expect(d.holdings.map((h) => h.id)).toEqual(["big", "small"]);
    expect(d.totalValueBase).toBe(2700);
    const big = d.holdings[0];
    expect(big.asOf).toBe("2026-06-30");
    expect(big.stale).toBe(false);
    expect(big.vdrecRatioPct).toBeCloseTo(110, 10);
    expect(big.vdreaRatioPct).toBeCloseTo(105, 10);
    expect(big.vdrecReading).toBe("above");
    expect(d.holdings[1].asOf).toBeNull();
    expect(d.holdings[1].vdrecRatioPct).toBeNull();
  });

  it("marks indicators older than 12 months as stale", () => {
    const d = buildScpiBlockData(
      [scpi("old", { md: { indicators: [{ id: "i", as_of: "2025-01-31", vdrec: 200, vdrea: null, source_note: "" }] } })],
      "EUR",
      rates,
      TODAY,
    );
    expect(d.holdings[0].stale).toBe(true);
  });

  it("weights the distribution rate by invested capital in the base currency", () => {
    const d = buildScpiBlockData(
      [
        // invested 2000 EUR at target 5 %
        scpi("a", { md: { target_yield_pct: 5 } }),
        // invested 6000 EUR at target 3 %
        scpi("b", { quantity: 30, md: { target_yield_pct: 3 } }),
        // no rate at all: left out of the average
        scpi("c", { md: { target_yield_pct: null } }),
      ],
      "EUR",
      rates,
      TODAY,
    );
    expect(d.weightedRatePct).toBeCloseTo((5 * 2000 + 3 * 6000) / 8000, 10);
  });

  it("converts to another base currency", () => {
    const d = buildScpiBlockData([scpi("a", { current_value: 1000 })], "USD", rates, TODAY);
    expect(d.totalValueBase).toBeCloseTo(2000, 6); // 1000 EUR at 0.5 EUR per USD
  });

  it("never throws on empty or odd metadata", () => {
    expect(() =>
      buildScpiBlockData([{ ...scpi("x"), metadata: null }, { ...scpi("y"), metadata: { indicators: "no" } }], "EUR", rates, TODAY),
    ).not.toThrow();
  });
});
