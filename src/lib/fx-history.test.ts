import { describe, expect, it } from "vitest";
import {
  buildRateTable,
  classifyFxState,
  convertOnDate,
  dateChunks,
  deriveRowsFromEurSeries,
  formatGstStamp,
  fxCurrencyCodes,
  gstDate,
  hasHistoryFor,
  lookupRate,
  planDailyRows,
  type FxRateRow,
} from "@/lib/fx-history";

const row = (rate_date: string, currency: string, rate_per_usd: number, source: FxRateRow["source"] = "live"): FxRateRow => ({
  rate_date,
  currency,
  rate_per_usd,
  source,
});

const table = buildRateTable([
  row("2026-10-01", "EUR", 0.9),
  row("2026-10-03", "EUR", 0.92),
  row("2026-10-03", "GBP", 0.8),
]);

describe("lookupRate", () => {
  it("returns the exact row, uncarried", () => {
    expect(lookupRate(table, "EUR", "2026-10-03")).toEqual({ rate: 0.92, asOf: "2026-10-03", carried: false });
  });
  it("carries the nearest EARLIER date forward and flags it", () => {
    expect(lookupRate(table, "EUR", "2026-10-02")).toEqual({ rate: 0.9, asOf: "2026-10-01", carried: true });
    expect(lookupRate(table, "EUR", "2026-12-31")?.asOf).toBe("2026-10-03");
  });
  it("never uses a LATER date", () => {
    expect(lookupRate(table, "EUR", "2026-09-30")).toBeNull();
    expect(lookupRate(table, "GBP", "2026-10-02")).toBeNull();
  });
  it("USD is 1, pegs are constants, unknown currencies are null", () => {
    expect(lookupRate(table, "USD", "2020-01-01")?.rate).toBe(1);
    expect(lookupRate(table, "AED", "2020-01-01")?.rate).toBe(3.6725);
    expect(lookupRate(table, "JOD", "2020-01-01")?.rate).toBe(0.709);
    expect(lookupRate(table, "XYZ", "2026-10-03")).toBeNull();
  });
  it("ignores non-positive rows and keeps the later duplicate", () => {
    const t = buildRateTable([row("2026-10-01", "EUR", 0), row("2026-10-02", "EUR", 1), row("2026-10-02", "EUR", 2)]);
    expect(lookupRate(t, "EUR", "2026-10-01")).toBeNull();
    expect(lookupRate(t, "EUR", "2026-10-02")?.rate).toBe(2);
  });
});

describe("convertOnDate", () => {
  it("converts at the rate of that day, via USD", () => {
    // 100 EUR on 10-01: 100/0.9 USD; to GBP needs a GBP rate (only from 10-03)
    expect(convertOnDate(90, "EUR", "USD", "2026-10-01", table)).toBeCloseTo(100, 8);
    expect(convertOnDate(92, "EUR", "USD", "2026-10-03", table)).toBeCloseTo(100, 8);
    expect(convertOnDate(92, "EUR", "GBP", "2026-10-03", table)).toBeCloseTo(80, 8);
  });
  it("the same amount differs between two dates (history, not today's rate)", () => {
    const a = convertOnDate(100, "USD", "EUR", "2026-10-01", table);
    const b = convertOnDate(100, "USD", "EUR", "2026-10-03", table);
    expect(a).toBeCloseTo(90, 8);
    expect(b).toBeCloseTo(92, 8);
  });
  it("same currency is the identity", () => {
    expect(convertOnDate(123, "EUR", "EUR", "1999-01-01", table)).toBe(123);
  });
  it("falls back to the current rates when a leg has no history", () => {
    const fallback = { EUR: 0.95, GBP: 0.7 };
    expect(convertOnDate(95, "EUR", "GBP", "2026-10-01", table, fallback)).toBeCloseTo(70, 8); // GBP has no history that day: both legs use the current table
    expect(convertOnDate(100, "GBP", "USD", "2020-01-01", table, fallback)).toBeCloseTo(100 / 0.7, 8);
  });
  it("pegged currency works with no rows at all", () => {
    expect(convertOnDate(36.725, "AED", "USD", "2019-05-05", table)).toBeCloseTo(10, 8);
  });
  it("hasHistoryFor reports coverage", () => {
    expect(hasHistoryFor(table, "EUR", "USD", "2026-10-02")).toBe(true);
    expect(hasHistoryFor(table, "EUR", "GBP", "2026-10-02")).toBe(false);
  });
});

describe("gst helpers", () => {
  it("20:00 UTC is midnight of the next GST day", () => {
    expect(gstDate(new Date("2026-10-08T20:00:00Z"))).toBe("2026-10-09");
    expect(gstDate(new Date("2026-10-08T19:59:59Z"))).toBe("2026-10-08");
  });
  it("formats the stamp in GST", () => {
    expect(formatGstStamp("2026-10-08T20:00:03Z")).toBe("09 Oct 00:00 GST");
    expect(formatGstStamp("nope")).toBeNull();
  });
  it("fxCurrencyCodes adds USD and pegs, dedupes and uppercases", () => {
    const codes = fxCurrencyCodes(["eur", "AED", "GBP", "bad1"]);
    expect(codes).toEqual(["AED", "BHD", "EUR", "GBP", "JOD", "OMR", "QAR", "SAR", "USD"]);
  });
});

