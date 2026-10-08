import { describe, expect, it } from "vitest";
import {
  buildFundLedger,
  buildPortfolioLiquidity,
  scaleFundLedger,
  upcomingCalls,
} from "@/lib/pe-liquidity";
import {
  EMPTY_PRIVATE_EQUITY_METADATA,
  distributedCapital,
  getPrivateEquityMetadataErrors,
  parsePrivateEquityMetadata,
  type PrivateEquityMetadata,
} from "@/lib/private-equity";

const md = (over: Partial<PrivateEquityMetadata>): PrivateEquityMetadata => ({
  ...EMPTY_PRIVATE_EQUITY_METADATA,
  entity_name: "Fund",
  share_class: "A",
  ownership_percentage: 100,
  ...over,
});
const call = (id: string, due: string, amount: number, status: "paid" | "pending", paid_date?: string) => ({
  id,
  due_date: due,
  amount,
  percentage: 0,
  status,
  ...(paid_date ? { paid_date } : {}),
});

describe("parse and validate the actual-distribution ledger", () => {
  it("keeps only well-formed rows, oldest first, capped at 200", () => {
    const raw = {
      distributions: [
        { id: "b", date: "2022-06-01", amount: 5, kind: "gain" },
        { id: "a", date: "2021-01-01", amount: 3, kind: "weird" },
        { date: "bad", amount: 1 },
        { date: "2021-02-02", amount: -4 },
        null,
      ],
    };
    const parsed = parsePrivateEquityMetadata(raw).distributions;
    expect(parsed.map((d) => d.id)).toEqual(["a", "b"]);
    expect(parsed[0].kind).toBe("income");
    const many = { distributions: Array.from({ length: 500 }, (_, i) => ({ date: "2021-01-01", amount: i + 1 })) };
    expect(parsePrivateEquityMetadata(many).distributions).toHaveLength(200);
  });

  it("uses the dated ledger for totals, and the legacy lump only when the ledger is empty", () => {
    expect(distributedCapital(md({ distributions_to_date: 40 }))).toBe(40);
    expect(
      distributedCapital(md({ distributions_to_date: 40, distributions: [{ id: "x", date: "2022-01-01", amount: 10, kind: "gain" }] })),
    ).toBe(10);
  });

  it("flags a bad paid date and a bad actual distribution", () => {
    const bad = md({
      capital_calls: [call("c", "2020-01-01", 10, "paid", "nope")],
      distributions: [{ id: "d", date: "2022-13-xx", amount: 5, kind: "gain" }],
    });
    const errors = getPrivateEquityMetadataErrors(bad);
    expect(errors).toContain("pe_paid_date_invalid");
    expect(errors).toContain("pe_actual_distribution_invalid");
  });
});

