import { describe, expect, it } from "vitest";
import {
  attributionDates,
  baseFxNow,
  buildAttributionView,
  type AttributionViewArgs,
  type HistoricalRateLike,
} from "@/lib/asset-attribution-view";

const ratesFromUsd = { USD: 1, EUR: 1 / 1.1, AED: 3.6725 };
const trade = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  tradeDate: "2024-03-15",
  side: "buy",
  quantity: 10,
  price: 100,
  currency: "EUR",
  source: "manual",
  ...over,
});
const equity = (over: Partial<AttributionViewArgs> = {}): AttributionViewArgs => ({
  category: "Equities",
  currency: "EUR",
  base: "USD",
  currentValue: 1500,
  quantity: 10,
  purchaseDate: "2024-03-15",
  metadata: { trades: [trade()] },
  factor: 1,
  ...over,
});
const hist = (rate = 1.08, extra: Partial<Extract<HistoricalRateLike, { ok: true }>> = {}): Record<string, HistoricalRateLike> => ({
  "2024-03-15": { ok: true, rate, asOf: "2024-03-15", source: "ecb", ...extra },
});

describe("baseFxNow", () => {
  it("derives base-per-local from a USD-anchored table", () => {
    expect(baseFxNow(ratesFromUsd, "EUR", "USD")).toBeCloseTo(1.1, 9);
    expect(baseFxNow(ratesFromUsd, "USD", "EUR")).toBeCloseTo(1 / 1.1, 9);
    expect(baseFxNow(ratesFromUsd, "EUR", "AED")).toBeCloseTo(3.6725 * 1.1, 9);
  });
  it("is null when a leg is unknown", () => {
    expect(baseFxNow(ratesFromUsd, "XXX", "USD")).toBeNull();
    expect(baseFxNow(ratesFromUsd, "EUR", "XXX")).toBeNull();
  });
});

describe("attributionDates", () => {
  it("is null for same-currency, unsupported categories and missing base", () => {
    expect(attributionDates(equity({ currency: "USD" }))).toBeNull();
    expect(attributionDates(equity({ category: "Cash" }))).toBeNull();
    expect(attributionDates(equity({ category: "Private Equity" }))).toBeNull();
    expect(attributionDates(equity({ base: null }))).toBeNull();
  });
  it("lists unique buy dates of an equity", () => {
    const metadata = { trades: [trade(), trade({ id: "t2" }), trade({ id: "t3", tradeDate: "2024-05-02" }), trade({ id: "t4", side: "sell", tradeDate: "2024-06-01" })] };
    expect(attributionDates(equity({ metadata }))?.sort()).toEqual(["2024-03-15", "2024-05-02"]);
  });
  it("uses the purchase date for real estate and vehicles, and [] when it is missing", () => {
    expect(attributionDates(equity({ category: "Real Estate", metadata: { purchasePrice: 1 } }))).toEqual(["2024-03-15"]);
    expect(attributionDates(equity({ category: "Vehicles", purchaseDate: null }))).toEqual([]);
  });
});

