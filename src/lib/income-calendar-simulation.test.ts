import { describe, expect, it } from "vitest";
import { expandSimulations, parseSimEntries, type SimEntry } from "./income-calendar-simulation";
import { buildDays } from "./income-calendar-daily";
import { analyseIncomeCalendar } from "./income-calendar-analysis";
import { emptyByKind } from "./income-calendar-liabilities";
import type { IncomeCalendar, IncomeCalendarMonth } from "./income-calendar";

const keys = ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"];
const entry = (over: Partial<SimEntry>): SimEntry => ({ id: "a", label: "Rent", kind: "income", amount: 1000, frequency: "monthly", start: "2026-12", assetName: "Flat", ...over });

describe("expandSimulations", () => {
  it("repeats monthly from the start month until the end month", () => {
    const out = expandSimulations([entry({ end: "2027-02", day: 5 })], keys);
    expect(out.map((m) => m.length)).toEqual([0, 1, 1, 1, 0, 0]);
    expect(out[1][0].date).toBe("2026-12-05");
  });
  it("handles quarterly, yearly and one-off entries", () => {
    expect(expandSimulations([entry({ frequency: "quarterly" })], keys).map((m) => m.length)).toEqual([0, 1, 0, 0, 1, 0]);
    expect(expandSimulations([entry({ frequency: "once", end: "2030-01" })], keys).map((m) => m.length)).toEqual([0, 1, 0, 0, 0, 0]);
    expect(expandSimulations([entry({ frequency: "yearly" })], [...keys, "2027-12"]).map((m) => m.length)).toEqual([0, 1, 0, 0, 0, 0, 1]);
  });
});

describe("parseSimEntries", () => {
  it("keeps valid entries and drops malformed ones", () => {
    const out = parseSimEntries([entry({}), { id: "x" }, null, entry({ id: "b", amount: -5 }), entry({ id: "c", start: "2026-13" })]);
    expect(out.map((e) => e.id)).toEqual(["a"]);
  });
});

const month = (key: string, passive: number, mortgage: number): IncomeCalendarMonth => ({
  month: key,
  total: passive,
  bySource: { rental: passive, stocks: 0, reit: 0, private_equity: 0 },
  items: passive ? [{ assetId: "r", name: "Flat rent", source: "rental", amount: passive, date: `${key}-01`, basis: "contract" }] : [],
  liabilities: { ...emptyByKind(), mortgage },
  liabilityTotal: mortgage,
  liabilityItems: mortgage ? [{ assetId: "m", name: "Home loan", kind: "mortgage", amount: mortgage, date: `${key}-15` }] : [],
});
const cal = (): IncomeCalendar => ({
  months: [month("2026-11", 3000, 4000), month("2026-12", 3000, 4000)],
  annualTotal: 6000,
  monthCount: 2,
  liabilityAnnual: 8000,
  monthlyAverage: 3000,
  peakMonth: "2026-11",
  yieldOnCostPct: null,
  currentYieldPct: null,
  costBasis: 0,
  marketValue: 0,
});

describe("position and simulations in the analysis", () => {
  it("starts from the opening cash and adds what-if income and payments", () => {
    const sims = expandSimulations([entry({ start: "2026-11", amount: 500 }), entry({ id: "p", kind: "payment", start: "2026-12", amount: 200, frequency: "once" })], ["2026-11", "2026-12"]);
    const a = analyseIncomeCalendar(cal(), false, { sims, openingCash: 2000 });
    expect(a.rows.map((r) => r.net)).toEqual([-500, -700]);
    expect(a.rows.map((r) => r.position)).toEqual([1500, 800]);
    expect(a.lowestPosition).toEqual({ month: "2026-12", value: 800 });
    expect(a.endPosition).toBe(800);
    expect(a.simulated).toEqual({ income: 1000, payments: 200 });
  });
});

describe("buildDays", () => {
  it("puts each item on its day and keeps a running position", () => {
    const days = buildDays(cal().months[0], { includeEarned: false, startPosition: 1000, sims: [{ entryId: "a", label: "Bonus", kind: "income", amount: 250, date: "2026-11-20" }] });
    expect(days).toHaveLength(30);
    expect(days[0].inflow).toBe(3000);
    expect(days[14].outflow).toBe(4000);
    expect(days[19].inflow).toBe(250);
    expect(days[0].balance).toBe(4000);
    expect(days[14].balance).toBe(0);
    expect(days[29].balance).toBe(250);
  });
});
