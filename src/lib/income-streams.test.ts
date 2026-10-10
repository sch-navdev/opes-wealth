import { describe, expect, it } from "vitest";
import {
  expandIncomeStreams,
  monthlyEquivalent,
  parseIncomeStreamRow,
  summarizeIncomeStreams,
  totalsByKind,
  totalsByMonth,
  validateIncomeStream,
  earnedGroupOf,
  windowMonths,
  type IncomeStream,
} from "@/lib/income-streams";

const base: IncomeStream = {
  id: "s1",
  kind: "salary",
  label: "Main job",
  source_name: "Acme",
  amount: 1000,
  currency: "USD",
  frequency: "monthly",
  pay_day: 25,
  pay_month: null,
  start_date: "2025-01-01",
  end_date: null,
  notes: "",
};
const mk = (over: Partial<IncomeStream>): IncomeStream => ({ ...base, ...over });
const rates = { USD: 1, EUR: 0.5 }; // 1 USD = 0.5 EUR

describe("validateIncomeStream", () => {
  const { id: _id, ...input } = base;
  void _id;

  it("accepts a valid stream and cleans it", () => {
    const r = validateIncomeStream({ ...input, label: "  Main job ", currency: "usd", amount: "1000.456" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.label).toBe("Main job");
      expect(r.value.currency).toBe("USD");
      expect(r.value.amount).toBe(1000.46);
    }
  });

  it.each([
    [{ kind: "lottery" }, "cf_err_kind"],
    [{ label: " " }, "cf_err_label"],
    [{ label: "x".repeat(121) }, "cf_err_label"],
    [{ source_name: "x".repeat(121) }, "cf_err_source"],
    [{ amount: -1 }, "cf_err_amount"],
    [{ amount: "abc" }, "cf_err_amount"],
    [{ amount: Number.NaN }, "cf_err_amount"],
    [{ currency: "US" }, "cf_err_currency"],
    [{ frequency: "weekly" }, "cf_err_frequency"],
    [{ pay_day: 0 }, "cf_err_pay_day"],
    [{ pay_day: 32 }, "cf_err_pay_day"],
    [{ pay_day: 1.5 }, "cf_err_pay_day"],
    [{ pay_month: 13 }, "cf_err_pay_month"],
    [{ frequency: "annual", pay_month: null }, "cf_err_pay_month"],
    [{ frequency: "one_off", pay_month: null }, "cf_err_pay_month"],
    [{ start_date: "2025-02-30" }, "cf_err_start"],
    [{ end_date: "2024-12-31" }, "cf_err_end"],
    [{ notes: "x".repeat(2001) }, "cf_err_notes"],
  ])("rejects %j with %s", (over, code) => {
    expect(validateIncomeStream({ ...input, ...over })).toEqual({ ok: false, error: code });
  });

  it("never throws on junk", () => {
    expect(validateIncomeStream(null).ok).toBe(false);
    expect(validateIncomeStream("x").ok).toBe(false);
    expect(validateIncomeStream(undefined).ok).toBe(false);
  });

  it("drops the pay month of a monthly stream and treats an empty end date as open", () => {
    const r = validateIncomeStream({ ...input, pay_month: 6, end_date: "" });
    expect(r.ok && r.value.pay_month).toBeNull();
    expect(r.ok && r.value.end_date).toBeNull();
  });
});

describe("parseIncomeStreamRow", () => {
  it("accepts a row with numeric strings and rejects junk", () => {
    expect(parseIncomeStreamRow({ ...base, amount: "1000.00", pay_day: 25 })?.amount).toBe(1000);
    expect(parseIncomeStreamRow({ ...base, id: undefined })).toBeNull();
    expect(parseIncomeStreamRow({ ...base, currency: "??" })).toBeNull();
    expect(parseIncomeStreamRow(null)).toBeNull();
  });
});

describe("monthlyEquivalent", () => {
  it("normalises each frequency and zeroes one-off and ended streams", () => {
    expect(monthlyEquivalent(mk({}), "2026-01-15")).toBe(1000);
    expect(monthlyEquivalent(mk({ frequency: "quarterly", amount: 3000 }), "2026-01-15")).toBe(1000);
    expect(monthlyEquivalent(mk({ frequency: "annual", amount: 12000, pay_month: 3 }), "2026-01-15")).toBe(1000);
    expect(monthlyEquivalent(mk({ frequency: "one_off", pay_month: 3 }), "2026-01-15")).toBe(0);
    expect(monthlyEquivalent(mk({ end_date: "2025-12-31" }), "2026-01-15")).toBe(0);
  });
});

