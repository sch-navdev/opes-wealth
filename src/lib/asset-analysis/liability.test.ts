import { describe, expect, it } from "vitest";
import { EMPTY_LIABILITY_METADATA } from "@/lib/liability";
import { liabilityAnalysis } from "./liability";

const md = (over: Partial<typeof EMPTY_LIABILITY_METADATA>) => ({ ...EMPTY_LIABILITY_METADATA, ...over });

describe("liabilityAnalysis", () => {
  it("zero-rate loan: 1,200 at 100 a month ends in 12 months with no interest", () => {
    const a = liabilityAnalysis({ metadata: md({ interest_rate: 0, monthly_payment: 100 }), balance: 1200, history: [], today: "2025-01-31" });
    expect(a.monthsLeft).toBe(12);
    expect(a.payoffDate).toBe("2026-01-31");
    expect(a.interestRemaining).toBe(0);
    expect(a.interestShare).toBe(0);
    expect(a.schedule[0].date).toBe("2025-02-28"); // month ends are clamped
    expect(a.schedule.at(-1)?.balance).toBe(0);
  });

  it("12 % APR, 1,000 owed, 600 a month: 2 payments, first interest 10, second 4.0 (hand-checked)", () => {
    const a = liabilityAnalysis({ metadata: md({ interest_rate: 12, monthly_payment: 600 }), balance: 1000, history: [], today: "2025-01-01" });
    expect(a.monthsLeft).toBe(2);
    // month 1: interest 10, principal 590, balance 410 ; month 2: interest 4.10, payment 414.10
    expect(a.schedule[0]).toMatchObject({ n: 1, payment: 600 });
    expect(a.schedule[0].interest).toBeCloseTo(10, 10);
    expect(a.schedule[0].balance).toBeCloseTo(410, 10);
    expect(a.schedule[1].interest).toBeCloseTo(4.1, 10);
    expect(a.schedule[1].payment).toBeCloseTo(414.1, 10);
    expect(a.interestRemaining).toBeCloseTo(14.1, 10);
    expect(a.interestShare).toBeCloseTo(14.1 / 1014.1, 10);
    expect(a.interestShareNext).toBeCloseTo(10 / 600, 10);
  });

  it("explains why no schedule exists", () => {
    const t = { balance: 1000, history: [], today: "2025-01-01" };
    expect(liabilityAnalysis({ ...t, metadata: md({ interest_rate: 5 }) }).gap).toBe("no_payment");
    expect(liabilityAnalysis({ ...t, metadata: md({ monthly_payment: 100 }) }).gap).toBe("no_rate");
    expect(liabilityAnalysis({ ...t, metadata: md({ interest_rate: 12, monthly_payment: 10 }) }).gap).toBe("never_amortises");
    expect(liabilityAnalysis({ ...t, balance: 0, metadata: md({ interest_rate: 5, monthly_payment: 10 }) }).gap).toBe("no_balance");
  });

  it("estimates interest paid from the first recorded balance, and drops an implausible negative estimate", () => {
    // 6 months at 100 = 600 paid; balance fell from 1,500 to 1,000 (500 principal) -> 100 of interest
    const ok = liabilityAnalysis({ metadata: md({ interest_rate: 5, monthly_payment: 100 }), balance: 1000, history: [{ date: "2025-01-01", value: 1500 }], today: "2025-07-05" });
    expect(ok.interestPaidEstimate).toBe(100);
    const bad = liabilityAnalysis({ metadata: md({ interest_rate: 5, monthly_payment: 100 }), balance: 1000, history: [{ date: "2025-01-01", value: 5000 }], today: "2025-07-05" });
    expect(bad.interestPaidEstimate).toBeNull();
  });

  it("computes a card's utilisation", () => {
    const a = liabilityAnalysis({ metadata: md({ liability_type: "credit_card", credit_limit: 4000 }), balance: 1000, history: [], today: "2025-01-01" });
    expect(a.utilisation).toBeCloseTo(0.25, 10);
  });
});