describe("classifyFxState", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const run = (hoursAgo: number, source = "live") => ({
    ranAt: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
    source,
    currencies: 9,
  });
  it("fresh under 26 h, stale after", () => {
    expect(classifyFxState({ tableAvailable: true, lastRun: run(25.9) }, now)).toBe("fresh");
    expect(classifyFxState({ tableAvailable: true, lastRun: run(26) }, now)).toBe("stale");
    expect(classifyFxState({ tableAvailable: true, lastRun: run(100) }, now)).toBe("stale");
  });
  it("missing without the table or without a run", () => {
    expect(classifyFxState({ tableAvailable: false, lastRun: run(1) }, now)).toBe("missing");
    expect(classifyFxState({ tableAvailable: true, lastRun: null }, now)).toBe("missing");
  });
  it("fallback when the last run used the static table", () => {
    expect(classifyFxState({ tableAvailable: true, lastRun: run(1, "fallback") }, now)).toBe("fallback");
  });
  it("honours a custom config", () => {
    expect(classifyFxState({ tableAvailable: true, lastRun: run(5) }, now, { freshMaxHours: 4 })).toBe("stale");
  });
});

describe("planDailyRows", () => {
  const base = { date: "2026-10-09", currencies: ["USD", "EUR", "AED", "JPY", "XAF", "CHF"] };
  it("uses pegs for pegged, live otherwise, never stores USD", () => {
    const p = planDailyRows({
      ...base,
      live: { EUR: 0.9, AED: 3.67, JPY: 150, XAF: 600, CHF: 0.88 },
      lastKnown: {},
      staticFallback: {},
    });
    expect(p.source).toBe("live");
    expect(p.rows.find((r) => r.currency === "AED")).toMatchObject({ rate_per_usd: 3.6725, source: "peg" });
    expect(p.rows.find((r) => r.currency === "EUR")).toMatchObject({ rate_per_usd: 0.9, source: "live" });
    expect(p.rows.some((r) => r.currency === "USD")).toBe(false);
    expect(p.counts).toEqual({ live: 4, peg: 1, carried: 0, missing: 0 });
  });
  it("a currency the provider lacks is carried from the last known rate, then static, then skipped", () => {
    const p = planDailyRows({
      ...base,
      live: { EUR: 0.9, JPY: 150 },
      lastKnown: { XAF: 610 },
      staticFallback: { CHF: 0.88 },
    });
    expect(p.rows.find((r) => r.currency === "XAF")).toMatchObject({ rate_per_usd: 610, source: "carried" });
    expect(p.rows.find((r) => r.currency === "CHF")).toMatchObject({ rate_per_usd: 0.88, source: "carried" });
    const q = planDailyRows({ ...base, live: { EUR: 0.9 }, lastKnown: {}, staticFallback: {} });
    expect(q.counts.missing).toBe(3);
  });
  it("provider down: source is fallback and nothing is invented", () => {
    const p = planDailyRows({ ...base, live: null, lastKnown: { EUR: 0.91 }, staticFallback: {} });
    expect(p.source).toBe("fallback");
    expect(p.rows.map((r) => r.currency).sort()).toEqual(["AED", "EUR"]);
  });
  it("rejects bad numbers", () => {
    const p = planDailyRows({ ...base, currencies: ["EUR"], live: { EUR: -1 }, lastKnown: { EUR: Number.NaN }, staticFallback: {} });
    expect(p.rows).toHaveLength(0);
  });
});

describe("backfill helpers", () => {
  it("derives per-USD rates from an EUR series", () => {
    const { rows, unsupported } = deriveRowsFromEurSeries(
      { "2026-09-28": { USD: 1.25, GBP: 0.85 }, "2026-09-29": { USD: 1.2, GBP: 0.84 } },
      ["USD", "EUR", "GBP", "AED", "XAF"],
    );
    const gbp = rows.filter((r) => r.currency === "GBP");
    expect(gbp[0].rate_per_usd).toBeCloseTo(0.85 / 1.25, 10);
    expect(rows.find((r) => r.currency === "EUR" && r.rate_date === "2026-09-29")?.rate_per_usd).toBeCloseTo(1 / 1.2, 10);
    expect(rows.some((r) => r.currency === "AED")).toBe(false);
    expect(rows.every((r) => r.source === "ecb")).toBe(true);
    expect(unsupported).toEqual(["XAF"]);
  });
  it("chunks a date range inclusively", () => {
    expect(dateChunks("2026-01-01", "2026-01-10", 4)).toEqual([
      ["2026-01-01", "2026-01-04"],
      ["2026-01-05", "2026-01-08"],
      ["2026-01-09", "2026-01-10"],
    ]);
    expect(dateChunks("2026-02-01", "2026-01-01", 4)).toEqual([]);
  });
});
