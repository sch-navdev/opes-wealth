import { describe, expect, it } from "vitest";
import {
  EMPTY_SCPI_METADATA,
  SCPI_MAX_INDICATORS,
  SCPI_MAX_REVALORISATIONS,
  isIndicatorStale,
  parseScpiMetadata,
  scpiCurrentSubscriptionPrice,
  scpiEnjoymentDelayMonths,
  scpiIndicatorHistory,
  scpiLatestIndicators,
  scpiQuarterRates,
  scpiRevalorisationSteps,
  scpiSaleVsPurchase,
  scpiTotalRevalorisationPct,
  scpiYearSummaries,
  validateScpiExtras,
  type ScpiDividend,
  type ScpiMetadata,
} from "@/lib/scpi";

// Invented figures only.
const meta = (over: Partial<ScpiMetadata> = {}): ScpiMetadata => ({
  ...EMPTY_SCPI_METADATA,
  subscription_price: 200,
  entry_fee_pct: 10,
  ...over,
});

const div = (date: string, amount: number, quarter = "", exceptional = false): ScpiDividend => ({
  id: `d-${date}`,
  date,
  amount,
  status: "received",
  quarter,
  exceptional,
});

describe("parseScpiMetadata (versioned, backwards compatible)", () => {
  it("reads a legacy row (no new fields) with defaults and keeps its values", () => {
    const legacy = {
      management_company: "Test Gestion",
      holding_mode: "nue_propriete",
      subscription_price: 150,
      dividends: [{ id: "a", date: "2024-04-15", amount: 10, status: "received", quarter: "T1 2024" }],
    };
    const p = parseScpiMetadata(legacy);
    expect(p.management_company).toBe("Test Gestion");
    expect(p.holding_mode).toBe("nue_propriete");
    expect(p.subscription_price).toBe(150);
    expect(p.revalorisations).toEqual([]);
    expect(p.indicators).toEqual([]);
    expect(p.name_source).toBe("");
    expect(p.schema_version).toBe(2);
    expect(p.dividends).toHaveLength(1);
  });

  it("never throws on garbage and repairs the new lists", () => {
    for (const raw of [undefined, 3, "x", [], [1], { revalorisations: "no", indicators: 5 }]) {
      expect(() => parseScpiMetadata(raw)).not.toThrow();
    }
    const p = parseScpiMetadata({
      revalorisations: [null, 4, { price: "x", date: 3 }, { id: "r", price: 210, date: "2025-01-01" }],
      indicators: [{ as_of: "2025-12-31", vdrec: -5, vdrea: "x", source_note: 7 }, "bad"],
      name_source: "weird",
      register_numbers: 12,
    });
    expect(p.revalorisations).toHaveLength(2); // null and 4 are not rows
    expect(p.revalorisations[0]).toMatchObject({ price: 0, date: "" });
    expect(p.indicators).toHaveLength(1);
    expect(p.indicators[0]).toMatchObject({ vdrec: null, vdrea: null, source_note: "" });
    expect(p.name_source).toBe("");
    expect(p.register_numbers).toBe("");
  });

  it("caps the number of rows", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, price: 1, date: "2025-01-01" }));
    const p = parseScpiMetadata({ revalorisations: many, indicators: many.map((m) => ({ ...m, as_of: m.date, vdrec: 1 })) });
    expect(p.revalorisations).toHaveLength(SCPI_MAX_REVALORISATIONS);
    expect(p.indicators).toHaveLength(SCPI_MAX_INDICATORS);
  });
});

describe("enjoyment delay (30.5 rule)", () => {
  it("(jouissance - subscription) / 30.5 months, one decimal", () => {
    expect(scpiEnjoymentDelayMonths("2024-01-01", "2024-04-01")).toBe(3); // 91 days / 30.5 = 2.98
    expect(scpiEnjoymentDelayMonths("2024-01-01", "2024-01-01")).toBe(0);
    expect(scpiEnjoymentDelayMonths("2024-01-01", "2024-07-01")).toBe(6); // 182 / 30.5 = 5.97
    expect(scpiEnjoymentDelayMonths("2024-01-01", "2024-02-16")).toBe(1.5); // 46 / 30.5
  });
  it("null for missing, invalid or reversed dates", () => {
    expect(scpiEnjoymentDelayMonths("", "2024-04-01")).toBeNull();
    expect(scpiEnjoymentDelayMonths("2024-13-40", "2024-04-01")).toBeNull();
    expect(scpiEnjoymentDelayMonths("2024-05-01", "2024-04-01")).toBeNull();
  });
});

