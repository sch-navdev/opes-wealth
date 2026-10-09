import { describe, expect, it } from "vitest";
import {
  ASSURANCE_VIE_CONFIG,
  EMPTY_ASSURANCE_VIE_METADATA,
  addYearsToIso,
  allocationTotal,
  allowanceForHousehold,
  beneficiarySharesState,
  beneficiarySharesTotal,
  computeMilestone,
  emptyBeneficiary,
  estateAllowanceInfo,
  getAssuranceVieMetadataErrors,
  getAssuranceVieWarnings,
  hasPremiumAgeSplit,
  impliedAllocationAmounts,
  isValidIsoDate,
  linkAllocation,
  localTodayIso,
  parseAssuranceVieMetadata,
  parseIsoDate,
  scheduledAnnualAmount,
  type AssuranceVieMetadata,
} from "@/lib/assurance-vie";

const TODAY = "2026-10-07";
const valid = (over: Partial<AssuranceVieMetadata> = {}): AssuranceVieMetadata => ({
  ...EMPTY_ASSURANCE_VIE_METADATA,
  opened_on: "2018-03-15",
  euro_fund_pct: 60,
  uc_pct: 40,
  ...over,
});
const errors = (over: Record<string, unknown>) => getAssuranceVieMetadataErrors({ ...valid(), ...over }, TODAY);

describe("config", () => {
  it("keeps the tax constants in one place", () => {
    expect(ASSURANCE_VIE_CONFIG.milestoneYears).toBe(8);
    expect(ASSURANCE_VIE_CONFIG.allowance).toEqual({ currency: "EUR", single: 4600, couple: 9200 });
    expect(parseIsoDate(ASSURANCE_VIE_CONFIG.asOf)).not.toBeNull();
    expect(ASSURANCE_VIE_CONFIG.source.length).toBeGreaterThan(0);
  });

  it("returns the allowance by household status", () => {
    expect(allowanceForHousehold("single")).toMatchObject({ amount: 4600, currency: "EUR", household: "single" });
    expect(allowanceForHousehold("couple")).toMatchObject({ amount: 9200, currency: "EUR", household: "couple" });
  });
});

describe("ISO dates", () => {
  it("accepts only real calendar dates in YYYY-MM-DD form", () => {
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    for (const bad of ["2023-02-29", "2024-13-01", "2024-00-10", "2024-04-31", "2024-1-1", "24-01-01", "2024-01-01T00:00:00Z", "", null, undefined, 20240101, {}, "1800-01-01"]) {
      expect(isValidIsoDate(bad)).toBe(false);
    }
  });

  it("adds years keeping month and day, clamping a missing day to the end of the month", () => {
    expect(addYearsToIso("2018-03-15", 8)).toBe("2026-03-15");
    expect(addYearsToIso("2016-02-29", 8)).toBe("2024-02-29");
    expect(addYearsToIso("2020-02-29", 8)).toBe("2028-02-29");
    // 2100 is not a leap year (century rule): 29 February falls on the 28th.
    expect(addYearsToIso("2092-02-29", 8)).toBe("2100-02-28");
    expect(addYearsToIso("nope", 8)).toBeNull();
  });

  it("derives today from the local calendar day, never the UTC date", () => {
    expect(localTodayIso(new Date(2026, 9, 7, 0, 30))).toBe("2026-10-07");
    expect(localTodayIso(new Date(2026, 9, 7, 23, 59))).toBe("2026-10-07");
    expect(localTodayIso(new Date(2026, 0, 1))).toBe("2026-01-01");
  });
});

