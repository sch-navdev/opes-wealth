import { describe, expect, it } from "vitest";
import {
  analyseExpenses,
  applyDiversion,
  buildCashFlowWaterfall,
  buildEmergencyFund,
  classifyExpense,
  classifyTransactions,
  DEFAULT_SETTINGS,
  detectOwnTransferPairs,
  emergencyTarget,
  isLiquidInstantAccess,
  lastCompleteMonths,
  matchLiabilityPayment,
  merchantKey,
  normalizeSettings,
  plannedLiabilitiesMonthly,
  type WaterfallLiability,
  type WaterfallTransaction,
} from "@/lib/cash-flow-waterfall";
import type { IncomeStream } from "@/lib/income-streams";
import { splitAssets } from "@/lib/cash-flow-waterfall-server";

const rates = { USD: 1, EUR: 0.5 };
const tx = (date: string, amount: number, description: string, assetId = "a1", currency = "USD"): WaterfallTransaction => ({ assetId, date, amount, currency, description });
const loan: WaterfallLiability = { id: "l1", name: "Car loan", type: "loan", lender: "Zenith Bank", monthlyPayment: 500, currency: "USD" };
const salary: IncomeStream = {
  id: "s1", kind: "salary", label: "Job", source_name: "", amount: 5000, currency: "USD", frequency: "monthly",
  pay_day: 25, pay_month: null, start_date: "2025-01-01", end_date: null, notes: "",
};
const settings = DEFAULT_SETTINGS;