describe("revalorisations", () => {
  const m = meta({
    revalorisations: [
      { id: "b", price: 220, date: "2024-06-01" },
      { id: "a", price: 210, date: "2023-06-01" },
      { id: "bad", price: 0, date: "2025-01-01" },
      { id: "bad2", price: 5, date: "nope" },
    ],
  });
  it("sorts by date, ignores invalid rows and chains the % from the previous price", () => {
    const steps = scpiRevalorisationSteps(m);
    expect(steps.map((s) => s.id)).toEqual(["a", "b"]);
    expect(steps[0].changePct).toBeCloseTo(5, 10);
    expect(steps[1].changePct).toBeCloseTo((10 / 210) * 100, 10);
    expect(steps[1].previousPrice).toBe(210);
  });
  it("total vs subscription price and the current subscription price (MDS)", () => {
    expect(scpiTotalRevalorisationPct(m)).toBeCloseTo(10, 10);
    expect(scpiCurrentSubscriptionPrice(m)).toBe(220);
    expect(scpiCurrentSubscriptionPrice(meta())).toBe(200);
    expect(scpiTotalRevalorisationPct(meta())).toBeNull();
    expect(scpiCurrentSubscriptionPrice(meta({ subscription_price: null }))).toBeNull();
  });
  it("a decrease is a negative step", () => {
    const down = meta({ revalorisations: [{ id: "d", price: 180, date: "2024-01-01" }] });
    expect(scpiRevalorisationSteps(down)[0].changePct).toBeCloseTo(-10, 10);
  });
});

describe("sale minus purchase", () => {
  it("withdrawal value minus price, per share, percent and total", () => {
    const r = scpiSaleVsPurchase(meta({ withdrawal_value: 190 }), 10);
    expect(r).toEqual({ perShare: -10, pct: -5, total: -100 });
  });
  it("uses the derived withdrawal value; null without data", () => {
    expect(scpiSaleVsPurchase(meta(), 5)?.perShare).toBeCloseTo(-20, 10);
    expect(scpiSaleVsPurchase(meta({ subscription_price: null }), 5)).toBeNull();
    expect(scpiSaleVsPurchase(meta(), 0)).toBeNull();
  });
});

describe("indicators", () => {
  const m = meta({
    withdrawal_value: 180,
    revalorisations: [{ id: "a", price: 250, date: "2024-06-01" }],
    indicators: [
      { id: "1", as_of: "2023-12-31", vdrec: 240, vdrea: 200, source_note: "old" },
      { id: "2", as_of: "2024-12-31", vdrec: 275, vdrea: 171, source_note: "report" },
      { id: "x", as_of: "bad", vdrec: 1, vdrea: 1, source_note: "" },
      { id: "empty", as_of: "2025-06-30", vdrec: null, vdrea: null, source_note: "" },
    ],
  });
  it("history is newest first and drops rows without a date or a value", () => {
    expect(scpiIndicatorHistory(m).map((i) => i.id)).toEqual(["2", "1"]);
  });
  it("ratios at the latest date: VDRec / MDS and VDRea / PDR, with a neutral reading", () => {
    const r = scpiLatestIndicators(m)!;
    expect(r.asOf).toBe("2024-12-31");
    expect(r.mds).toBe(250);
    expect(r.pdr).toBe(180);
    expect(r.vdrecRatioPct).toBeCloseTo(110, 10);
    expect(r.vdreaRatioPct).toBeCloseTo((171 / 180) * 100, 10);
    expect(r.vdrecReading).toBe("above");
    expect(r.vdreaReading).toBe("below");
  });
  it("equal reads as equal; missing sides stay null", () => {
    const r = scpiLatestIndicators(
      meta({ withdrawal_value: 180, indicators: [{ id: "1", as_of: "2025-01-01", vdrec: 200, vdrea: null, source_note: "" }] }),
    )!;
    expect(r.vdrecReading).toBe("equal");
    expect(r.vdreaRatioPct).toBeNull();
    expect(r.vdreaReading).toBeNull();
  });
  it("null without indicators", () => {
    expect(scpiLatestIndicators(meta())).toBeNull();
  });
  it("stale means older than 12 months", () => {
    expect(isIndicatorStale("2025-10-09", "2026-10-09")).toBe(false);
    expect(isIndicatorStale("2025-10-08", "2026-10-09")).toBe(true);
    expect(isIndicatorStale("junk", "2026-10-09")).toBe(true);
  });
});

