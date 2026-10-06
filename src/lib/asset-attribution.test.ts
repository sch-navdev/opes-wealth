import { describe, expect, it } from "vitest";
import type { EquityTrade } from "./equities";
import { buildEquityAttribution, buildPurchaseAttribution } from "./asset-attribution";

const trade = (p: Partial<EquityTrade>): EquityTrade => ({
  id: "x",
  tradeDate: "2025-01-02",
  side: "buy",
  quantity: 10,
  price: 100,
  currency: "EUR",
  source: "manual",
  ...p,
});

describe("buildPurchaseAttribution", () => {
  const fxOnDate = (d: string) => (d === "2024-01-01" ? 1.0 : null);

  it("EUR asset in USD base: bought 1.00, now 1.10", () => {
    const o = buildPurchaseAttribution({
      purchasePriceLocal: 1000,
      purchaseDate: "2024-01-01",
      currentValueLocal: 1200,
      currency: "EUR",
      base: "USD",
      fxNow: 1.1,
      fxOnDate,
    });
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.result.capitalBase).toBeCloseTo(200, 9);
    expect(o.result.currencyBase).toBeCloseTo(120, 9);
    expect(o.result.totalPct).toBeCloseTo(0.32, 9);
  });

  it("reverse base AED (EUR->AED 4.0 then 4.4)", () => {
    const o = buildPurchaseAttribution({
      purchasePriceLocal: 1000,
      purchaseDate: "2024-01-01",
      currentValueLocal: 1200,
      currency: "EUR",
      base: "AED",
      fxNow: 4.4,
      fxOnDate: () => 4.0,
    });
    expect(o.ok && o.result.capitalBase).toBeCloseTo(800, 9);
    expect(o.ok && o.result.currencyBase).toBeCloseTo(480, 9);
  });

  it("same currency needs no fx", () => {
    const o = buildPurchaseAttribution({
      purchasePriceLocal: 100,
      purchaseDate: "2024-01-01",
      currentValueLocal: 150,
      currency: "AED",
      base: "AED",
      fxNow: null,
      fxOnDate: () => null,
    });
    expect(o.ok && o.result.sameCurrency).toBe(true);
    expect(o.ok && o.result.currencyBase).toBe(0);
  });

  it("typed reasons", () => {
    const base = {
      purchasePriceLocal: 100 as number | null,
      purchaseDate: "2024-01-01" as string | null,
      currentValueLocal: 100,
      currency: "EUR",
      base: "USD",
      fxNow: 1.1 as number | null,
      fxOnDate,
    };
    expect(buildPurchaseAttribution({ ...base, purchasePriceLocal: null })).toEqual({
      ok: false,
      reason: "missing_purchase_price",
    });
    expect(buildPurchaseAttribution({ ...base, purchaseDate: null })).toEqual({
      ok: false,
      reason: "missing_purchase_date",
    });
    expect(buildPurchaseAttribution({ ...base, fxNow: null })).toEqual({
      ok: false,
      reason: "missing_fx_now",
    });
    expect(buildPurchaseAttribution({ ...base, purchaseDate: "1999-01-01" })).toEqual({
      ok: false,
      reason: "missing_fx_at_cost",
    });
  });
});

describe("buildEquityAttribution", () => {
  const rates: Record<string, number> = { "2025-01-02": 1.0, "2025-03-03": 1.2 };
  const fxOnDate = (d: string) => rates[d] ?? null;

  it("two buys at different fx, no sells", () => {
    const o = buildEquityAttribution({
      trades: [
        trade({ quantity: 10, price: 10, tradeDate: "2025-01-02" }), // cost 100 @1.0
        trade({ quantity: 10, price: 20, tradeDate: "2025-03-03" }), // cost 200 @1.2
      ],
      quantity: 20,
      currentValueLocal: 360,
      currency: "EUR",
      base: "USD",
      fxNow: 1.5,
      fxOnDate,
    });
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.result.costBase).toBeCloseTo(340, 9);
    expect(o.result.capitalBase).toBeCloseTo(80 - 24, 9);
    expect(o.result.currencyBase).toBeCloseTo(144, 9);
    expect(Math.abs(o.result.capitalBase + o.result.currencyBase - o.result.totalBase)).toBeLessThan(1e-9);
  });

  it("sell reduces all lots proportionally (average cost)", () => {
    const o = buildEquityAttribution({
      trades: [
        trade({ quantity: 10, price: 10, tradeDate: "2025-01-02" }),
        trade({ quantity: 10, price: 20, tradeDate: "2025-03-03" }),
        trade({ side: "sell", quantity: 10, price: 30, tradeDate: "2025-04-01" }),
      ],
      quantity: 10,
      currentValueLocal: 180,
      currency: "EUR",
      base: "USD",
      fxNow: 1.5,
      fxOnDate,
    });
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    // remaining: half of each lot -> cost 50 @1.0 + 100 @1.2
    expect(o.result.costLocal).toBeCloseTo(150, 9);
    expect(o.result.costBase).toBeCloseTo(50 + 120, 9);
  });

  it("scales lots to live quantity when ledger disagrees", () => {
    const o = buildEquityAttribution({
      trades: [trade({ quantity: 10, price: 10, tradeDate: "2025-01-02" })],
      quantity: 5,
      currentValueLocal: 60,
      currency: "EUR",
      base: "USD",
      fxNow: 1.1,
      fxOnDate,
    });
    expect(o.ok && o.result.costLocal).toBeCloseTo(50, 9);
  });

  it("same currency skips fx; missing fx and empty ledger give reasons", () => {
    const same = buildEquityAttribution({
      trades: [trade({ currency: "USD" })],
      quantity: 10,
      currentValueLocal: 1200,
      currency: "USD",
      base: "USD",
      fxNow: null,
      fxOnDate: () => null,
    });
    expect(same.ok && same.result.currencyBase).toBe(0);

    expect(
      buildEquityAttribution({
        trades: [trade({ tradeDate: "1999-01-01" })],
        quantity: 10,
        currentValueLocal: 1,
        currency: "EUR",
        base: "USD",
        fxNow: 1.1,
        fxOnDate,
      }),
    ).toEqual({ ok: false, reason: "missing_fx_at_cost" });
    expect(
      buildEquityAttribution({
        trades: [],
        quantity: 1,
        currentValueLocal: 1,
        currency: "EUR",
        base: "USD",
        fxNow: 1.1,
        fxOnDate,
      }),
    ).toEqual({ ok: false, reason: "no_trades" });
  });

  it("ignores broker exchangeRate field", () => {
    const o = buildEquityAttribution({
      trades: [trade({ exchangeRate: 99, quantity: 10, price: 100 })],
      quantity: 10,
      currentValueLocal: 1000,
      currency: "EUR",
      base: "USD",
      fxNow: 1.0,
      fxOnDate,
    });
    expect(o.ok && o.result.fxAtCost).toBeCloseTo(1.0, 12);
  });
});
