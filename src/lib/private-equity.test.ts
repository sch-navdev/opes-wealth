import { describe, expect, it } from "vitest";
import {
  EMPTY_PRIVATE_EQUITY_METADATA,
  calledCapital,
  cumulativeCashFlowSeries,
  fundReturns,
  generateCapitalCalls,
  generateProjectedDistributions,
  getPrivateEquityMetadataErrors,
  isOverdue,
  parsePrivateEquityMetadata,
  pendingCapitalCallsTotal,
  projectedCashFlows,
  unfundedCommitment,
  type CapitalCall,
  type PrivateEquityMetadata,
  type ProjectedDistribution,
} from "@/lib/private-equity";

const call = (due_date: string, amount: number, status: CapitalCall["status"] = "paid"): CapitalCall => ({
  id: `c-${due_date}`,
  due_date,
  amount,
  percentage: 0,
  status,
});
const dist = (due_date: string, amount: number): ProjectedDistribution => ({ id: `d-${due_date}`, due_date, amount });

const meta = (over: Partial<PrivateEquityMetadata> = {}): PrivateEquityMetadata => ({
  ...EMPTY_PRIVATE_EQUITY_METADATA,
  entity_name: "Fund I",
  share_class: "A",
  ownership_percentage: 10,
  ...over,
});

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("parsePrivateEquityMetadata", () => {
  it("returns the defaults for null / non-objects", () => {
    expect(parsePrivateEquityMetadata(null)).toEqual(EMPTY_PRIVATE_EQUITY_METADATA);
    expect(parsePrivateEquityMetadata(5)).toEqual(EMPTY_PRIVATE_EQUITY_METADATA);
  });

  it("older rows without lifecycle fields get the defaults", () => {
    const p = parsePrivateEquityMetadata({ entity_name: "Old Fund", commitment_amount: 1000 });
    expect(p.entity_name).toBe("Old Fund");
    expect(p.commitment_amount).toBe(1000);
    expect(p.lifecycle_stage).toBe("investment_period");
    expect(p.count_unfunded_as_liability).toBe(true);
    expect(p.projection_mode).toBe("model");
  });

  it("repairs non-array capital_calls / projected_distributions", () => {
    const p = parsePrivateEquityMetadata({ capital_calls: "x", projected_distributions: {} });
    expect(p.capital_calls).toEqual([]);
    expect(p.projected_distributions).toEqual([]);
  });
});

describe("getPrivateEquityMetadataErrors", () => {
  it("no errors for a minimal valid record", () => {
    expect(getPrivateEquityMetadataErrors(meta())).toEqual([]);
  });

  it("requires entity name and share class", () => {
    expect(getPrivateEquityMetadataErrors(meta({ entity_name: " " }))).toContain("entity_name_required");
    expect(getPrivateEquityMetadataErrors(meta({ share_class: "" }))).toContain("share_class_required");
  });

  it("ownership percentage: required, then 0..100 inclusive", () => {
    expect(getPrivateEquityMetadataErrors(meta({ ownership_percentage: null }))).toContain("ownership_percentage_required");
    expect(getPrivateEquityMetadataErrors(meta({ ownership_percentage: NaN }))).toContain("ownership_percentage_required");
    expect(getPrivateEquityMetadataErrors(meta({ ownership_percentage: -1 }))).toContain("ownership_percentage_range");
    expect(getPrivateEquityMetadataErrors(meta({ ownership_percentage: 100.5 }))).toContain("ownership_percentage_range");
    expect(getPrivateEquityMetadataErrors(meta({ ownership_percentage: 0 }))).toEqual([]);
    expect(getPrivateEquityMetadataErrors(meta({ ownership_percentage: 100 }))).toEqual([]);
  });

  it("negative commitment is invalid; zero or null is not", () => {
    expect(getPrivateEquityMetadataErrors(meta({ commitment_amount: -1 }))).toContain("pe_commitment_invalid");
    expect(getPrivateEquityMetadataErrors(meta({ commitment_amount: 0 }))).toEqual([]);
    expect(getPrivateEquityMetadataErrors(meta({ commitment_amount: null }))).toEqual([]);
  });

  it("scheduled calls may not exceed the commitment (beyond a 1-cent rounding allowance)", () => {
    const calls = [call("2024-01-01", 60), call("2024-07-01", 40.005, "pending")];
    expect(getPrivateEquityMetadataErrors(meta({ commitment_amount: 100, capital_calls: calls }))).toEqual([]);
    const over = [call("2024-01-01", 60), call("2024-07-01", 40.5, "pending")];
    expect(getPrivateEquityMetadataErrors(meta({ commitment_amount: 100, capital_calls: over }))).toContain("pe_calls_exceed_commitment");
  });

  it("every call and distribution needs a date and a positive amount", () => {
    expect(getPrivateEquityMetadataErrors(meta({ capital_calls: [call("", 10)] }))).toContain("pe_call_invalid");
    expect(getPrivateEquityMetadataErrors(meta({ capital_calls: [call("2024-01-01", 0)] }))).toContain("pe_call_invalid");
    expect(getPrivateEquityMetadataErrors(meta({ projected_distributions: [dist("2030-01-01", -5)] }))).toContain("pe_distribution_invalid");
    expect(getPrivateEquityMetadataErrors(meta({ projected_distributions: [dist("", 5)] }))).toContain("pe_distribution_invalid");
  });

  it("expected multiple must be positive when given", () => {
    expect(getPrivateEquityMetadataErrors(meta({ expected_multiple: 0 }))).toContain("pe_multiple_invalid");
    expect(getPrivateEquityMetadataErrors(meta({ expected_multiple: -1.5 }))).toContain("pe_multiple_invalid");
    expect(getPrivateEquityMetadataErrors(meta({ expected_multiple: 1.8 }))).toEqual([]);
  });
});