describe("computeMilestone", () => {
  it("is unknown without a valid opening date", () => {
    for (const bad of ["", "garbage", null, undefined, "2023-02-30", 5]) {
      expect(computeMilestone(bad, "single", TODAY)).toEqual({ kind: "unknown" });
    }
  });

  it("is before the anniversary with whole days and months remaining", () => {
    expect(computeMilestone("2018-03-15", "single", "2026-03-14")).toMatchObject({
      kind: "before",
      date: "2026-03-15",
      daysRemaining: 1,
      monthsRemaining: 0,
    });
    expect(computeMilestone("2018-03-15", "single", "2025-12-20")).toMatchObject({
      kind: "before",
      daysRemaining: 85,
      monthsRemaining: 2,
    });
    expect(computeMilestone("2024-10-07", "single", TODAY)).toMatchObject({
      kind: "before",
      date: "2032-10-07",
      monthsRemaining: 72 - 0,
    });
  });

  it("counts the anniversary day itself as reached (0 days since)", () => {
    expect(computeMilestone("2018-03-15", "single", "2026-03-15")).toMatchObject({ kind: "reached", date: "2026-03-15", daysSince: 0 });
  });

  it("is reached after the anniversary with the days since", () => {
    const r = computeMilestone("2018-03-15", "single", "2026-03-20");
    expect(r).toMatchObject({ kind: "reached", date: "2026-03-15", daysSince: 5 });
    expect(computeMilestone("2010-01-01", "single", TODAY)).toMatchObject({ kind: "reached", date: "2018-01-01" });
  });

  it("carries the allowance for the household (single 4,600 / couple 9,200 EUR)", () => {
    const single = computeMilestone("2010-01-01", "single", TODAY);
    const couple = computeMilestone("2010-01-01", "couple", TODAY);
    expect(single.kind === "reached" && single.allowance.amount).toBe(4600);
    expect(couple.kind === "reached" && couple.allowance.amount).toBe(9200);
    const before = computeMilestone("2024-01-01", "couple", TODAY);
    expect(before.kind === "before" && before.allowance.amount).toBe(9200);
  });

  it("handles a 29 February opening date", () => {
    expect(computeMilestone("2016-02-29", "single", "2024-02-28")).toMatchObject({ kind: "before", date: "2024-02-29", daysRemaining: 1 });
    expect(computeMilestone("2016-02-29", "single", "2024-02-29")).toMatchObject({ kind: "reached", daysSince: 0 });
    expect(computeMilestone("2092-02-29", "single", "2100-02-27")).toMatchObject({ kind: "before", date: "2100-02-28", daysRemaining: 1 });
  });

  it("is time-zone safe: a local Date counts as its calendar day and equals the ISO string", () => {
    const late = new Date(2026, 2, 14, 23, 59, 59);
    const early = new Date(2026, 2, 15, 0, 0, 1);
    expect(computeMilestone("2018-03-15", "single", late)).toEqual(computeMilestone("2018-03-15", "single", "2026-03-14"));
    expect(computeMilestone("2018-03-15", "single", early)).toEqual(computeMilestone("2018-03-15", "single", "2026-03-15"));
  });

  it("measures the clock from the opening date only, never from premiums", () => {
    const md = valid({ opened_on: "2018-03-15", premiums_paid_total: 1, premiums_before_70: 1 });
    expect(computeMilestone(md.opened_on, md.household, "2026-03-15").kind).toBe("reached");
  });
});

describe("allocation", () => {
  it("keeps the two shares linked and clamped", () => {
    expect(linkAllocation("euro", 70)).toEqual({ euro_fund_pct: 70, uc_pct: 30 });
    expect(linkAllocation("uc", 25.5)).toEqual({ euro_fund_pct: 74.5, uc_pct: 25.5 });
    expect(linkAllocation("euro", 150)).toEqual({ euro_fund_pct: 100, uc_pct: 0 });
    expect(linkAllocation("euro", -5)).toEqual({ euro_fund_pct: 0, uc_pct: 100 });
    expect(linkAllocation("euro", null)).toEqual({ euro_fund_pct: 0, uc_pct: 100 });
    expect(linkAllocation("euro", Number.NaN)).toEqual({ euro_fund_pct: 0, uc_pct: 100 });
    const r = linkAllocation("euro", 33.33);
    expect(allocationTotal(r)).toBe(100);
  });

  it("derives implied amounts that add back up to the asset value", () => {
    const { euro, uc } = impliedAllocationAmounts(10_000, { euro_fund_pct: 60, uc_pct: 40 });
    expect(euro).toBe(6000);
    expect(uc).toBe(4000);
    const odd = impliedAllocationAmounts(100.01, { euro_fund_pct: 33.33, uc_pct: 66.67 });
    expect(Math.round((odd.euro + odd.uc) * 100) / 100).toBe(100.01);
    expect(impliedAllocationAmounts(Number.NaN, { euro_fund_pct: 50, uc_pct: 50 })).toEqual({ euro: 0, uc: 0 });
  });
});

