import { describe, expect, it } from "vitest";
import { EMPTY_REAL_ESTATE_METADATA, type RealEstateMetadata } from "@/lib/real-estate";
import { realEstateExtras } from "./real-estate";

// Invented fixture: bought for 1,000,000 + 50,000 of fees, rented at 60,000 a year, 40,000 of expenses logged
// in the last year, no loan.
const MD: RealEstateMetadata = {
  ...EMPTY_REAL_ESTATE_METADATA,
  contract_price: 1_000_000,
  agencyFees: 50_000,
  tenancy_contracts: [
    { id: "t1", tenant_name: "A", start_date: "2024-01-01", end_date: "2024-12-31", annual_rent: 50_000, contract_value: null, imported_from_file: "", uploaded_at: "" },
    { id: "t2", tenant_name: "B", start_date: "2025-01-01", end_date: "2025-12-31", annual_rent: 60_000, contract_value: null, imported_from_file: "", uploaded_at: "" },
  ],
  property_expenses: [
    { id: "e1", description: "AC", date: "2025-03-01", amount: 10_000 },
    { id: "e2", description: "Fees", date: "2024-02-01", amount: 99_999 }, // older than 12 months
    { id: "e3", description: "Paint", date: "2025-05-01", amount: 6_000 },
  ],
};

describe("realEstateExtras", () => {
  it("computes yields on cost from the contract in force and the last 12 months of expenses", () => {
    const r = realEstateExtras({ metadata: MD, marketValue: 1_200_000, history: [], today: "2025-06-30" });
    expect(r.annualRent).toBe(60_000);
    expect(r.expenses12m).toBe(16_000);
    expect(r.totalCost).toBeGreaterThanOrEqual(1_000_000);
    expect(r.grossYieldOnCost).toBeCloseTo(60_000 / r.totalCost, 10);
    expect(r.netYieldOnCost).toBeCloseTo(44_000 / r.totalCost, 10);
    expect(r.yieldOnValue).toBeCloseTo(0.05, 10);
    expect(r.hasLoan).toBe(false);
    expect(r.ltvNow).toBeNull();
    expect(r.equityNow).toBe(1_200_000);
  });

  it("has no yield without an active contract", () => {
    const r = realEstateExtras({ metadata: { ...MD, tenancy_contracts: [] }, marketValue: 1_200_000, history: [], today: "2025-06-30" });
    expect(r.annualRent).toBeNull();
    expect(r.grossYieldOnCost).toBeNull();
    expect(r.yieldOnValue).toBeNull();
  });

  it("tracks equity and LTV through time from the loan schedule", () => {
    // Interest-free loan of 120,000 over 120 months from 2024-01-01: 1,000 of principal per month.
    const md: RealEstateMetadata = {
      ...MD,
      linked_loan: { ...MD.linked_loan, amount: 120_000, interest_rate: 0, duration_months: 120, start_date: "2024-01-01", monthly_payment: 1000, outstanding_principal: null },
    };
    const r = realEstateExtras({
      metadata: md,
      marketValue: 1_100_000,
      history: [
        { recorded_date: "2024-01-01", value: 1_000_000 },
        { recorded_date: "2025-01-01", value: 1_100_000 },
      ],
      today: "2025-01-01",
    });
    expect(r.hasLoan).toBe(true);
    expect(r.series[0]).toMatchObject({ market: 1_000_000, loan: 120_000, equity: 880_000 });
    expect(r.series[0].ltv).toBeCloseTo(0.12, 10);
    expect(r.series[1].loan).toBe(108_000); // 12 payments of 1,000
    expect(r.equityNow).toBe(1_100_000 - 108_000);
    expect(r.ltvNow).toBeCloseTo(108_000 / 1_100_000, 10);
    expect(r.equityBuildUp).toBe(992_000 - 880_000);
  });
});