describe("months and settings", () => {
  it("lists complete months before the as-of month, oldest first", () => {
    expect(lastCompleteMonths("2026-10-09", 3)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(lastCompleteMonths("2026-02-01", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
  it("normalises untrusted settings", () => {
    const s = normalizeSettings({ lookback: 99, emergencyMonths: 1, divertPct: 50, overrides: { a: "essential", b: "x" }, manualMonthlyExpenses: -5, exclusions: { ownTransfers: false } });
    expect(s.lookback).toBe(12);
    expect(s.emergencyMonths).toBe(3);
    expect(s.divertPct).toBe(20);
    expect(s.overrides).toEqual({ a: "essential" });
    expect(s.manualMonthlyExpenses).toBeNull();
    expect(s.exclusions).toEqual({ ownTransfers: false, liabilityPayments: true, cardSettlements: true });
    expect(normalizeSettings("junk")).toEqual(DEFAULT_SETTINGS);
  });
});

describe("own-transfer detection", () => {
  it("pairs opposite amounts on the same day across two accounts, once each", () => {
    const txs = [tx("2026-09-03", -1000, "x", "a1"), tx("2026-09-03", 1000, "y", "a2"), tx("2026-09-03", -1000, "z", "a1")];
    expect([...detectOwnTransferPairs(txs)].sort()).toEqual([0, 1]);
  });
  it("does not pair the same account, other days or other currencies", () => {
    expect(detectOwnTransferPairs([tx("2026-09-03", -10, "a", "a1"), tx("2026-09-03", 10, "b", "a1")]).size).toBe(0);
    expect(detectOwnTransferPairs([tx("2026-09-03", -10, "a", "a1"), tx("2026-09-04", 10, "b", "a2")]).size).toBe(0);
    expect(detectOwnTransferPairs([tx("2026-09-03", -10, "a", "a1"), tx("2026-09-03", 10, "b", "a2", "EUR")]).size).toBe(0);
  });
  it("detects explicit own-account text but not a bare transfer", () => {
    const c = classifyTransactions([tx("2026-09-03", -50, "Transfer between my accounts"), tx("2026-09-03", -70, "Transfer to John Smith")], [], "USD", rates);
    expect(c[0].reason).toBe("own_transfer_text");
    expect(c[1].reason).toBeNull();
  });
});

describe("liability payments and card settlements", () => {
  it("matches by lender name with a close amount, or loan wording with an exact amount", () => {
    expect(matchLiabilityPayment(tx("2026-09-05", -505, "ZENITH BANK DIRECT DEBIT"), [loan], rates)?.id).toBe("l1");
    expect(matchLiabilityPayment(tx("2026-09-05", -500, "Loan instalment 123"), [loan], rates)?.id).toBe("l1");
  });
  it("does not match an equal amount without supporting text, or a far amount", () => {
    expect(matchLiabilityPayment(tx("2026-09-05", -500, "Gym membership"), [loan], rates)).toBeNull();
    expect(matchLiabilityPayment(tx("2026-09-05", -900, "Zenith Bank"), [loan], rates)).toBeNull();
    expect(matchLiabilityPayment(tx("2026-09-05", 500, "Loan instalment"), [loan], rates)).toBeNull();
  });
  it("compares across currencies through the FX table", () => {
    expect(matchLiabilityPayment(tx("2026-09-05", -250, "Loan repayment", "a1", "EUR"), [loan], rates)?.id).toBe("l1");
  });
  it("flags card settlements", () => {
    const c = classifyTransactions([tx("2026-09-05", -800, "CREDIT CARD PAYMENT VISA"), tx("2026-09-05", -30, "Card purchase Cafe")], [], "USD", rates);
    expect(c[0].reason).toBe("card_settlement");
    expect(c[1].reason).toBeNull();
  });
});

describe("classification", () => {
  it("recognises English, French and Arabic transliterations", () => {
    for (const d of ["Monthly rent", "LOYER octobre", "EJARI payment", "DEWA bill", "Etisalat", "Carrefour Market", "AXA assurance", "School tuition", "Life Pharmacy", "ADNOC fuel", "du mobile bill"]) {
      expect(classifyExpense(d).class, d).toBe("essential");
    }
    expect(classifyExpense("Netflix").class).toBe("discretionary");
    expect(classifyExpense("Paiement du restaurant").class).toBe("discretionary");
  });
  it("applies the per-merchant override and builds stable keys", () => {
    expect(merchantKey("POS 1234 Netflix.com 55-12")).toBe("netflix com");
    expect(classifyExpense("Netflix", { netflix: "essential" })).toMatchObject({ class: "essential", overridden: true });
    expect(classifyExpense("Carrefour", { carrefour: "discretionary" }).class).toBe("discretionary");
  });
});

describe("expense analysis", () => {
  const months = ["2026-07", "2026-08", "2026-09"];
  const txs = [
    tx("2026-07-02", -1000, "Rent"), tx("2026-08-02", -1000, "Rent"), tx("2026-09-02", -1000, "Rent"),
    tx("2026-08-10", -300, "Netflix and fun"), tx("2026-09-10", -600, "Credit card payment"),
    tx("2026-09-12", -500, "Zenith Bank"), tx("2026-09-20", 4000, "Salary"),
  ];
  const run = (over = {}) => analyseExpenses(classifyTransactions(txs, [loan], "USD", rates), months, { ...settings, ...over });

  it("averages counted outflows over months with data and excludes the rest", () => {
    const a = run();
    expect(a.monthsWithData).toBe(3);
    expect(a.monthlyEssential).toBeCloseTo(1000);
    expect(a.monthlyDiscretionary).toBeCloseTo(100);
    expect(a.monthlyTotal).toBeCloseTo(1100);
    expect(a.exclusions.find((e) => e.reason === "card_settlement")).toMatchObject({ count: 1, enabled: true });
    expect(a.exclusions.find((e) => e.reason === "liability_payment")?.monthlyAvg).toBeCloseTo(500 / 3);
  });
  it("counts an exclusion as an expense when its toggle is off", () => {
    const a = run({ exclusions: { ownTransfers: true, liabilityPayments: false, cardSettlements: true } });
    expect(a.monthlyTotal).toBeCloseTo(1100 + 500 / 3);
  });
  it("divides by the months that have data, not by N", () => {
    const a = analyseExpenses(classifyTransactions([tx("2026-09-02", -900, "Rent")], [], "USD", rates), months, settings);
    expect(a.monthsWithData).toBe(1);
    expect(a.monthlyTotal).toBeCloseTo(900);
    expect(a.perMonth["2026-07"]).toBeNull();
  });
  it("converts mixed currencies to the base currency", () => {
    const a = analyseExpenses(classifyTransactions([tx("2026-09-02", -500, "Rent", "a1", "EUR")], [], "USD", rates), months, settings);
    expect(a.monthlyTotal).toBeCloseTo(1000);
  });
  it("falls back to the manual estimate and essential share without transactions", () => {
    const a = analyseExpenses([], months, { ...settings, manualMonthlyExpenses: 2000, fallbackEssentialPct: 60 });
    expect(a).toMatchObject({ source: "manual", monthlyTotal: 2000, monthlyEssential: 1200 });
    expect(analyseExpenses([], months, settings)).toMatchObject({ source: "none", monthlyTotal: null, monthlyEssential: null });
  });
});

describe("emergency fund", () => {
  it("target is months x (essential + liabilities) with months clamped to 3-6", () => {
    expect(emergencyTarget(6, 1000, 500)).toBe(9000);
    expect(emergencyTarget(1, 1000, 500)).toBe(4500);
    expect(emergencyTarget(9, 1000, 500)).toBe(9000);
    expect(emergencyTarget(6, null, 500)).toBeNull();
  });
  it("diverts the percentage, never above the gap, never negative; funded unlocks everything", () => {
    expect(applyDiversion(1000, 5000, 15)).toEqual({ diversion: 150, free: 850 });
    expect(applyDiversion(1000, 100, 15)).toEqual({ diversion: 100, free: 900 });
    expect(applyDiversion(1000, 0, 15)).toEqual({ diversion: 0, free: 1000 });
    expect(applyDiversion(-200, 5000, 15)).toEqual({ diversion: 0, free: 0 });
    expect(applyDiversion(1000, 5000, 99).diversion).toBe(200);
    expect(applyDiversion(null, 5000, 15)).toEqual({ diversion: null, free: null });
  });
  it("counts only marked, liquid instant-access accounts", () => {
    expect(isLiquidInstantAccess({ accountType: "savings" })).toBe(true);
    expect(isLiquidInstantAccess({ accountType: "term_deposit" })).toBe(false);
    const ef = buildEmergencyFund({
      accounts: [
        { id: "c", name: "Current", currency: "USD", balance: 2000, accountType: "checking" },
        { id: "t", name: "Deposit", currency: "USD", balance: 9000, accountType: "term_deposit" },
        { id: "s", name: "Savings", currency: "EUR", balance: 1000, purpose: "emergency_fund" },
        { id: "o", name: "Other", currency: "USD", balance: 500 },
      ],
      markedIds: ["c", "t"], months: 6, essentialMonthly: 1000, liabilitiesMonthly: 500, net: 1000, divertPct: 15, base: "USD", rates,
    });
    expect(ef.current).toBe(4000); // 2000 + 1000 EUR (= 2000 USD)
    expect(ef.accounts.find((a) => a.id === "t")?.reason).toBe("not_liquid");
    expect(ef.target).toBe(9000);
    expect(ef.gap).toBe(5000);
    expect(ef.progress).toBeCloseTo(4000 / 9000);
    expect(ef.diversion).toBe(150);
    expect(ef.monthsToFund).toBe(34);
    expect(ef.funded).toBe(false);
  });
  it("is funded when current reaches the target", () => {
    const ef = buildEmergencyFund({
      accounts: [{ id: "c", name: "C", currency: "USD", balance: 20000, accountType: "savings" }],
      markedIds: ["c"], months: 3, essentialMonthly: 1000, liabilitiesMonthly: 0, net: 800, divertPct: 15, base: "USD", rates,
    });
    expect(ef).toMatchObject({ funded: true, gap: 0, progress: 1, diversion: 0, freeToInvest: 800, monthsToFund: 0 });
  });
  it("has unknown values when the essential expenses are unknown", () => {
    const ef = buildEmergencyFund({ accounts: [], markedIds: [], months: 6, essentialMonthly: null, liabilitiesMonthly: 500, net: null, divertPct: 15, base: "USD", rates });
    expect(ef).toMatchObject({ target: null, gap: null, progress: null, diversion: null, monthsToFund: null });
  });
});

describe("whole waterfall", () => {
  const txs: WaterfallTransaction[] = [];
  for (const m of ["2026-07", "2026-08", "2026-09"]) {
    txs.push(tx(`${m}-02`, -1000, "Rent"), tx(`${m}-12`, -500, "Zenith Bank loan"), tx(`${m}-15`, -500, "Shopping mall"));
  }
  const build = (over = {}) =>
    buildCashFlowWaterfall({
      streams: [salary], liabilities: [loan], transactions: txs,
      accounts: [{ id: "c", name: "Savings", currency: "USD", balance: 1000, accountType: "savings" }],
      settings: { ...DEFAULT_SETTINGS, emergencyAccountIds: ["c"], ...over }, base: "USD", rates, asOf: "2026-10-09",
    });

  it("computes net investable cash = income - liabilities - expenses", () => {
    const wf = build();
    expect(wf.income).toBe(5000);
    expect(wf.liabilities).toBe(500);
    expect(wf.expenses.monthlyTotal).toBeCloseTo(1500);
    expect(wf.net).toBeCloseTo(3000);
    expect(wf.steps.map((s) => s.id)).toEqual(["income", "liabilities", "expenses", "net", "diversion", "free"]);
    expect(wf.emergency.target).toBeCloseTo(6 * (1000 + 500));
    expect(wf.emergency.diversion).toBeCloseTo(450);
    expect(wf.steps[5].value).toBeCloseTo(2550);
  });
  it("builds a 12-month series with unknown expenses as null", () => {
    const wf = build();
    expect(wf.series).toHaveLength(12);
    expect(wf.series[0].month).toBe("2025-10");
    expect(wf.series[0].net).toBeNull();
    expect(wf.series[11]).toMatchObject({ month: "2026-09", income: 5000, liabilities: 500 });
    expect(wf.series[11].net).toBeCloseTo(3000);
  });
  it("reports one-offs apart from the run-rate", () => {
    const bonus: IncomeStream = { ...salary, id: "b", kind: "bonus", amount: 12000, frequency: "one_off", pay_month: 12, pay_day: 10, start_date: "2026-10-01" };
    const wf = buildCashFlowWaterfall({ streams: [salary, bonus], liabilities: [], transactions: [], accounts: [], settings, base: "USD", rates, asOf: "2026-10-09" });
    expect(wf.income).toBe(5000);
    expect(wf.oneOffNext12).toBe(12000);
  });
  it("shows unknowns without income or transactions", () => {
    const wf = buildCashFlowWaterfall({ streams: [], liabilities: [], transactions: [], accounts: [], settings, base: "USD", rates, asOf: "2026-10-09" });
    expect(wf.net).toBeNull();
    expect(wf.steps.find((s) => s.id === "income")?.value).toBeNull();
    expect(wf.steps.find((s) => s.id === "expenses")?.value).toBeNull();
  });
  it("sums liabilities in the base currency", () => {
    expect(plannedLiabilitiesMonthly([loan, { ...loan, id: "l2", monthlyPayment: 100, currency: "EUR" }], "USD", rates)).toBeCloseTo(700);
  });
});

describe("splitAssets", () => {
  it("reads liability payments, mortgage payments and cash accounts", () => {
    const { liabilities, accounts } = splitAssets([
      { id: "1", name: "Loan", currency: "AED", current_value: 100, is_liability: true, metadata: { liability_type: "loan", lender_name: "CBD", monthly_payment: 2000 }, asset_categories: { name: "Liabilities" } },
      { id: "2", name: "Card", currency: "AED", current_value: 100, is_liability: true, metadata: { liability_type: "credit_card" }, asset_categories: { name: "Liabilities" } },
      { id: "3", name: "Flat", currency: "AED", current_value: 100, is_liability: false, metadata: { linked_loan: { monthly_payment: 4000 } }, asset_categories: { name: "Real Estate" } },
      { id: "4", name: "Current", currency: "AED", current_value: "1500.5", is_liability: false, metadata: { account_type: "checking" }, asset_categories: { name: "Cash" } },
    ]);
    expect(liabilities.map((l) => [l.id, l.monthlyPayment])).toEqual([["1", 2000], ["3", 4000]]);
    expect(accounts).toEqual([{ id: "4", name: "Current", currency: "AED", balance: 1500.5, accountType: "checking", purpose: undefined }]);
  });
});
