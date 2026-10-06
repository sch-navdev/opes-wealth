import { describe, expect, it } from "vitest";
import {
  EMPTY_SCPI_METADATA,
  generateQuarterlyDividends,
  getScpiMetadataErrors,
  parseScpiMetadata,
  scpiAverageYield,
  scpiCurrentValue,
  scpiEntryFees,
  scpiInvested,
  scpiReceived,
  scpiTrailingYield,
  scpiWithdrawalValue,
  type ScpiDividend,
  type ScpiMetadata,
} from "@/lib/scpi";

const meta = (over: Partial<ScpiMetadata> = {}): ScpiMetadata => ({
  ...EMPTY_SCPI_METADATA,
  subscription_price: 200,
  entry_fee_pct: 10,
  ...over,
});

const div = (date: string, amount: number, status: ScpiDividend["status"] = "received"): ScpiDividend => ({
  id: `d-${date}`,
  date,
  amount,
  status,
  quarter: "",
});

describe("parseScpiMetadata", () => {
  it("returns the defaults for null / non-objects", () => {
    expect(parseScpiMetadata(null)).toEqual(EMPTY_SCPI_METADATA);
    expect(parseScpiMetadata("x")).toEqual(EMPTY_SCPI_METADATA);
  });

  it("merges stored values and repairs non-array ledgers", () => {
    const p = parseScpiMetadata({ management_company: "Corum", dividends: 5, yield_history: null });
    expect(p.management_company).toBe("Corum");
    expect(p.dividends).toEqual([]);
    expect(p.yield_history).toEqual([]);
    expect(p.holding_mode).toBe("pleine_propriete");
  });
});

describe("getScpiMetadataErrors", () => {
  it("no errors for a valid holding", () => {
    expect(getScpiMetadataErrors(meta(), 50)).toEqual([]);
  });

  it("requires positive shares and a positive subscription price", () => {
    expect(getScpiMetadataErrors(meta(), 0)).toContain("scpi_shares_required");
    expect(getScpiMetadataErrors(meta(), -1)).toContain("scpi_shares_required");
    expect(getScpiMetadataErrors(meta({ subscription_price: null }), 5)).toContain("scpi_price_required");
    expect(getScpiMetadataErrors(meta({ subscription_price: 0 }), 5)).toContain("scpi_price_required");
  });

  it("entry fee: null, 0 and up to <100 are fine; negative or >= 100 are not", () => {
    expect(getScpiMetadataErrors(meta({ entry_fee_pct: null }), 5)).toEqual([]);
    expect(getScpiMetadataErrors(meta({ entry_fee_pct: 0 }), 5)).toEqual([]);
    expect(getScpiMetadataErrors(meta({ entry_fee_pct: 99.9 }), 5)).toEqual([]);
    expect(getScpiMetadataErrors(meta({ entry_fee_pct: 100 }), 5)).toContain("scpi_fee_invalid");
    expect(getScpiMetadataErrors(meta({ entry_fee_pct: -1 }), 5)).toContain("scpi_fee_invalid");
  });

  it("dividends need a date and a non-negative amount", () => {
    expect(getScpiMetadataErrors(meta({ dividends: [div("", 10)] }), 5)).toContain("scpi_dividend_invalid");
    expect(getScpiMetadataErrors(meta({ dividends: [div("2025-01-15", -1)] }), 5)).toContain("scpi_dividend_invalid");
    expect(getScpiMetadataErrors(meta({ dividends: [div("2025-01-15", 0)] }), 5)).toEqual([]);
  });
});