describe("scheduled premiums", () => {
  it("annualises by frequency, only for a scheduled contract with an amount", () => {
    const base = { deposit_type: "scheduled" as const, scheduled_amount: 100, scheduled_frequency: "monthly" as const };
    expect(scheduledAnnualAmount(base)).toBe(1200);
    expect(scheduledAnnualAmount({ ...base, scheduled_frequency: "quarterly" })).toBe(400);
    expect(scheduledAnnualAmount({ ...base, scheduled_frequency: "yearly" })).toBe(100);
    expect(scheduledAnnualAmount({ ...base, deposit_type: "free" })).toBeNull();
    expect(scheduledAnnualAmount({ ...base, scheduled_amount: null })).toBeNull();
    expect(scheduledAnnualAmount({ ...base, scheduled_amount: 0 })).toBeNull();
  });

  it("detects the premiums-by-age split", () => {
    expect(hasPremiumAgeSplit({ premiums_before_70: null, premiums_after_70: null })).toBe(false);
    expect(hasPremiumAgeSplit({ premiums_before_70: 0, premiums_after_70: null })).toBe(true);
    expect(hasPremiumAgeSplit({ premiums_before_70: null, premiums_after_70: 10 })).toBe(true);
  });
});

describe("beneficiary shares", () => {
  const list = (...shares: (number | null)[]) => shares.map((s) => ({ share_pct: s }));
  it("totals and classifies the entered shares", () => {
    expect(beneficiarySharesTotal(list(50, 30, null))).toBe(80);
    expect(beneficiarySharesState([])).toBe("none");
    expect(beneficiarySharesState(list(null, null))).toBe("none");
    expect(beneficiarySharesState(list(60, 40))).toBe("complete");
    expect(beneficiarySharesState(list(33.33, 33.33, 33.34))).toBe("complete");
    expect(beneficiarySharesState(list(60, 30))).toBe("mismatch");
    expect(beneficiarySharesState(list(60, 60))).toBe("mismatch");
  });
});