describe("buildFundLedger", () => {
  const fund = md({
    commitment_amount: 200,
    capital_calls: [call("c1", "2020-01-01", 100, "paid"), call("c2", "2023-01-01", 50, "pending")],
    distributions: [{ id: "d1", date: "2022-01-01", amount: 150, kind: "gain" }],
  });

  it("computes unfunded, DPI, RVPI and TVPI from the actuals", () => {
    const l = buildFundLedger(fund, 50, "2024-01-01");
    expect(l.paidIn).toBe(100);
    expect(l.unfunded).toBe(100);
    expect(l.dpi).toBeCloseTo(1.5, 10);
    expect(l.rvpi).toBeCloseTo(0.5, 10);
    expect(l.tvpi).toBeCloseTo(2, 10);
    expect(l.tvpi).toBeCloseTo((l.dpi ?? 0) + (l.rvpi ?? 0), 10);
  });

  it("gives the exact net IRR for a simple two-flow fund (100 out, 150 back two years later)", () => {
    const l = buildFundLedger(
      md({
        capital_calls: [call("c1", "2020-01-01", 100, "paid")],
        distributions: [{ id: "d", date: "2021-12-31", amount: 150, kind: "gain" }],
      }),
      0,
      "2024-01-01",
    );
    expect(l.netIrr).toBeCloseTo(Math.sqrt(1.5) - 1, 6);
    expect(l.netIrrGap).toBeNull();
  });

  it("uses the paid date rather than the due date for a paid call", () => {
    const dist = [{ id: "d", date: "2022-01-01", amount: 150, kind: "gain" as const }];
    const early = buildFundLedger(md({ capital_calls: [call("c", "2020-01-01", 100, "paid")], distributions: dist }), 0, "2024-01-01");
    const late = buildFundLedger(md({ capital_calls: [call("c", "2020-01-01", 100, "paid", "2021-01-01")], distributions: dist }), 0, "2024-01-01");
    expect(late.netIrr!).toBeGreaterThan(early.netIrr!);
  });

  it("has no ratios and no IRR when nothing is paid in", () => {
    const l = buildFundLedger(md({ commitment_amount: 100 }), 0, "2024-01-01");
    expect([l.dpi, l.rvpi, l.tvpi, l.netIrr]).toEqual([null, null, null, null]);
    expect(l.netIrrGap).toBe("no_paid_in");
    expect(l.unfunded).toBe(100);
  });

  it("never guesses an IRR from undated flows (manual called capital, or a legacy lump)", () => {
    const manual = buildFundLedger(md({ called_capital_manual: 100, distributions_to_date: 20 }), 90, "2024-01-01");
    expect(manual.dpi).toBeCloseTo(0.2, 10);
    expect(manual.netIrr).toBeNull();
    expect(manual.netIrrGap).toBe("undated_flows");
    const lump = buildFundLedger(md({ capital_calls: [call("c", "2020-01-01", 100, "paid")], distributions_to_date: 30 }), 90, "2024-01-01");
    expect(lump.netIrrGap).toBe("undated_flows");
  });

  it("reports no solution when the flows never change sign", () => {
    const l = buildFundLedger(md({ capital_calls: [call("c", "2020-01-01", 100, "paid")] }), 0, "2024-01-01");
    expect(l.netIrr).toBeNull();
    expect(l.netIrrGap).toBe("no_solution");
  });

  it("puts the NAV last as a terminal value", () => {
    const l = buildFundLedger(md({ nav_date: "2024-03-01", capital_calls: [call("c", "2020-01-01", 100, "paid")] }), 130, "2024-06-01");
    expect(l.flows.at(-1)).toEqual({ date: "2024-03-01", amount: 130 });
    expect(l.netIrr!).toBeGreaterThan(0);
  });
});

describe("portfolio roll-up", () => {
  const dist = (amount: number) => [{ id: "d", date: "2022-01-01", amount, kind: "gain" as const }];
  const a = buildFundLedger(md({ commitment_amount: 100, capital_calls: [call("c", "2020-01-01", 100, "paid")], distributions: dist(50) }), 100, "2024-01-01");
  const b = buildFundLedger(md({ commitment_amount: 900, capital_calls: [call("c", "2020-01-01", 900, "paid")], distributions: dist(90) }), 900, "2024-01-01");

  it("weights ratios by paid-in capital instead of averaging them", () => {
    const p = buildPortfolioLiquidity([a, b]);
    expect(p.paidIn).toBe(1000);
    expect(p.dpi).toBeCloseTo(0.14, 10);
    expect(p.tvpi).toBeCloseTo(1.14, 10);
    // the simple average of the two DPIs (0.5 and 0.1) would be 0.3
    expect(p.dpi).not.toBeCloseTo(0.3, 2);
    expect(p.netIrr).not.toBeNull();
    expect(p.funds).toBe(2);
  });

  it("scales money but not ratios, and counts funds left out of the pooled IRR", () => {
    const s = scaleFundLedger(a, 2);
    expect(s.paidIn).toBe(200);
    expect(s.dpi).toBe(a.dpi);
    const undated = buildFundLedger(md({ called_capital_manual: 50 }), 40, "2024-01-01");
    const p = buildPortfolioLiquidity([a, undated]);
    expect(p.undatedFunds).toBe(1);
  });

  it("is empty-safe", () => {
    const p = buildPortfolioLiquidity([]);
    expect([p.dpi, p.tvpi, p.netIrr]).toEqual([null, null, null]);
  });
});

describe("upcomingCalls", () => {
  const funds = [
    {
      assetId: "1",
      name: "Alpha",
      md: md({ capital_calls: [call("a", "2026-12-01", 10, "pending"), call("b", "2026-09-01", 5, "pending"), call("c", "2025-01-01", 7, "paid")] }),
    },
    { assetId: "2", name: "Beta", md: md({ capital_calls: [call("d", "2028-01-01", 9, "pending")] }) },
  ];
  it("lists pending calls within the horizon plus overdue ones, earliest first, ignoring paid ones", () => {
    const list = upcomingCalls(funds, "2026-10-08", 365);
    expect(list.map((c) => c.callId)).toEqual(["b", "a"]);
    expect(list[0].overdue).toBe(true);
    expect(list[1].overdue).toBe(false);
  });
  it("is empty for an invalid today", () => {
    expect(upcomingCalls(funds, "nope")).toEqual([]);
  });
});