describe("invested capital, fees and value", () => {
  it("invested = shares x subscription price (entry fee included)", () => {
    expect(scpiInvested(meta(), 50)).toBe(10000);
    expect(scpiInvested(meta({ subscription_price: null }), 50)).toBe(0);
    expect(scpiInvested(meta(), 0)).toBe(0);
  });

  it("entry fees = invested x fee%", () => {
    expect(scpiEntryFees(meta(), 50)).toBe(1000);
    expect(scpiEntryFees(meta({ entry_fee_pct: null }), 50)).toBe(0);
  });

  it("withdrawal value is the typed one, else price x (1 - fee)", () => {
    expect(scpiWithdrawalValue(meta())).toBe(180);
    expect(scpiWithdrawalValue(meta({ withdrawal_value: 190 }))).toBe(190);
    expect(scpiWithdrawalValue(meta({ withdrawal_value: 0 }))).toBe(180); // zero is treated as blank
    expect(scpiWithdrawalValue(meta({ entry_fee_pct: null }))).toBe(200);
    expect(scpiWithdrawalValue(meta({ subscription_price: null }))).toBeNull();
  });

  it("a typed withdrawal value still wins when there is no price", () => {
    expect(scpiWithdrawalValue(meta({ subscription_price: null, withdrawal_value: 170 }))).toBe(170);
  });

  it("current value = shares x withdrawal value; invested - fees = value when derived", () => {
    expect(scpiCurrentValue(meta(), 50)).toBe(9000);
    expect(scpiCurrentValue(meta({ withdrawal_value: 190 }), 50)).toBe(9500);
    expect(scpiCurrentValue(meta({ subscription_price: null }), 50)).toBeNull();
    expect(scpiInvested(meta(), 50) - scpiEntryFees(meta(), 50)).toBeCloseTo(scpiCurrentValue(meta(), 50) as number, 8);
  });
});

describe("scpiReceived", () => {
  const m = meta({
    dividends: [div("2024-04-15", 100), div("2024-07-15", 110), div("2025-04-15", 150), div("2025-07-15", 999, "expected")],
  });

  it("sums received dividends only", () => {
    expect(scpiReceived(m)).toBe(360);
  });

  it("optionally restricts to dividends on or after `from` (inclusive)", () => {
    expect(scpiReceived(m, "2024-07-15")).toBe(260);
    expect(scpiReceived(m, "2024-07-16")).toBe(150);
    expect(scpiReceived(m, "2026-01-01")).toBe(0);
  });

  it("zero without dividends", () => {
    expect(scpiReceived(meta())).toBe(0);
  });
});

describe("scpiTrailingYield", () => {
  const m = meta({
    dividends: [
      div("2024-06-15", 999), // older than 12 months
      div("2024-06-30", 50), // exactly on the window start: counted
      div("2024-07-15", 100),
      div("2025-04-15", 150),
      div("2025-07-15", 999, "expected"),
    ],
  });

  it("received over the last 12 months / invested, in percent", () => {
    expect(scpiTrailingYield(m, 50, "2025-06-30")).toBeCloseTo(3, 10); // 300 / 10000
  });

  it("null with nothing invested or nothing received in the window", () => {
    expect(scpiTrailingYield(m, 0, "2025-06-30")).toBeNull();
    expect(scpiTrailingYield(meta({ subscription_price: null, dividends: m.dividends }), 50, "2025-06-30")).toBeNull();
    expect(scpiTrailingYield(m, 50, "2030-01-01")).toBeNull();
  });
});

describe("scpiAverageYield", () => {
  it("is the mean of the recorded annual rates", () => {
    expect(
      scpiAverageYield(meta({ yield_history: [{ id: "a", year: 2022, rate: 4 }, { id: "b", year: 2023, rate: 5 }, { id: "c", year: 2024, rate: 6 }] })),
    ).toBe(5);
  });

  it("ignores non-finite rates; null when none are usable", () => {
    expect(scpiAverageYield(meta({ yield_history: [{ id: "a", year: 2022, rate: NaN }, { id: "b", year: 2023, rate: 4.5 }] }))).toBe(4.5);
    expect(scpiAverageYield(meta({ yield_history: [{ id: "a", year: 2022, rate: NaN }] }))).toBeNull();
    expect(scpiAverageYield(meta())).toBeNull();
  });
});

