import { describe, expect, it } from "vitest";
import {
  attributionFxRequests,
  buildAttributionPanelData,
  collectAttributionCandidates,
  type AttributionAssetInput,
} from "@/lib/dashboard-attribution";

// Base USD. rates are currency-per-USD: EUR 0.8 -> 1.25 USD per EUR now; GBP 0.5 -> 2.0 USD per GBP now.
const rates = { USD: 1, EUR: 0.8, GBP: 0.5 };

function asset(over: Partial<AttributionAssetInput> & { id: string; category: string }): AttributionAssetInput {
  const { category, ...rest } = over;
  return {
    name: over.id,
    quantity: 1,
    current_value: 0,
    currency: "USD",
    is_liability: false,
    metadata: null,
    purchase_date: null,
    asset_categories: { name: category },
    ...rest,
  };
}

const equity = asset({
  id: "eq",
  category: "Equities",
  currency: "EUR",
  quantity: 10,
  current_value: 120,
  metadata: {
    trades: [
      { id: "t1", tradeDate: "2024-03-01", side: "buy", quantity: 10, price: 10, currency: "EUR", source: "manual" },
    ],
  },
});
const carGbp = asset({
  id: "car",
  category: "Vehicles",
  currency: "GBP",
  current_value: 300,
  purchase_date: "2024-02-01",
  metadata: { purchase_price: 200 },
});
const carNoRate = asset({
  id: "car2",
  category: "Vehicles",
  currency: "GBP",
  current_value: 50,
  purchase_date: "2020-05-05",
  metadata: { purchase_price: 40 },
});

const fxHistory = { EUR: { "2024-03-01": 1.0 }, GBP: { "2024-02-01": 1.5 } };

describe("collectAttributionCandidates", () => {
  it("keeps only foreign, non-liability holdings with a cost basis", () => {
    const list = collectAttributionCandidates(
      [
        equity,
        carGbp,
        asset({ id: "usd", category: "Equities", currency: "USD", metadata: { trades: equity.metadata?.trades } }),
        asset({ id: "noDate", category: "Vehicles", currency: "EUR", metadata: { purchase_price: 10 } }),
        asset({ id: "noPrice", category: "Vehicles", currency: "EUR", purchase_date: "2024-01-01" }),
        asset({ id: "noTrades", category: "Equities", currency: "EUR" }),
        asset({ id: "debt", category: "Vehicles", currency: "EUR", is_liability: true, purchase_date: "2024-01-01", metadata: { purchase_price: 10 } }),
        asset({ id: "cash", category: "Cash", currency: "EUR" }),
      ],
      "USD",
    );
    expect(list.map((c) => c.id)).toEqual(["eq", "car"]);
  });

  it("lists the unique dates needed per currency", () => {
    const list = collectAttributionCandidates([equity, carGbp, carNoRate], "USD");
    expect(attributionFxRequests(list)).toEqual({
      EUR: ["2024-03-01"],
      GBP: ["2020-05-05", "2024-02-01"],
    });
  });
});

describe("buildAttributionPanelData", () => {
  it("returns null when there is no foreign holding with a cost basis", () => {
    expect(buildAttributionPanelData({ candidates: [], baseCurrency: "USD", rates, fxHistory: {} })).toBeNull();
  });

  it("sums capital and currency effects exactly, with coverage and top holdings", () => {
    const candidates = collectAttributionCandidates([equity, carGbp, carNoRate], "USD");
    const data = buildAttributionPanelData({ candidates, baseCurrency: "USD", rates, fxHistory });
    expect(data).not.toBeNull();
    // equity: cost 100 @1.0, value 120 @1.25 -> capital 20, currency 30
    // car:    cost 200 @1.5=300, value 300 @2.0 -> capital 150, currency 150
    // car2 has no historical rate -> excluded
    expect(data!.included).toBe(2);
    expect(data!.total).toBe(3);
    expect(data!.coverage).toBeCloseTo(2 / 3, 10);
    const t = data!.totals!;
    expect(t.costBase).toBeCloseTo(400, 8);
    expect(t.capitalBase).toBeCloseTo(170, 8);
    expect(t.currencyBase).toBeCloseTo(180, 8);
    expect(t.totalBase).toBeCloseTo(350, 8);
    expect(t.capitalBase + t.currencyBase).toBeCloseTo(t.totalBase, 8);
    expect(t.capitalPct).toBeCloseTo(0.425, 8);
    expect(t.currencyPct).toBeCloseTo(0.45, 8);
    expect(t.totalPct).toBeCloseTo(0.875, 8);
    expect(t.capitalShare).toBeCloseTo(170 / 350, 8);
    expect(t.currencyShare).toBeCloseTo(180 / 350, 8);
    expect(data!.top.map((h) => [h.id, h.currency])).toEqual([["car", "GBP"], ["eq", "EUR"]]);
    expect(data!.top[0].currencyBase).toBeCloseTo(150, 8);
    expect(data!.top[1].currencyBase).toBeCloseTo(30, 8);
  });

  it("orders the top list by absolute currency effect (losses count) and caps it at three", () => {
    // EUR fell: bought at 1.5, now 1.25 -> currency = 100 * (1.25 - 1.5) = -25 on a 100 EUR holding
    const mk = (id: string, value: number) =>
      asset({ id, category: "Vehicles", currency: "EUR", current_value: value, purchase_date: "2024-01-01", metadata: { purchase_price: 100 } });
    const candidates = collectAttributionCandidates([mk("a", 100), mk("b", 200), mk("c", 40), mk("d", 60)], "USD");
    const data = buildAttributionPanelData({ candidates, baseCurrency: "USD", rates, fxHistory: { EUR: { "2024-01-01": 1.5 } } });
    expect(data!.top.map((h) => h.id)).toEqual(["b", "a", "d"]);
    expect(data!.top[0].currencyBase).toBeCloseTo(-50, 8);
    expect(data!.totals!.currencyBase).toBeLessThan(0);
  });

  it("keeps the panel with null totals when no historical FX is available", () => {
    const candidates = collectAttributionCandidates([equity, carGbp], "USD");
    const data = buildAttributionPanelData({ candidates, baseCurrency: "USD", rates, fxHistory: {} });
    expect(data).toEqual({ included: 0, total: 2, coverage: 0, totals: null, top: [] });
  });

  it("excludes a holding whose currency has no current rate", () => {
    const candidates = collectAttributionCandidates([carGbp], "USD");
    const data = buildAttributionPanelData({ candidates, baseCurrency: "USD", rates: { USD: 1 }, fxHistory });
    expect(data!.included).toBe(0);
  });
});
