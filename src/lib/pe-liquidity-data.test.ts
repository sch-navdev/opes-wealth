import { describe, expect, it } from "vitest";
import { buildPeLiquidityData, type PeLiquidityAssetInput } from "@/lib/pe-liquidity-data";

const TODAY = "2025-01-15";
const asset = (
  id: string,
  name: string,
  currency: string,
  value: number,
  metadata: Record<string, unknown> | null,
  category = "Private Equity",
): PeLiquidityAssetInput => ({
  id,
  name,
  currency,
  current_value: value,
  is_liability: false,
  metadata,
  asset_categories: { name: category },
});
const call = (id: string, due: string, amount: number, status: "paid" | "pending", paid?: string) => ({
  id,
  due_date: due,
  paid_date: paid,
  amount,
  percentage: 0,
  status,
});

const fundA = asset("a", "Invented Fund A", "EUR", 50, {
  commitment_amount: 200,
  nav_date: "2024-12-31",
  capital_calls: [
    call("a1", "2020-01-01", 100, "paid", "2020-01-10"),
    call("a2", "2025-03-01", 50, "pending"),
    call("a3", "2024-11-01", 25, "pending"),
    call("a4", "2027-01-01", 25, "pending"),
  ],
  distributions: [{ id: "d", date: "2023-01-01", amount: 150, kind: "gain" }],
});
const fundB = asset("b", "Invented Fund B (undated)", "USD", 10, { commitment_amount: 100, called_capital_manual: 40, distributions_to_date: 5 });
const empty = asset("c", "Invented Fund C", "USD", 0, { commitment_amount: null });
// 1 USD = 0.5 EUR, so 1 EUR = 2 USD
const RATES = { USD: 1, EUR: 0.5 };

describe("buildPeLiquidityData", () => {
  const data = buildPeLiquidityData([fundA, fundB, empty, asset("x", "Not PE", "USD", 1, null, "Cash")], "USD", RATES, TODAY);

  it("builds one row per private equity fund, in the base currency", () => {
    expect(data.rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    const a = data.rows[0];
    expect(a.paidIn).toBeCloseTo(200); // 100 EUR
    expect(a.unfunded).toBeCloseTo(200); // (200 - 100) EUR
    expect(a.nav).toBeCloseTo(100);
    expect(a.distributed).toBeCloseTo(300);
    expect(a.dpi).toBeCloseTo(1.5);
    expect(a.rvpi).toBeCloseTo(0.5);
    expect(a.tvpi).toBeCloseTo(2);
    expect(a.netIrr).not.toBeNull();
    expect(a.irrGap).toBeNull();
  });

  it("gives a null IRR with a reason for undated flows, and never 0 or NaN for missing data", () => {
    const b = data.rows[1];
    expect(b.netIrr).toBeNull();
    expect(b.irrGap).toBe("undated_flows");
    const c = data.rows[2];
    expect(c).toMatchObject({ paidIn: null, unfunded: null, nav: null, distributed: null, dpi: null, rvpi: null, tvpi: null, netIrr: null, irrGap: "no_paid_in" });
    for (const r of data.rows) for (const v of Object.values(r)) if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
  });

  it("rolls up from summed amounts and counts undated funds", () => {
    expect(data.portfolio.paidIn).toBeCloseTo(240);
    expect(data.portfolio.distributed).toBeCloseTo(305);
    expect(data.portfolio.tvpi).toBeCloseTo((305 + 110) / 240);
    expect(data.portfolio.undatedFunds).toBe(1);
    expect(data.portfolio.netIrr).not.toBeNull();
  });

  it("lists pending calls in the next 12 months plus overdue ones, converted to the base currency", () => {
    expect(data.today).toBe(TODAY);
    // a4 is beyond 12 months
    expect(data.upcoming.map((c) => [c.callId, c.overdue])).toEqual([
      ["a3", true],
      ["a2", false],
    ]);
    expect(data.upcoming[1].amount).toBeCloseTo(100);
    expect(data.upcomingTotal).toBeCloseTo(50 + 100);
  });

  it("returns empty, null-filled data with no funds", () => {
    const none = buildPeLiquidityData([], "USD", RATES, TODAY);
    expect(none.rows).toEqual([]);
    expect(none.portfolio).toMatchObject({ paidIn: null, unfunded: null, nav: null, distributed: null, dpi: null, tvpi: null, netIrr: null });
    expect(none.upcoming).toEqual([]);
  });
});