describe("parseAssuranceVieMetadata", () => {
  it("returns the versioned empty object for garbage input and never throws", () => {
    for (const garbage of [null, undefined, 5, "x", [], true, () => 1]) {
      const md = parseAssuranceVieMetadata(garbage);
      expect(md).toEqual(EMPTY_ASSURANCE_VIE_METADATA);
      expect(md.version).toBe(2);
    }
  });

  it("does not share the empty beneficiaries array between calls", () => {
    const a = parseAssuranceVieMetadata(null);
    a.beneficiaries.push(emptyBeneficiary("x"));
    expect(parseAssuranceVieMetadata(null).beneficiaries).toHaveLength(0);
    expect(EMPTY_ASSURANCE_VIE_METADATA.beneficiaries).toHaveLength(0);
  });

  it("sanitises every field", () => {
    const md = parseAssuranceVieMetadata({
      version: 99,
      insurer: "  Insurer  ",
      contract_name: 42,
      contract_number: "x".repeat(500),
      opened_on: "2018-02-30",
      household: "triple",
      euro_fund_pct: "60",
      uc_pct: -5,
      deposit_type: "weird",
      premiums_paid_total: -1,
      premiums_before_70: Number.NaN,
      premiums_after_70: "10",
      beneficiaries: "no",
      extra: "ignored",
    });
    expect(md).toMatchObject({
      version: 2,
      insurer: "Insurer",
      contract_name: "",
      opened_on: "",
      household: "single",
      euro_fund_pct: 100,
      uc_pct: 0,
      deposit_type: "free",
      premiums_paid_total: null,
      premiums_before_70: null,
      premiums_after_70: null,
      beneficiaries: [],
    });
    expect(md.contract_number).toHaveLength(60);
    expect("extra" in md).toBe(false);
  });

  it("repairs the allocation so it always totals 100 (euro share wins, else the unit-linked one)", () => {
    expect(parseAssuranceVieMetadata({ euro_fund_pct: 70, uc_pct: 70 })).toMatchObject({ euro_fund_pct: 70, uc_pct: 30 });
    expect(parseAssuranceVieMetadata({ uc_pct: 25 })).toMatchObject({ euro_fund_pct: 75, uc_pct: 25 });
    expect(parseAssuranceVieMetadata({ euro_fund_pct: 101 })).toMatchObject({ euro_fund_pct: 100, uc_pct: 0 });
  });

  it("keeps programmed-premium fields only for a scheduled contract", () => {
    const fields = { scheduled_amount: 150, scheduled_frequency: "quarterly", scheduled_day: 12, scheduled_start_on: "2024-01-01", scheduled_end_on: "2030-01-01" };
    expect(parseAssuranceVieMetadata({ deposit_type: "scheduled", ...fields })).toMatchObject({
      deposit_type: "scheduled",
      scheduled_amount: 150,
      scheduled_frequency: "quarterly",
      scheduled_day: 12,
      scheduled_start_on: "2024-01-01",
      scheduled_end_on: "2030-01-01",
    });
    expect(parseAssuranceVieMetadata({ deposit_type: "free", ...fields })).toMatchObject({
      scheduled_amount: null,
      scheduled_frequency: "monthly",
      scheduled_day: null,
      scheduled_start_on: "",
      scheduled_end_on: "",
    });
    expect(parseAssuranceVieMetadata({ deposit_type: "scheduled", scheduled_day: 40, scheduled_frequency: "daily", scheduled_start_on: "bad" })).toMatchObject({
      scheduled_day: null,
      scheduled_frequency: "monthly",
      scheduled_start_on: "",
    });
  });

  it("drops blank beneficiary rows, caps the list, and sanitises each entry", () => {
    const md = parseAssuranceVieMetadata({
      beneficiaries: [
        { id: "a", name: " Alice ", relationship: "spouse", share_pct: 60, clause: "free_text", clause_text: "to my spouse" },
        { id: "b", name: "", relationship: "", share_pct: null },
        { name: "Bob", share_pct: 140, clause: "standard", clause_text: "ignored for standard" },
        "garbage",
        null,
      ],
    });
    expect(md.beneficiaries).toHaveLength(2);
    expect(md.beneficiaries[0]).toMatchObject({ id: "a", name: "Alice", share_pct: 60, clause: "free_text", clause_text: "to my spouse" });
    expect(md.beneficiaries[1]).toMatchObject({ name: "Bob", share_pct: null, clause: "standard", clause_text: "" });
    expect(md.beneficiaries[1].id).toBeTruthy();

    const many = Array.from({ length: 50 }, (_, i) => ({ id: `i${i}`, name: `N${i}` }));
    expect(parseAssuranceVieMetadata({ beneficiaries: many }).beneficiaries).toHaveLength(20);
  });

  it("is idempotent", () => {
    const once = parseAssuranceVieMetadata({ ...valid({ deposit_type: "scheduled", scheduled_amount: 10, scheduled_day: 3 }), beneficiaries: [{ id: "z", name: "Z", share_pct: 100 }] });
    expect(parseAssuranceVieMetadata(once)).toEqual(once);
  });
});