describe("expandIncomeStreams", () => {
  it("builds a 12 month window", () => {
    expect(windowMonths("2026-11-20")).toEqual([
      "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04",
      "2027-05", "2027-06", "2027-07", "2027-08", "2027-09", "2027-10",
    ]);
  });

  it("monthly: 12 payments, day 31 clamped to the month end", () => {
    const occ = expandIncomeStreams([mk({ pay_day: 31 })], "2026-01", rates, "USD");
    expect(occ).toHaveLength(12);
    expect(occ.map((o) => o.date).slice(0, 3)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(occ.find((o) => o.month === "2026-04")?.date).toBe("2026-04-30");
    const leap = expandIncomeStreams([mk({ pay_day: 31 })], "2028-02", rates, "USD");
    expect(leap[0].date).toBe("2028-02-29");
  });

  it("null pay day means the 1st", () => {
    expect(expandIncomeStreams([mk({ pay_day: null })], "2026-01", rates, "USD")[0].date).toBe("2026-01-01");
  });

  it("quarterly: every 3 months from the pay month, defaulting to the start month", () => {
    const q = expandIncomeStreams([mk({ frequency: "quarterly", pay_month: 2, pay_day: 10 })], "2026-01", rates, "USD");
    expect(q.map((o) => o.month)).toEqual(["2026-02", "2026-05", "2026-08", "2026-11"]);
    const d = expandIncomeStreams([mk({ frequency: "quarterly", pay_month: null, start_date: "2025-03-15" })], "2026-01", rates, "USD");
    expect(d.map((o) => o.month)).toEqual(["2026-03", "2026-06", "2026-09", "2026-12"]);
  });

  it("annual: once in the pay month, and a bonus is just an annual stream of kind bonus", () => {
    const occ = expandIncomeStreams([mk({ kind: "bonus", frequency: "annual", pay_month: 12, pay_day: 15, amount: 5000 })], "2026-06", rates, "USD");
    expect(occ).toHaveLength(1);
    expect(occ[0]).toMatchObject({ date: "2026-12-15", kind: "bonus", baseAmount: 5000 });
  });

  it("one-off: once, on the first matching date after the start", () => {
    const s = mk({ frequency: "one_off", pay_month: 3, pay_day: 10, start_date: "2026-05-01" });
    // First match on/after 2026-05-01 is 2027-03-10.
    const occ = expandIncomeStreams([s], "2026-01", rates, "USD", 24);
    expect(occ.map((o) => o.date)).toEqual(["2027-03-10"]);
    const same = mk({ frequency: "one_off", pay_month: 3, pay_day: 10, start_date: "2026-01-01" });
    expect(expandIncomeStreams([same], "2026-01", rates, "USD", 24).map((o) => o.date)).toEqual(["2026-03-10"]);
  });

  it("respects start and end dates (end inclusive)", () => {
    const s = mk({ pay_day: 15, start_date: "2026-03-16", end_date: "2026-06-15" });
    const occ = expandIncomeStreams([s], "2026-01", rates, "USD");
    expect(occ.map((o) => o.date)).toEqual(["2026-04-15", "2026-05-15", "2026-06-15"]);
  });

  it("an ended stream produces nothing in a later window", () => {
    expect(expandIncomeStreams([mk({ end_date: "2025-06-30" })], "2026-01", rates, "USD")).toEqual([]);
  });

  it("converts to the base currency and skips zero amounts", () => {
    const occ = expandIncomeStreams([mk({ amount: 1000, currency: "USD" }), mk({ id: "z", amount: 0 })], "2026-01", rates, "EUR");
    expect(occ).toHaveLength(12);
    expect(occ[0].baseAmount).toBe(500);
    expect(occ[0].amount).toBe(1000);
  });
});

describe("totals", () => {
  const streams = [
    mk({ id: "a", pay_day: 25, amount: 1000 }),
    mk({ id: "b", kind: "bonus", frequency: "annual", pay_month: 3, amount: 4000 }),
  ];
  const occ = expandIncomeStreams(streams, "2026-01", rates, "USD");

  it("by month and by kind", () => {
    const byMonth = totalsByMonth(occ);
    expect(byMonth["2026-02"]).toBe(1000);
    expect(byMonth["2026-03"]).toBe(5000);
    expect(totalsByKind(occ)).toMatchObject({ salary: 12000, bonus: 4000, freelance: 0 });
  });

  it("summarises the run-rate and the next 12 months", () => {
    const s = summarizeIncomeStreams(streams, "2026-01-10", rates, "USD");
    expect(s.monthlyEquivalent).toBeCloseTo(1000 + 4000 / 12, 6);
    expect(s.next12Months).toBe(16000);
  });
});

describe("employers and the gratuity kind", () => {
  const base = { kind: "gratuity", label: "End of service", source_name: "", amount: 90000, currency: "AED", frequency: "one_off", pay_day: 1, pay_month: 6, start_date: "2026-01-01" };

  it("accepts a gratuity paid by one of the user's own companies", () => {
    const v = validateIncomeStream({ ...base, employer_asset_id: "7b0a8f0e-3c1d-4e1a-9f55-2f6d4f7f9a11" });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.employer_asset_id).toBe("7b0a8f0e-3c1d-4e1a-9f55-2f6d4f7f9a11");
  });

  it("treats a missing employer as an outside employer (null) and rejects a malformed id", () => {
    const v = validateIncomeStream({ ...base, source_name: "Outside Co" });
    expect(v.ok && v.value.employer_asset_id).toBeNull();
    expect(validateIncomeStream({ ...base, employer_asset_id: "not-a-uuid" })).toEqual({ ok: false, error: "cf_err_source" });
  });

  it("groups a gratuity separately from salary and bonus", () => {
    expect(earnedGroupOf("gratuity")).toBe("gratuity");
    expect(earnedGroupOf("salary")).toBe("salary");
  });
});