describe("calledCapital / unfundedCommitment / pendingCapitalCallsTotal", () => {
  const calls = [call("2024-01-01", 20000), call("2024-07-01", 20000), call("2025-01-01", 20000, "pending"), call("2025-07-01", 40000, "pending")];

  it("called capital = paid calls only", () => {
    expect(calledCapital(meta({ capital_calls: calls }))).toBe(40000);
  });

  it("with no schedule, called capital is the manual figure (or 0)", () => {
    expect(calledCapital(meta({ called_capital_manual: 12345 }))).toBe(12345);
    expect(calledCapital(meta())).toBe(0);
  });

  it("a schedule wins over the manual figure", () => {
    expect(calledCapital(meta({ capital_calls: calls, called_capital_manual: 999999 }))).toBe(40000);
  });

  it("unfunded = commitment - called, never negative", () => {
    expect(unfundedCommitment(meta({ commitment_amount: 100000, capital_calls: calls }))).toBe(60000);
    expect(unfundedCommitment(meta({ commitment_amount: 100000, called_capital_manual: 30000 }))).toBe(70000);
    expect(unfundedCommitment(meta({ commitment_amount: 10000, called_capital_manual: 30000 }))).toBe(0);
  });

  it("unfunded without a commitment falls back to the pending calls", () => {
    expect(unfundedCommitment(meta({ commitment_amount: null, capital_calls: calls }))).toBe(60000);
    expect(unfundedCommitment(meta({ commitment_amount: null }))).toBe(0);
  });

  it("paid + unfunded = commitment when the schedule is complete", () => {
    const m = meta({ commitment_amount: 100000, capital_calls: calls });
    expect(calledCapital(m) + unfundedCommitment(m)).toBe(100000);
  });

  it("liability = pending calls, or 0 when the fund opts out", () => {
    expect(pendingCapitalCallsTotal(meta({ capital_calls: calls }))).toBe(60000);
    expect(pendingCapitalCallsTotal(meta({ capital_calls: calls, count_unfunded_as_liability: false }))).toBe(0);
  });

  it("an unscheduled commitment is not a liability", () => {
    expect(pendingCapitalCallsTotal(meta({ commitment_amount: 100000 }))).toBe(0);
  });
});

describe("isOverdue", () => {
  it("only pending calls strictly before today are overdue", () => {
    expect(isOverdue(call("2024-01-01", 1, "pending"), "2024-06-01")).toBe(true);
    expect(isOverdue(call("2024-06-01", 1, "pending"), "2024-06-01")).toBe(false);
    expect(isOverdue(call("2024-07-01", 1, "pending"), "2024-06-01")).toBe(false);
    expect(isOverdue(call("2024-01-01", 1, "paid"), "2024-06-01")).toBe(false);
  });
});