describe("getAssuranceVieMetadataErrors", () => {
  it("accepts a valid contract and the empty default", () => {
    expect(getAssuranceVieMetadataErrors(valid(), TODAY)).toEqual([]);
    expect(getAssuranceVieMetadataErrors(EMPTY_ASSURANCE_VIE_METADATA, TODAY)).toEqual([]);
  });

  it("rejects non-objects without throwing", () => {
    for (const garbage of [null, undefined, 1, "x", []]) {
      expect(getAssuranceVieMetadataErrors(garbage, TODAY)).toEqual(["av_err_invalid"]);
    }
    expect(() => getAssuranceVieMetadataErrors({ beneficiaries: [null, 3, "x"], deposit_type: "scheduled" }, TODAY)).not.toThrow();
  });

  it("validates the opening date (optional, real, not in the future)", () => {
    expect(errors({ opened_on: "" })).toEqual([]);
    expect(errors({ opened_on: "2018-02-30" })).toContain("av_err_opened_invalid");
    expect(errors({ opened_on: "yesterday" })).toContain("av_err_opened_invalid");
    expect(errors({ opened_on: "2026-10-08" })).toContain("av_err_opened_future");
    expect(errors({ opened_on: TODAY })).toEqual([]);
  });

  it("requires an allocation in range that totals 100 within a small epsilon", () => {
    expect(errors({ euro_fund_pct: 60, uc_pct: 40 })).toEqual([]);
    expect(errors({ euro_fund_pct: 60.004, uc_pct: 40 })).toEqual([]);
    expect(errors({ euro_fund_pct: 60, uc_pct: 39 })).toContain("av_err_allocation_total");
    expect(errors({ euro_fund_pct: 101, uc_pct: -1 })).toContain("av_err_allocation_range");
    expect(errors({ euro_fund_pct: Number.NaN, uc_pct: 40 })).toContain("av_err_allocation_range");
    expect(errors({ euro_fund_pct: "60", uc_pct: 40 })).toContain("av_err_allocation_range");
    expect(errors({ euro_fund_pct: null, uc_pct: null })).toContain("av_err_allocation_range");
  });

  it("rejects negative or non-numeric premium amounts", () => {
    expect(errors({ premiums_paid_total: -1 })).toContain("av_err_premium_negative");
    expect(errors({ premiums_before_70: Number.NaN })).toContain("av_err_premium_negative");
    expect(errors({ premiums_after_70: "abc" })).toContain("av_err_premium_negative");
    expect(errors({ premiums_paid_total: 0, premiums_before_70: null, premiums_after_70: 5 })).toEqual([]);
  });

  it("validates programmed premiums only when that deposit type is chosen", () => {
    expect(errors({ deposit_type: "free", scheduled_amount: -5, scheduled_day: 99 })).toEqual([]);
    const base = { deposit_type: "scheduled", scheduled_amount: 100, scheduled_frequency: "monthly", scheduled_day: 5, scheduled_start_on: "", scheduled_end_on: "" };
    expect(errors(base)).toEqual([]);
    expect(errors({ ...base, scheduled_amount: null })).toContain("av_err_scheduled_amount");
    expect(errors({ ...base, scheduled_amount: 0 })).toContain("av_err_scheduled_amount");
    expect(errors({ ...base, scheduled_frequency: "weekly" })).toContain("av_err_scheduled_frequency");
    for (const day of [0, 32, 1.5, null, Number.NaN]) expect(errors({ ...base, scheduled_day: day })).toContain("av_err_scheduled_day");
    for (const day of [1, 15, 31]) expect(errors({ ...base, scheduled_day: day })).toEqual([]);
    expect(errors({ ...base, scheduled_start_on: "2024-13-01" })).toContain("av_err_scheduled_dates");
    expect(errors({ ...base, scheduled_start_on: "2024-06-01", scheduled_end_on: "2024-05-31" })).toContain("av_err_scheduled_dates");
    expect(errors({ ...base, scheduled_start_on: "2024-06-01", scheduled_end_on: "2024-06-01" })).toEqual([]);
    expect(errors({ ...base, scheduled_end_on: "2030-01-01" })).toEqual([]);
  });

  it("validates beneficiaries: name needed once anything else is filled, shares 0 to 100, at most 20", () => {
    const row = (over: Record<string, unknown>) => ({ id: "x", name: "A", relationship: "", share_pct: null, clause: "standard", clause_text: "", ...over });
    expect(errors({ beneficiaries: [row({})] })).toEqual([]);
    expect(errors({ beneficiaries: [row({ name: "", relationship: "", share_pct: null })] })).toEqual([]);
    expect(errors({ beneficiaries: [row({ name: "", share_pct: 50 })] })).toContain("av_err_bene_name");
    expect(errors({ beneficiaries: [row({ name: " ", relationship: "son" })] })).toContain("av_err_bene_name");
    expect(errors({ beneficiaries: [row({ share_pct: 101 })] })).toContain("av_err_bene_share");
    expect(errors({ beneficiaries: [row({ share_pct: -1 })] })).toContain("av_err_bene_share");
    expect(errors({ beneficiaries: [row({ share_pct: "50" })] })).toContain("av_err_bene_share");
    expect(errors({ beneficiaries: Array.from({ length: 21 }, (_, i) => row({ id: `i${i}` })) })).toContain("av_err_bene_count");
    expect(errors({ beneficiaries: "nope" })).toEqual([]);
  });

  it("does not treat a beneficiary total other than 100 as an error (it is a warning)", () => {
    const md = valid({ beneficiaries: [{ ...emptyBeneficiary("a"), name: "A", share_pct: 30 }] });
    expect(getAssuranceVieMetadataErrors(md, TODAY)).toEqual([]);
    expect(getAssuranceVieWarnings(md)).toContain("av_warn_bene_total");
  });
});