describe("distribution rates from the dividend ledger", () => {
  const m = meta({
    dividends: [
      div("2025-01-15", 100, "T4 2024"),
      div("2025-04-15", 100, "T1 2025"),
      div("2025-07-15", 100, "T2 2025"),
      div("2025-10-15", 150, "T3 2025", true),
      { ...div("2026-01-15", 100, "T4 2025"), status: "expected" },
    ],
  });
  it("quarter rate = amount / subscription amount x 4 (invested 10 000)", () => {
    const q = scpiQuarterRates(m, 50);
    expect(q[0].quarter).toBe("T4 2025"); // newest first, expected included
    const t1 = q.find((x) => x.quarter === "T1 2025")!;
    expect(t1.ratePct).toBeCloseTo(4, 10);
    expect(q.find((x) => x.quarter === "T3 2025")?.exceptional).toBe(true);
  });
  it("year totals follow the quarter label, count received only and split the exceptional part", () => {
    const y = scpiYearSummaries(m, 50);
    expect(y.map((r) => r.year)).toEqual([2025, 2024]);
    const y2025 = y[0];
    expect(y2025.total).toBe(350);
    expect(y2025.exceptionalTotal).toBe(150);
    expect(y2025.ratePct).toBeCloseTo(3.5, 10);
    expect(y2025.ordinaryRatePct).toBeCloseTo(2, 10);
    expect(y[1].total).toBe(100);
  });
  it("rates are null without a subscription basis; year falls back to the payment date", () => {
    const noBasis = meta({ subscription_price: null, dividends: [div("2025-04-15", 10)] });
    expect(scpiQuarterRates(noBasis, 5)[0].ratePct).toBeNull();
    expect(scpiYearSummaries(noBasis, 5)[0]).toMatchObject({ year: 2025, total: 10, ratePct: null });
  });
});

describe("validateScpiExtras", () => {
  it("fine for an untouched or complete record", () => {
    expect(validateScpiExtras(meta())).toEqual([]);
    expect(
      validateScpiExtras(
        meta({
          subscription_date: "2024-01-01",
          jouissance_date: "2024-04-01",
          revalorisations: [{ id: "a", price: 210, date: "2025-01-01" }],
          indicators: [{ id: "i", as_of: "2025-12-31", vdrec: 1, vdrea: null, source_note: "" }],
        }),
      ),
    ).toEqual([]);
  });
  it("reports each problem once, with a code and a message", () => {
    const issues = validateScpiExtras(
      meta({
        subscription_date: "2024-13-01",
        jouissance_date: "2024-01-01",
        revalorisations: [
          { id: "a", price: 0, date: "2025-01-01" },
          { id: "b", price: 5, date: "" },
        ],
        indicators: [{ id: "i", as_of: "2025-12-31", vdrec: null, vdrea: null, source_note: "" }],
        register_numbers: "x".repeat(501),
      }),
    );
    expect(issues.map((i) => i.code)).toEqual([
      "scpi2_err_subscription_date",
      "scpi2_err_revalorisation_invalid",
      "scpi2_err_indicator_invalid",
      "scpi2_err_register_too_long",
    ]);
    for (const i of issues) expect(i.message.length).toBeGreaterThan(5);
  });
  it("income before subscription is rejected", () => {
    expect(
      validateScpiExtras(meta({ subscription_date: "2024-05-01", jouissance_date: "2024-04-01" })).map((i) => i.code),
    ).toEqual(["scpi2_err_jouissance_before_subscription"]);
  });
  it("row caps", () => {
    const rows = Array.from({ length: SCPI_MAX_REVALORISATIONS + 1 }, (_, i) => ({ id: `r${i}`, price: 1, date: "2025-01-01" }));
    expect(validateScpiExtras(meta({ revalorisations: rows })).map((i) => i.code)).toContain("scpi2_err_revalorisations_too_many");
  });
});
