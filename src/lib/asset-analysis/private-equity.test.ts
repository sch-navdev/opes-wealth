import { describe, expect, it } from "vitest";
import { EMPTY_PRIVATE_EQUITY_METADATA, type PrivateEquityMetadata } from "@/lib/private-equity";
import { privateEquityAnalysis } from "./private-equity";

// Invented fund: 100,000 commitment; 20,000 paid on 2022-01-01 and 30,000 on 2023-01-01; 10,000 distributed on
// 2024-01-01; 20,000 pending on 2026-01-01 (scheduled) leaving 30,000 not yet scheduled.
const MD: PrivateEquityMetadata = {
  ...EMPTY_PRIVATE_EQUITY_METADATA,
  commitment_amount: 100_000,
  nav_date: "2025-01-01",
  capital_calls: [
    { id: "c1", due_date: "2022-01-01", amount: 20_000, percentage: 20, status: "paid" },
    { id: "c2", due_date: "2023-01-01", amount: 30_000, percentage: 30, status: "paid", paid_date: "2023-01-05" },
    { id: "c3", due_date: "2026-01-01", amount: 20_000, percentage: 20, status: "pending" },
  ],
  distributions: [{ id: "d1", date: "2024-01-01", amount: 10_000, kind: "income" }],
  projected_distributions: [{ id: "p1", due_date: "2030-01-01", amount: 999_999 }],
};

describe("privateEquityAnalysis", () => {
  it("builds the J-curve from actuals only and ignores projected distributions", () => {
    const a = privateEquityAnalysis(MD, 60_000, "2025-06-01");
    expect(a.jCurve).toEqual([
      { date: "2022-01-01", calls: 20_000, distributions: 0, cumulative: -20_000 },
      { date: "2023-01-05", calls: 30_000, distributions: 0, cumulative: -50_000 },
      { date: "2024-01-01", calls: 0, distributions: 10_000, cumulative: -40_000 },
    ]);
    expect(a.trough?.cumulative).toBe(-50_000);
    expect(a.cumulativeWithNav).toBe(20_000); // -40,000 + 60,000
  });

  it("reuses the ledger multiples: paid-in 50,000, DPI 0.2, RVPI 1.2, TVPI 1.4", () => {
    const { ledger } = privateEquityAnalysis(MD, 60_000, "2025-06-01");
    expect(ledger.paidIn).toBe(50_000);
    expect(ledger.dpi).toBeCloseTo(0.2, 10);
    expect(ledger.rvpi).toBeCloseTo(1.2, 10);
    expect(ledger.tvpi).toBeCloseTo(1.4, 10);
    expect(ledger.netIrr).not.toBeNull();
  });

  it("lists the unfunded timeline with the commitment left after each call, and the unscheduled remainder", () => {
    const a = privateEquityAnalysis(MD, 60_000, "2025-06-01");
    expect(a.calledShare).toBeCloseTo(0.5, 10);
    expect(a.unfunded).toEqual([{ callId: "c3", date: "2026-01-01", amount: 20_000, overdue: false, remainingAfter: 30_000 }]);
    expect(a.unscheduled).toBe(30_000);
  });

  it("flags an overdue pending call", () => {
    const a = privateEquityAnalysis(MD, 60_000, "2026-06-01");
    expect(a.unfunded[0].overdue).toBe(true);
  });

  it("copes with an empty fund: no points, null shares", () => {
    const a = privateEquityAnalysis(EMPTY_PRIVATE_EQUITY_METADATA, 0, "2025-06-01");
    expect(a.jCurve).toEqual([]);
    expect(a.trough).toBeNull();
    expect(a.cumulativeWithNav).toBeNull();
    expect(a.calledShare).toBeNull();
    expect(a.unscheduled).toBeNull();
    expect(a.ledger.dpi).toBeNull();
  });
});