describe("generateCapitalCalls", () => {
  const base = { commitment: 100000, percentPerCall: 20, firstDate: "2024-03-31", intervalMonths: 6, today: "2025-01-01" };

  it("20% semi-annual from 31 March: 5 calls anchored on month ends", () => {
    const calls = generateCapitalCalls(base);
    expect(calls.map((c) => c.due_date)).toEqual(["2024-03-31", "2024-09-30", "2025-03-31", "2025-09-30", "2026-03-31"]);
    expect(calls.map((c) => c.amount)).toEqual([20000, 20000, 20000, 20000, 20000]);
    expect(calls.every((c) => c.percentage === 20)).toBe(true);
  });

  it("calls dated on or before today are paid, later ones pending", () => {
    const calls = generateCapitalCalls(base);
    expect(calls.map((c) => c.status)).toEqual(["paid", "paid", "pending", "pending", "pending"]);
    const onToday = generateCapitalCalls({ ...base, today: "2024-09-30" });
    expect(onToday[1].status).toBe("paid"); // boundary: due on today counts as paid
    const dayBefore = generateCapitalCalls({ ...base, today: "2024-09-29" });
    expect(dayBefore[1].status).toBe("pending");
  });

  it("the total of all calls equals the commitment, with the last call trimmed", () => {
    const calls = generateCapitalCalls({ ...base, percentPerCall: 30 });
    expect(calls.map((c) => c.amount)).toEqual([30000, 30000, 30000, 10000]);
    expect(calls[3].percentage).toBe(10);
    expect(sum(calls.map((c) => c.amount))).toBe(100000);
  });

  it("alreadyCalled skips that much of the commitment", () => {
    const calls = generateCapitalCalls({ ...base, alreadyCalled: 40000 });
    expect(calls).toHaveLength(3);
    expect(sum(calls.map((c) => c.amount))).toBe(60000);
  });

  it("alreadyCalled covering the whole commitment generates nothing", () => {
    expect(generateCapitalCalls({ ...base, alreadyCalled: 100000 })).toEqual([]);
    expect(generateCapitalCalls({ ...base, alreadyCalled: 250000 })).toEqual([]);
  });

  it("a percentage that does not divide evenly still sums to the commitment to the cent", () => {
    const calls = generateCapitalCalls({ commitment: 100, percentPerCall: 33.333, firstDate: "2024-01-15", intervalMonths: 3, today: "2030-01-01" });
    expect(sum(calls.map((c) => c.amount))).toBeCloseTo(100, 2);
    expect(calls.every((c) => c.amount > 0)).toBe(true);
  });

  it("100% in a single call", () => {
    const calls = generateCapitalCalls({ ...base, percentPerCall: 100 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ due_date: "2024-03-31", amount: 100000, percentage: 100 });
  });

  it("a percentage above 100 is capped at the commitment", () => {
    const calls = generateCapitalCalls({ ...base, percentPerCall: 250 });
    expect(calls).toHaveLength(1);
    expect(calls[0].amount).toBe(100000);
  });

  it("monthly schedule from the 31st keeps month-end anchoring through a leap February", () => {
    const calls = generateCapitalCalls({ commitment: 400, percentPerCall: 25, firstDate: "2024-01-31", intervalMonths: 1, today: "2030-01-01" });
    expect(calls.map((c) => c.due_date)).toEqual(["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30"]);
  });

  it("non-leap February clamps to the 28th", () => {
    const calls = generateCapitalCalls({ commitment: 200, percentPerCall: 50, firstDate: "2023-01-31", intervalMonths: 1, today: "2030-01-01" });
    expect(calls.map((c) => c.due_date)).toEqual(["2023-01-31", "2023-02-28"]);
  });

  it("quarterly schedule rolls across year ends", () => {
    const calls = generateCapitalCalls({ commitment: 400, percentPerCall: 25, firstDate: "2024-11-15", intervalMonths: 3, today: "2030-01-01" });
    expect(calls.map((c) => c.due_date)).toEqual(["2024-11-15", "2025-02-15", "2025-05-15", "2025-08-15"]);
  });

  it("returns [] for invalid inputs", () => {
    expect(generateCapitalCalls({ ...base, commitment: 0 })).toEqual([]);
    expect(generateCapitalCalls({ ...base, commitment: -5 })).toEqual([]);
    expect(generateCapitalCalls({ ...base, percentPerCall: 0 })).toEqual([]);
    expect(generateCapitalCalls({ ...base, firstDate: "" })).toEqual([]);
    expect(generateCapitalCalls({ ...base, intervalMonths: 0 })).toEqual([]);
  });

  it("generated calls pass the metadata validation (do not exceed the commitment)", () => {
    const calls = generateCapitalCalls(base);
    expect(getPrivateEquityMetadataErrors(meta({ commitment_amount: 100000, capital_calls: calls }))).toEqual([]);
  });
});