describe("getAssuranceVieWarnings", () => {
  it("warns on a beneficiary total that is not 100 but not when complete or empty", () => {
    const b = (share: number | null) => ({ ...emptyBeneficiary(String(share)), name: "N", share_pct: share });
    expect(getAssuranceVieWarnings(valid({ beneficiaries: [b(60), b(40)] }))).toEqual([]);
    expect(getAssuranceVieWarnings(valid({ beneficiaries: [b(null)] }))).toEqual([]);
    expect(getAssuranceVieWarnings(valid({ beneficiaries: [b(60), b(30)] }))).toEqual(["av_warn_bene_total"]);
  });

  it("warns when the age split exceeds the total premiums paid", () => {
    expect(getAssuranceVieWarnings(valid({ premiums_paid_total: 100, premiums_before_70: 80, premiums_after_70: 30 }))).toEqual(["av_warn_premium_split"]);
    expect(getAssuranceVieWarnings(valid({ premiums_paid_total: 100, premiums_before_70: 80, premiums_after_70: 20 }))).toEqual([]);
    expect(getAssuranceVieWarnings(valid({ premiums_paid_total: null, premiums_before_70: 80 }))).toEqual([]);
  });
});

describe("estateAllowanceInfo", () => {
  const person = (id: string, name: string) => ({ ...emptyBeneficiary(id), name });

  it("keeps every estate figure in the one config object with the as-of date", () => {
    expect(ASSURANCE_VIE_CONFIG.estate.before70PerBeneficiary).toBe(152_500);
    expect(ASSURANCE_VIE_CONFIG.estate.after70Overall).toBe(30_500);
    expect(ASSURANCE_VIE_CONFIG.estate.ageThreshold).toBe(70);
    expect(ASSURANCE_VIE_CONFIG.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("without named beneficiaries only the allowances are returned, no arithmetic", () => {
    const info = estateAllowanceInfo({ beneficiaries: [] });
    expect(info).toMatchObject({ before70PerBeneficiary: 152_500, after70Overall: 30_500, namedBeneficiaries: 0, before70Combined: null, after70EqualShare: null });
    expect(info.asOf).toBe(ASSURANCE_VIE_CONFIG.asOf);
  });

  it("multiplies the per-beneficiary allowance and splits the overall one equally, counting named people only", () => {
    const info = estateAllowanceInfo({ beneficiaries: [person("a", "Alice"), person("b", "Bob"), person("c", "Cleo"), emptyBeneficiary("d")] });
    expect(info.namedBeneficiaries).toBe(3);
    expect(info.before70Combined).toBe(457_500);
    expect(info.after70EqualShare).toBe(10_166.67);
  });

  it("ignores whitespace-only names and tolerates a missing list", () => {
    expect(estateAllowanceInfo({ beneficiaries: [person("a", "   ")] }).namedBeneficiaries).toBe(0);
    expect(estateAllowanceInfo({ beneficiaries: undefined as never }).namedBeneficiaries).toBe(0);
  });

  it("does not depend on premiums or contract value (no tax amount is derived)", () => {
    const a = estateAllowanceInfo(valid({ beneficiaries: [person("a", "Alice")], premiums_before_70: 1_000_000, premiums_after_70: 5 }));
    const b = estateAllowanceInfo(valid({ beneficiaries: [person("a", "Alice")] }));
    expect(a).toEqual(b);
  });
});
