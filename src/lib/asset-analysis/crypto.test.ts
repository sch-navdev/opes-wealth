import { describe, expect, it } from "vitest";
import { EMPTY_CRYPTO_METADATA } from "@/lib/crypto";
import { cryptoAnalysis } from "./crypto";

// Invented fixture: 2 coins; value 1000 -> 1500 -> 900 -> 1200.
const HISTORY = [
  { date: "2025-01-01", value: 1000 },
  { date: "2025-02-01", value: 1500 },
  { date: "2025-03-01", value: 900 },
  { date: "2025-04-01", value: 1200 },
];

describe("cryptoAnalysis", () => {
  it("derives change, drawdown, range and holding period from the history", () => {
    const a = cryptoAnalysis({ quantity: 2, currentValue: 1200, metadata: EMPTY_CRYPTO_METADATA, history: HISTORY, purchaseDate: "2024-12-22", today: "2025-04-01" });
    expect(a.unitPrice).toBe(600);
    expect(a.costBasis).toBeNull();
    expect(a.sinceFirstRecord?.amount).toBe(200);
    expect(a.sinceFirstRecord?.pct).toBeCloseTo(0.2, 10);
    expect(a.drawdown?.pct).toBeCloseTo(900 / 1500 - 1, 10); // -40 %
    expect(a.drawdown?.current).toBeCloseTo(1200 / 1500 - 1, 10);
    expect(a.high).toEqual({ date: "2025-02-01", value: 1500 });
    expect(a.low).toEqual({ date: "2025-03-01", value: 900 });
    expect(a.daysHeld).toBe(100);
    expect(a.volatility).not.toBeNull();
  });

  it("prefers the last quote for the unit price", () => {
    const a = cryptoAnalysis({ quantity: 2, currentValue: 1200, metadata: { ...EMPTY_CRYPTO_METADATA, last_unit_price: 610 }, history: [], purchaseDate: null, today: "2025-04-01" });
    expect(a.unitPrice).toBe(610);
  });

  it("is all null for an empty history, never NaN", () => {
    const a = cryptoAnalysis({ quantity: 0, currentValue: 0, metadata: EMPTY_CRYPTO_METADATA, history: [], purchaseDate: null, today: "2025-04-01" });
    expect(a).toMatchObject({ unitPrice: null, sinceFirstRecord: null, drawdown: null, volatility: null, high: null, low: null, daysHeld: null, observations: 0 });
  });
});