describe("generateProjectedDistributions", () => {
  const base = {
    commitment: 100000,
    multiple: 1.8,
    firstCallDate: "2024-03-31",
    startYear: 4,
    endYear: 10,
    shape: "even" as const,
  };

  it("one distribution a year, years 4-10 counted from the first call", () => {
    const d = generateProjectedDistributions(base);
    expect(d).toHaveLength(7);
    expect(d[0].due_date).toBe("2027-03-31");
    expect(d[6].due_date).toBe("2033-03-31");
  });

  it("the total is exactly commitment x multiple (last row absorbs the rounding)", () => {
    const d = generateProjectedDistributions(base);
    expect(sum(d.map((x) => x.amount))).toBeCloseTo(180000, 6);
    expect(d[0].amount).toBe(25714.29);
    expect(d[5].amount).toBe(25714.29);
    expect(d[6].amount).toBe(25714.26);
  });

  it("back_loaded weights year n by n: later years pay more, total still exact", () => {
    const d = generateProjectedDistributions({ ...base, shape: "back_loaded" });
    expect(d[0].amount).toBe(6428.57); // 180000 x 1/28
    expect(d[1].amount).toBe(12857.14); // 180000 x 2/28
    for (let i = 1; i < d.length - 1; i++) expect(d[i].amount).toBeGreaterThan(d[i - 1].amount);
    expect(sum(d.map((x) => x.amount))).toBeCloseTo(180000, 6);
  });

  it("start year equal to end year gives a single payment of the whole total", () => {
    const d = generateProjectedDistributions({ ...base, startYear: 5, endYear: 5 });
    expect(d).toEqual([{ id: "dist-2028-03-31", due_date: "2028-03-31", amount: 180000 }]);
  });

  it("year 1 falls on the first call date itself", () => {
    const d = generateProjectedDistributions({ ...base, startYear: 1, endYear: 1 });
    expect(d[0].due_date).toBe("2024-03-31");
  });

  it("a 29 February anchor clamps to the 28th in non-leap years and restores in leap years", () => {
    const d = generateProjectedDistributions({ ...base, firstCallDate: "2024-02-29", startYear: 2, endYear: 5 });
    expect(d.map((x) => x.due_date)).toEqual(["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });

  it("returns [] for invalid inputs", () => {
    expect(generateProjectedDistributions({ ...base, commitment: 0 })).toEqual([]);
    expect(generateProjectedDistributions({ ...base, multiple: 0 })).toEqual([]);
    expect(generateProjectedDistributions({ ...base, firstCallDate: "" })).toEqual([]);
    expect(generateProjectedDistributions({ ...base, startYear: 0 })).toEqual([]);
    expect(generateProjectedDistributions({ ...base, startYear: 6, endYear: 5 })).toEqual([]);
  });

  it("a multiple below 1 (a loss-making fund) is allowed", () => {
    const d = generateProjectedDistributions({ ...base, multiple: 0.5 });
    expect(sum(d.map((x) => x.amount))).toBeCloseTo(50000, 6);
  });
});

describe("projectedCashFlows", () => {
  it("calls are outflows (negative), distributions inflows (positive)", () => {
    const m = meta({ capital_calls: [call("2024-01-01", 100)], projected_distributions: [dist("2030-01-01", 150)] });
    expect(projectedCashFlows(m)).toEqual([
      { date: "2024-01-01", amount: -100 },
      { date: "2030-01-01", amount: 150 },
    ]);
  });

  it("empty for a bare record", () => {
    expect(projectedCashFlows(meta())).toEqual([]);
  });
});

describe("fundReturns", () => {
  const flows = meta({
    capital_calls: [call("2024-01-01", 100000)],
    projected_distributions: [dist("2029-01-01", 150000)],
  });

  it("totals, multiple and an annualised IRR from the schedule", () => {
    const r = fundReturns(flows);
    expect(r.totalCalls).toBe(100000);
    expect(r.totalDistributions).toBe(150000);
    expect(r.multiple).toBe(1.5);
    // 2024-01-01 -> 2029-01-01 is 1827 days; XIRR uses a 365-day year.
    expect(r.irr).toBeCloseTo(Math.pow(1.5, 365 / 1827) - 1, 5);
  });

  it("counts pending calls toward total calls too (scheduled, not just paid)", () => {
    const r = fundReturns(
      meta({ capital_calls: [call("2024-01-01", 50000), call("2024-07-01", 50000, "pending")], projected_distributions: [dist("2029-01-01", 150000)] }),
    );
    expect(r.totalCalls).toBe(100000);
    expect(r.multiple).toBe(1.5);
  });

  it("no calls: multiple and IRR are null", () => {
    const r = fundReturns(meta({ projected_distributions: [dist("2029-01-01", 150000)] }));
    expect(r.multiple).toBeNull();
    expect(r.irr).toBeNull();
  });

  it("no distributions: multiple is 0 and the IRR is undefined (null)", () => {
    const r = fundReturns(meta({ capital_calls: [call("2024-01-01", 100)] }));
    expect(r.multiple).toBe(0);
    expect(r.irr).toBeNull();
  });

  it("manual mode: the investor's multiple and IRR % replace the computed ones", () => {
    const r = fundReturns({ ...flows, projection_mode: "manual", expected_multiple: 2.2, expected_irr_manual: 12 });
    expect(r.multiple).toBe(2.2);
    expect(r.irr).toBeCloseTo(0.12, 12);
    // Totals still come from the schedule.
    expect(r.totalCalls).toBe(100000);
  });

  it("manual mode with nothing typed falls back to the computed figures", () => {
    const r = fundReturns({ ...flows, projection_mode: "manual", expected_multiple: null, expected_irr_manual: null });
    expect(r.multiple).toBe(1.5);
    expect(r.irr).toBeCloseTo(Math.pow(1.5, 365 / 1827) - 1, 5);
  });

  it("model mode ignores any stale manual targets", () => {
    const r = fundReturns({ ...flows, projection_mode: "model", expected_multiple: 9, expected_irr_manual: 99 });
    expect(r.multiple).toBe(1.5);
  });

  it("a manual IRR of 0 is honoured (not treated as missing)", () => {
    expect(fundReturns({ ...flows, projection_mode: "manual", expected_irr_manual: 0 }).irr).toBe(0);
  });
});

describe("cumulativeCashFlowSeries", () => {
  it("is empty without flows", () => {
    expect(cumulativeCashFlowSeries(meta())).toEqual([]);
  });

  it("builds a date-sorted running net position (calls out, distributions in)", () => {
    const m = meta({
      capital_calls: [call("2025-01-01", 40), call("2024-01-01", 60)],
      projected_distributions: [dist("2029-01-01", 130), dist("2027-01-01", 30)],
    });
    expect(cumulativeCashFlowSeries(m)).toEqual([
      { date: "2024-01-01", calls: 60, distributions: 0, cumulative: -60 },
      { date: "2025-01-01", calls: 40, distributions: 0, cumulative: -100 },
      { date: "2027-01-01", calls: 0, distributions: 30, cumulative: -70 },
      { date: "2029-01-01", calls: 0, distributions: 130, cumulative: 60 },
    ]);
  });

  it("merges a call and a distribution that share a date", () => {
    const m = meta({ capital_calls: [call("2024-01-01", 50)], projected_distributions: [dist("2024-01-01", 80)] });
    expect(cumulativeCashFlowSeries(m)).toEqual([{ date: "2024-01-01", calls: 50, distributions: 80, cumulative: 30 }]);
  });

  it("the final cumulative equals total distributions minus total calls", () => {
    const m = meta({
      capital_calls: [call("2024-01-01", 100000)],
      projected_distributions: generateProjectedDistributions({ commitment: 100000, multiple: 1.8, firstCallDate: "2024-01-01", startYear: 4, endYear: 10, shape: "back_loaded" }),
    });
    const s = cumulativeCashFlowSeries(m);
    expect(s[s.length - 1].cumulative).toBeCloseTo(80000, 6);
  });
});