describe("buildAttributionView", () => {
  const base = { ratesFromUsd, historical: hist() };

  it("returns null when no card applies", () => {
    expect(buildAttributionView({ ...equity({ currency: "USD" }), ...base })).toBeNull();
    expect(buildAttributionView({ ...equity({ category: "Crypto" }), ...base })).toBeNull();
  });

  it("builds an equity attribution that is additive", () => {
    const v = buildAttributionView({ ...equity(), ...base });
    expect(v?.status).toBe("ok");
    if (v?.status !== "ok") return;
    expect(v.base).toBe("USD");
    expect(v.result.costBase).toBeCloseTo(1080, 6);
    expect(v.result.capitalBase).toBeCloseTo(540, 6);
    expect(v.result.currencyBase).toBeCloseTo(30, 6);
    expect(v.result.capitalBase + v.result.currencyBase).toBeCloseTo(v.result.totalBase, 9);
    expect(v.result.capitalPct).toBeCloseTo(0.5, 9);
    expect(v.rates).toEqual({ costAsOfFrom: "2024-03-15", costAsOfTo: "2024-03-15", approximate: false, pegged: false });
  });

  it("scales amounts by the owner factor and leaves percentages unchanged", () => {
    const whole = buildAttributionView({ ...equity(), ...base });
    const half = buildAttributionView({ ...equity({ factor: 0.5 }), ...base });
    if (whole?.status !== "ok" || half?.status !== "ok") throw new Error("expected ok");
    expect(half.result.totalBase).toBeCloseTo(whole.result.totalBase / 2, 9);
    expect(half.result.capitalBase).toBeCloseTo(whole.result.capitalBase / 2, 9);
    expect(half.result.valueBase).toBeCloseTo(whole.result.valueBase / 2, 9);
    expect(half.result.totalPct).toBeCloseTo(whole.result.totalPct as number, 12);
    expect(half.result.currencyPct).toBeCloseTo(whole.result.currencyPct as number, 12);
    // an unusable factor falls back to the whole asset
    const bad = buildAttributionView({ ...equity({ factor: 7 }), ...base });
    if (bad?.status !== "ok") throw new Error("expected ok");
    expect(bad.result.totalBase).toBeCloseTo(whole.result.totalBase, 9);
  });

  it("flags weekend fixings as approximate and pegs as pegged", () => {
    const v = buildAttributionView({ ...equity(), ratesFromUsd, historical: hist(1.08, { asOf: "2024-03-14", source: "peg" }) });
    if (v?.status !== "ok") throw new Error("expected ok");
    expect(v.rates).toEqual({ costAsOfFrom: "2024-03-14", costAsOfTo: "2024-03-14", approximate: true, pegged: true });
  });

  it("real estate: contract price wins over purchase price, market valuation over current value", () => {
    const v = buildAttributionView({
      ...equity({
        category: "Real Estate",
        currency: "EUR",
        currentValue: 1,
        metadata: { contract_price: 1000, purchasePrice: 900, market_valuation: 1200 },
      }),
      ...base,
    });
    if (v?.status !== "ok") throw new Error("expected ok");
    expect(v.result.costLocal).toBe(1000);
    expect(v.result.valueLocal).toBe(1200);
  });

  it("vehicles: uses purchase_price and current value", () => {
    const v = buildAttributionView({
      ...equity({ category: "Vehicles", currentValue: 800, metadata: { purchase_price: 1000 } }),
      ...base,
    });
    if (v?.status !== "ok") throw new Error("expected ok");
    expect(v.result.costLocal).toBe(1000);
    expect(v.result.valueLocal).toBe(800);
    expect(v.result.capitalBase).toBeCloseTo(-200 * 1.08, 9);
  });

  it("maps failures to reasons", () => {
    const reason = (a: Parameters<typeof buildAttributionView>[0]) => {
      const v = buildAttributionView(a);
      return v?.status === "unavailable" ? v.reason : v?.status;
    };
    expect(reason({ ...equity({ metadata: { trades: [] } }), ...base })).toBe("no_trades");
    expect(reason({ ...equity({ metadata: { trades: [trade({ currency: "GBP" })] } }), ...base })).toBe("currency_mismatch");
    expect(reason({ ...equity({ category: "Vehicles", metadata: {} }), ...base })).toBe("missing_purchase_price");
    expect(reason({ ...equity({ category: "Vehicles", metadata: { purchase_price: 5 }, purchaseDate: null }), ...base })).toBe("missing_purchase_date");
    expect(reason({ ...equity(), ...base, ratesFromUsd: { USD: 1 } })).toBe("missing_fx_now");
    expect(reason({ ...equity(), ...base, historical: null })).toBe("missing_fx_at_cost");
    expect(reason({ ...equity(), ...base, historical: { "2024-03-15": { ok: false, reason: "x" } } })).toBe("missing_fx_at_cost");
    expect(reason({ ...equity({ currentValue: Number.NaN }), ...base })).toBe("invalid_value");
  });

  it("output is JSON-serialisable", () => {
    const v = buildAttributionView({ ...equity(), ...base });
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });
});