describe("generateQuarterlyDividends", () => {
  it("pays invested x yield / 4 each quarter, on the 15th after the quarter closes", () => {
    const d = generateQuarterlyDividends({
      invested: 10000,
      yieldPct: 4.8,
      jouissanceDate: "2024-02-01",
      today: "2024-10-20",
      futureQuarters: 1,
    });
    expect(d.map((x) => x.date)).toEqual(["2024-04-15", "2024-07-15", "2024-10-15", "2025-01-15"]);
    expect(d.every((x) => x.amount === 120)).toBe(true);
  });

  it("labels each payment with the quarter it pays for (January pays Q4 of the previous year)", () => {
    const d = generateQuarterlyDividends({ invested: 10000, yieldPct: 4.8, jouissanceDate: "2024-02-01", today: "2024-10-20", futureQuarters: 1 });
    expect(d.map((x) => x.quarter)).toEqual(["T1 2024", "T2 2024", "T3 2024", "T4 2024"]);
  });

  it("payments on or before today are received, later ones expected", () => {
    const d = generateQuarterlyDividends({ invested: 10000, yieldPct: 4.8, jouissanceDate: "2024-02-01", today: "2024-10-15", futureQuarters: 1 });
    expect(d.map((x) => x.status)).toEqual(["received", "received", "received", "expected"]);
    const before = generateQuarterlyDividends({ invested: 10000, yieldPct: 4.8, jouissanceDate: "2024-02-01", today: "2024-10-14", futureQuarters: 1 });
    expect(before[2].status).toBe("expected");
  });

  it("the first payment is the first scheduled date on or after jouissance (inclusive)", () => {
    const onDay = generateQuarterlyDividends({ invested: 4000, yieldPct: 4, jouissanceDate: "2024-07-15", today: "2024-07-15", futureQuarters: 1 });
    expect(onDay[0].date).toBe("2024-07-15");
    const dayAfter = generateQuarterlyDividends({ invested: 4000, yieldPct: 4, jouissanceDate: "2024-07-16", today: "2024-07-16", futureQuarters: 1 });
    expect(dayAfter[0].date).toBe("2024-10-15");
  });

  it("defaults to four future quarters", () => {
    const d = generateQuarterlyDividends({ invested: 10000, yieldPct: 4, jouissanceDate: "2024-06-01", today: "2024-06-01" });
    expect(d.map((x) => x.date)).toEqual(["2024-07-15", "2024-10-15", "2025-01-15", "2025-04-15"]);
    expect(d.every((x) => x.status === "expected")).toBe(true);
  });

  it("four consecutive quarters add up to invested x annual yield", () => {
    const d = generateQuarterlyDividends({ invested: 10000, yieldPct: 4.8, jouissanceDate: "2024-01-01", today: "2024-12-31", futureQuarters: 0 });
    // 15 Jan, Apr, Jul, Oct 2024 (all <= today).
    expect(d).toHaveLength(4);
    expect(d.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(480, 8);
  });

  it("is sorted by date, with unique ids", () => {
    const d = generateQuarterlyDividends({ invested: 10000, yieldPct: 5, jouissanceDate: "2022-03-01", today: "2024-03-01", futureQuarters: 4 });
    const dates = d.map((x) => x.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(d.map((x) => x.id)).size).toBe(d.length);
  });

  it("returns [] without capital, a yield, or a start date", () => {
    const ok = { invested: 10000, yieldPct: 4, jouissanceDate: "2024-01-01", today: "2024-06-01" };
    expect(generateQuarterlyDividends({ ...ok, invested: 0 })).toEqual([]);
    expect(generateQuarterlyDividends({ ...ok, yieldPct: 0 })).toEqual([]);
    expect(generateQuarterlyDividends({ ...ok, jouissanceDate: "" })).toEqual([]);
  });

  it("generated rows validate", () => {
    const d = generateQuarterlyDividends({ invested: 10000, yieldPct: 4.8, jouissanceDate: "2024-02-01", today: "2024-10-20" });
    expect(getScpiMetadataErrors(meta({ dividends: d }), 50)).toEqual([]);
  });
});
