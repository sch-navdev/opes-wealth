import { describe, expect, it } from "vitest";
import {
  DATA_QUALITY_CONFIG,
  DATA_QUALITY_KINDS,
  compareIssues,
  countIssues,
  hasUsableRate,
  isoDayNumber,
  normalizeAssetName,
  runDataQualityChecks,
  staleThresholdDays,
  type DataQualityAsset,
  type DataQualityHistoryRow,
  type DataQualityInput,
  type DataQualityIssue,
} from "@/lib/data-quality";

// Invented fixtures only.
const TODAY = "2026-10-08";
const RATES = { USD: 1, EUR: 0.9, AED: 3.6725, GBP: 0.78 };

let seq = 0;
function asset(
  over: Partial<Omit<DataQualityAsset, "asset_categories">> & { category?: string | null } = {},
): DataQualityAsset {
  const { category = "Real Estate", ...rest } = over;
  seq += 1;
  return {
    id: `a${seq}`,
    name: `Asset ${seq}`,
    currency: "USD",
    current_value: 1000,
    is_liability: false,
    metadata: category === "Real Estate" ? { purchasePrice: 900 } : null,
    purchase_date: "2020-01-01",
    quantity: 1,
    asset_categories: category === null ? null : { name: category },
    ...rest,
  };
}

const row = (recorded_date: string, value = 1000): DataQualityHistoryRow => ({ recorded_date, value });

function run(
  assets: DataQualityAsset[],
  history: Record<string, DataQualityHistoryRow[]> = {},
  over: Partial<Omit<DataQualityInput, "assets" | "historyByAsset">> = {},
) {
  return runDataQualityChecks({
    assets,
    historyByAsset: new Map(Object.entries(history)),
    rates: RATES,
    fxSource: "live",
    baseCurrency: "USD",
    today: TODAY,
    ...over,
  });
}

/** History that makes an asset "freshly valued" today, so only the check under test fires. */
const fresh = (...list: DataQualityAsset[]) => Object.fromEntries(list.map((a) => [a.id, [row(TODAY, a.current_value)]]));

const kinds = (issues: DataQualityIssue[]) => issues.map((i) => i.kind);
const ofKind = (issues: DataQualityIssue[], kind: DataQualityIssue["kind"]) => issues.filter((i) => i.kind === kind);

describe("helpers", () => {
  it("parses ISO dates and timestamps, rejects impossible dates", () => {
    expect(isoDayNumber("1970-01-02")).toBe(1);
    expect(isoDayNumber("2026-10-08T23:59:59.000Z")).toBe(isoDayNumber("2026-10-08"));
    expect(isoDayNumber("2024-02-29")).not.toBeNull();
    expect(isoDayNumber("2023-02-29")).toBeNull();
    expect(isoDayNumber("2026-13-01")).toBeNull();
    expect(isoDayNumber("2026-1-1")).toBeNull();
    expect(isoDayNumber("")).toBeNull();
    expect(isoDayNumber(null)).toBeNull();
    expect(isoDayNumber(20261008)).toBeNull();
  });

  it("counts days across leap years exactly", () => {
    const d = (s: string) => isoDayNumber(s)!;
    expect(d("2024-03-01") - d("2024-02-28")).toBe(2);
    expect(d("2023-03-01") - d("2023-02-28")).toBe(1);
    expect(d("2024-03-01") - d("2023-03-01")).toBe(366);
    expect(d("2023-03-01") - d("2022-03-01")).toBe(365);
  });

  it("knows which rates convertAmount can use", () => {
    expect(hasUsableRate(RATES, "EUR")).toBe(true);
    expect(hasUsableRate(RATES, "XXX")).toBe(false);
    expect(hasUsableRate({ ZZZ: 0 }, "ZZZ")).toBe(false);
    expect(hasUsableRate({ ZZZ: Number.NaN }, "ZZZ")).toBe(false);
    expect(hasUsableRate({ ZZZ: -1 }, "ZZZ")).toBe(false);
    expect(hasUsableRate({}, "constructor")).toBe(false);
  });

  it("normalises names: case, accents, punctuation and spacing", () => {
    expect(normalizeAssetName("  Villa   Émeraude! ")).toBe("villa emeraude");
    expect(normalizeAssetName("VILLA-emeraude")).toBe("villa emeraude");
    expect(normalizeAssetName("!!!")).toBe("");
    expect(normalizeAssetName(undefined)).toBe("");
  });

  it("has one readable threshold per category", () => {
    expect(staleThresholdDays("Equities")).toBe(7);
    expect(staleThresholdDays("Crypto")).toBe(7);
    expect(staleThresholdDays("Precious Metals")).toBe(7);
    expect(staleThresholdDays("Cash")).toBe(45);
    expect(staleThresholdDays("Private Equity")).toBe(180);
    expect(staleThresholdDays("SCPI")).toBe(180);
    for (const c of ["Real Estate", "Vehicles", "Companies", "Assurance-Vie", "Startups", "Exotic Assets", "Anything", ""]) {
      expect(staleThresholdDays(c)).toBe(365);
    }
    expect(staleThresholdDays("constructor")).toBe(DATA_QUALITY_CONFIG.defaultStaleDays);
  });
});

describe("empty and clean input", () => {
  it("reports nothing for no assets, even with fallback rates and a base missing from the table", () => {
    const report = run([], {}, { fxSource: "fallback", baseCurrency: "XXX", rates: {} });
    expect(report.issues).toEqual([]);
    expect(report.counts).toEqual({ total: 0, high: 0, medium: 0, low: 0, byKind: {} });
  });

  it("reports nothing for a well-kept portfolio", () => {
    const villa = asset({ name: "Villa", currency: "AED" });
    const cash = asset({ name: "Current account", category: "Cash", metadata: null });
    expect(run([villa, cash], fresh(villa, cash)).issues).toEqual([]);
  });
});

describe("fx_missing", () => {
  it("flags each asset whose currency has no rate (high), naming the currency and base", () => {
    const a = asset({ name: "Chalet", currency: "SEK" });
    const issues = run([a], fresh(a)).issues;
    expect(issues).toEqual([
      {
        id: `fx_missing:${a.id}`,
        kind: "fx_missing",
        severity: "high",
        assetId: a.id,
        assetName: "Chalet",
        category: "Real Estate",
        params: { currency: "SEK", base: "USD" },
      },
    ]);
  });

  it("matches convertAmount exactly: a lower-case code or an empty one is not in the table", () => {
    const lower = asset({ currency: "eur" });
    const empty = asset({ currency: "" });
    expect(ofKind(run([lower, empty], fresh(lower, empty)).issues, "fx_missing").map((i) => i.params.currency).sort()).toEqual(["", "eur"]);
  });

  it("treats zero / non-finite rates as missing and includes liabilities", () => {
    const loan = asset({ category: "Liabilities", is_liability: true, currency: "ZZZ", metadata: null });
    const issues = run([loan], {}, { rates: { ...RATES, ZZZ: 0 } }).issues;
    expect(kinds(issues)).toEqual(["fx_missing"]);
  });

  it("never flags an asset held in the base currency, even when the base has no rate", () => {
    const a = asset({ currency: "XAU" });
    expect(run([a], fresh(a), { baseCurrency: "XAU" }).issues).toEqual([]);
  });

  it("flags a base currency missing from the table once, globally, when something is converted", () => {
    const usd = asset({ currency: "USD" });
    const xau = asset({ currency: "XAU" });
    const issues = run([usd, xau], fresh(usd, xau), { baseCurrency: "XAU" }).issues;
    expect(issues).toEqual([
      { id: "fx_missing:base", kind: "fx_missing", severity: "high", params: { currency: "XAU", scope: "base" } },
    ]);
  });
});

describe("fx_fallback", () => {
  it("is reported once (medium, global) when approximate rates are in use and something is converted", () => {
    const a = asset({ currency: "EUR" });
    const b = asset({ currency: "AED" });
    const issues = run([a, b], fresh(a, b), { fxSource: "fallback" }).issues;
    expect(issues).toEqual([{ id: "fx_fallback:global", kind: "fx_fallback", severity: "medium", params: {} }]);
  });

  it("is not reported for live or mock rates, nor when every asset is in the base currency", () => {
    const eur = asset({ currency: "EUR" });
    expect(run([eur], fresh(eur), { fxSource: "live" }).issues).toEqual([]);
    expect(run([eur], fresh(eur), { fxSource: "mock" }).issues).toEqual([]);
    const usd = asset({ currency: "USD" });
    expect(run([usd], fresh(usd), { fxSource: "fallback" }).issues).toEqual([]);
  });
});

describe("stale_valuation / no_valuation_date", () => {
  it("uses the per-category threshold and turns medium past twice the threshold", () => {
    const at = asset({ name: "At limit", category: "Equities", quantity: 3, metadata: { trades: [{ side: "buy" }] } });
    const low = asset({ name: "Low", category: "Equities", quantity: 3, metadata: { trades: [{ side: "buy" }] } });
    const twice = asset({ name: "Twice", category: "Equities", quantity: 3, metadata: { trades: [{ side: "buy" }] } });
    const medium = asset({ name: "Medium", category: "Equities", quantity: 3, metadata: { trades: [{ side: "buy" }] } });
    const issues = run([at, low, twice, medium], {
      [at.id]: [row("2026-10-01")], // 7 days: not stale
      [low.id]: [row("2026-09-30")], // 8 days
      [twice.id]: [row("2026-09-24")], // 14 days = 2x: still low
      [medium.id]: [row("2026-09-23")], // 15 days
    }).issues;
    expect(issues.map((i) => [i.assetName, i.severity, i.params])).toEqual([
      ["Medium", "medium", { days: 15, threshold: 7, date: "2026-09-23" }],
      ["Low", "low", { days: 8, threshold: 7, date: "2026-09-30" }],
      ["Twice", "low", { days: 14, threshold: 7, date: "2026-09-24" }],
    ]);
  });

  it.each([
    ["Cash", 45, null],
    ["Private Equity", 180, null],
    ["SCPI", 180, null],
    ["Companies", 365, { valuation_date: "" }],
    ["Assurance-Vie", 365, null],
    ["Startups", 365, null],
    ["Exotic Assets", 365, null],
    [null, 365, null],
  ])("%s is stale one day past %i days", (category, threshold, metadata) => {
    const today = isoDayNumber(TODAY)!;
    const iso = (days: number) => new Date((today - days) * 86_400_000).toISOString().slice(0, 10);
    const ok = asset({ category, metadata });
    const stale = asset({ category, metadata });
    const issues = run([ok, stale], { [ok.id]: [row(iso(threshold))], [stale.id]: [row(iso(threshold + 1))] }).issues;
    expect(ofKind(issues, "stale_valuation").map((i) => i.assetId)).toEqual([stale.id]);
  });

  it("checks Real Estate against 365 days across a leap year", () => {
    const a = asset();
    const b = asset();
    // 2023-03-01 -> 2024-03-01 is 366 days (stale); 2022-03-01 -> 2023-03-01 is 365 (not).
    expect(kinds(run([a], { [a.id]: [row("2023-03-01")] }, { today: "2024-03-01" }).issues)).toEqual(["stale_valuation"]);
    expect(run([b], { [b.id]: [row("2022-03-01")] }, { today: "2023-03-01" }).issues).toEqual([]);
  });

  it("takes the newest of history and the category's own valuation date", () => {
    const today = { today: "2026-10-08" };
    const cases: [string, Record<string, unknown>][] = [
      ["Equities", { last_priced_at: "2026-10-07T18:00:00.000Z", trades: [{ side: "buy" }] }],
      ["Crypto", { last_priced_at: "2026-10-06T10:00:00Z" }],
      ["Precious Metals", { last_priced_at: "2026-10-05T10:00:00Z" }],
      ["Exotic Assets", { last_priced_at: "2026-01-05T10:00:00Z" }],
      ["Companies", { valuation_date: "2026-06-30" }],
      ["Vehicles", { purchase_price: 50000, blue_book_log: [{ id: "b1", date: "2026-05-01", amount: 40000, currency: "", source: "", document: "" }] }],
      ["Vehicles", { purchase_price: 50000, last_valuation_date: "2026-02-01" }],
      ["Private Equity", { nav_date: "2026-06-30" }],
      ["Startups", { funding_rounds: [{ id: "r1", date: "2025-12-01", name: "Seed", price_per_share: 2, post_money_valuation: null }] }],
    ];
    for (const [category, metadata] of cases) {
      const a = asset({ category, metadata, quantity: 5 });
      // History alone would be two years old.
      expect(run([a], { [a.id]: [row("2024-10-01")] }, today).issues, category).toEqual([]);
    }
  });

  it("uses history when it is newer than the metadata date", () => {
    const a = asset({ category: "Companies", metadata: { valuation_date: "2020-01-01" } });
    expect(run([a], { [a.id]: [row("2026-09-01")] }).issues).toEqual([]);
  });

  it("reports no_valuation_date (low) when there is no date at all, and ignores invalid dates", () => {
    const none = asset({ name: "None" });
    const invalid = asset({ name: "Invalid", category: "Companies", metadata: { valuation_date: "2023-02-29" } });
    const issues = run([none, invalid], { [invalid.id]: [row("not a date")] }).issues;
    expect(issues.map((i) => [i.assetName, i.kind, i.severity])).toEqual([
      ["Invalid", "no_valuation_date", "low"],
      ["None", "no_valuation_date", "low"],
    ]);
  });

  it("does not report a future-dated valuation as stale", () => {
    const a = asset();
    expect(run([a], { [a.id]: [row("2027-01-01")] }).issues).toEqual([]);
  });

  it("skips date checks (but not no_valuation_date) when today is not a valid date", () => {
    const old = asset({ name: "Old" });
    const none = asset({ name: "None" });
    const issues = run([old, none], { [old.id]: [row("2001-01-01")] }, { today: "garbage" }).issues;
    expect(kinds(issues)).toEqual(["no_valuation_date"]);
  });

  it("skips liabilities and closed equity positions", () => {
    const loan = asset({ category: "Liabilities", is_liability: true, current_value: 0, metadata: null });
    const closed = asset({ category: "Equities", quantity: 0, current_value: 0, metadata: { trades: [] } });
    expect(run([loan, closed], { [closed.id]: [row("2019-05-01", 0)] }).issues).toEqual([]);
  });

  it("survives malformed metadata (a parser throwing) as 'nothing recorded'", () => {
    const car = asset({ category: "Vehicles", metadata: { purchase_price: 1, blue_book_log: [{ amount: 1 }, null] } });
    const issues = run([car], {}).issues;
    expect(kinds(issues).sort()).toEqual(["missing_cost_basis", "no_valuation_date"]);
  });
});

describe("missing_cost_basis", () => {
  it("flags Real Estate without a purchase or contract price", () => {
    const none = asset({ name: "None", metadata: {} });
    const price = asset({ name: "Price", metadata: { purchasePrice: 500000 } });
    const contract = asset({ name: "Contract", metadata: { contract_price: 800000, is_offplan: true } });
    const text = asset({ name: "Text", metadata: { purchasePrice: "450000" } });
    const zero = asset({ name: "Zero", metadata: { purchasePrice: 0 } });
    const issues = run([none, price, contract, text, zero], fresh(none, price, contract, text, zero)).issues;
    expect(issues.map((i) => [i.assetName, i.kind, i.severity, i.params])).toEqual([
      ["None", "missing_cost_basis", "low", { basis: "purchase_price" }],
      ["Zero", "missing_cost_basis", "low", { basis: "purchase_price" }],
    ]);
  });

  it("flags Vehicles without a purchase price", () => {
    const none = asset({ name: "Coupe", category: "Vehicles", metadata: { make: "X" } });
    const ok = asset({ name: "Estate", category: "Vehicles", metadata: { purchase_price: 30000 } });
    expect(run([none, ok], fresh(none, ok)).issues.map((i) => i.assetName)).toEqual(["Coupe"]);
  });

  it("flags open Equities with no buy trades, not closed ones", () => {
    const sellOnly = asset({ name: "Sell only", category: "Equities", quantity: 10, metadata: { trades: [{ side: "sell", quantity: 2 }] } });
    const manual = asset({ name: "Manual", category: "Equities", quantity: 10, metadata: null });
    const bought = asset({ name: "Bought", category: "Equities", quantity: 10, metadata: { trades: [{ side: "buy", quantity: 10 }] } });
    const closed = asset({ name: "Closed", category: "Equities", quantity: 0, current_value: 0, metadata: null });
    const issues = run([sellOnly, manual, bought, closed], fresh(sellOnly, manual, bought, closed)).issues;
    expect(issues.map((i) => [i.assetName, i.params.basis])).toEqual([
      ["Manual", "trades"],
      ["Sell only", "trades"],
    ]);
  });

  it("does not ask a liability for a cost basis", () => {
    const debt = asset({ is_liability: true, metadata: {} });
    expect(run([debt], fresh(debt)).issues).toEqual([]);
  });
});

describe("cash_balance_mismatch", () => {
  const cash = (over: Partial<DataQualityAsset> = {}) => asset({ category: "Cash", metadata: null, ...over });

  it("flags a balance that differs from the latest history row (medium) with both amounts", () => {
    const a = cash({ name: "Savings", current_value: 5200, currency: "EUR" });
    const issues = run([a], { [a.id]: [row("2026-10-01", 5000), row("2026-09-01", 5200)] }).issues;
    expect(issues).toEqual([
      expect.objectContaining({
        kind: "cash_balance_mismatch",
        severity: "medium",
        params: { current: 5200, recorded: 5000, date: "2026-10-01", currency: "EUR" },
      }),
    ]);
  });

  it("tolerates max(1, 0.5 %) differences", () => {
    const small = cash({ current_value: 100.9 });
    const big = cash({ current_value: 1_004_000 });
    const over = cash({ current_value: 1_006_000 });
    const issues = run([small, big, over], {
      [small.id]: [row(TODAY, 100)],
      [big.id]: [row(TODAY, 1_000_000)],
      [over.id]: [row(TODAY, 1_000_000)],
    }).issues;
    expect(issues.map((i) => i.assetId)).toEqual([over.id]);
  });

  it("uses the later row on equal dates and ignores accounts with no history", () => {
    const a = cash({ current_value: 300 });
    const none = cash({ current_value: 300 });
    const issues = run([a, none], { [a.id]: [row(TODAY, 100), row(TODAY, 300)] }).issues;
    expect(kinds(issues)).toEqual(["no_valuation_date"]);
    expect(issues[0].assetId).toBe(none.id);
  });

  it("does not flag co-owned accounts whose balance and history are both scaled to the share", () => {
    // 50 % of 1,234.57 rounds to 617.29 (balance) and 617.285 (history): no mismatch.
    const a = cash({ current_value: 617.29 });
    expect(run([a], { [a.id]: [row(TODAY, 617.285)] }).issues).toEqual([]);
  });

  it("skips credit-card style liabilities", () => {
    const card = cash({ is_liability: true, current_value: 10 });
    expect(run([card], { [card.id]: [row(TODAY, 900)] }).issues).toEqual([]);
  });
});

describe("zero_value", () => {
  it("flags non-liability assets at zero, negative or no value", () => {
    const zero = asset({ name: "Zero", current_value: 0 });
    const negative = asset({ name: "Negative", current_value: -5 });
    const nan = asset({ name: "NaN", current_value: Number.NaN });
    const positive = asset({ name: "Positive", current_value: 0.01 });
    const issues = ofKind(run([zero, negative, nan, positive], fresh(zero, negative, nan, positive)).issues, "zero_value");
    expect(issues.map((i) => i.assetName)).toEqual(["NaN", "Negative", "Zero"]);
    expect(issues.every((i) => i.severity === "low")).toBe(true);
  });

  it("ignores liabilities and closed equity positions", () => {
    const loan = asset({ is_liability: true, current_value: 0 });
    const closed = asset({ category: "Equities", quantity: 0, current_value: 0, metadata: { trades: [{ side: "buy" }] } });
    expect(ofKind(run([loan, closed], fresh(loan, closed)).issues, "zero_value")).toEqual([]);
  });

  it("does not flag a small co-owned share of a positive value", () => {
    const share = asset({ current_value: 0.5 });
    expect(run([share], fresh(share)).issues).toEqual([]);
  });
});

describe("pe_overdue_call", () => {
  const fund = (calls: unknown[]) =>
    asset({ name: "Fund", category: "Private Equity", metadata: { nav_date: TODAY, capital_calls: calls } });

  it("counts pending calls past due and reports the earliest due date (medium)", () => {
    const a = fund([
      { id: "c1", due_date: "2026-03-31", amount: 10, percentage: 10, status: "pending" },
      { id: "c2", due_date: "2025-09-30", amount: 10, percentage: 10, status: "pending" },
      { id: "c3", due_date: "2025-03-31", amount: 10, percentage: 10, status: "paid" },
      { id: "c4", due_date: TODAY, amount: 10, percentage: 10, status: "pending" },
      { id: "c5", due_date: "2027-03-31", amount: 10, percentage: 10, status: "pending" },
      { id: "c6", due_date: "", amount: 10, percentage: 10, status: "pending" },
      null,
    ]);
    expect(run([a], fresh(a)).issues).toEqual([
      expect.objectContaining({ kind: "pe_overdue_call", severity: "medium", params: { count: 2, date: "2025-09-30" } }),
    ]);
  });

  it("reports nothing when every past call is paid", () => {
    const a = fund([{ id: "c1", due_date: "2025-01-01", amount: 10, percentage: 10, status: "paid" }]);
    expect(run([a], fresh(a)).issues).toEqual([]);
  });
});

describe("duplicate_suspect", () => {
  it("flags every asset of a group sharing normalised name, category and currency", () => {
    const a = asset({ name: "Palm Villa" });
    const b = asset({ name: "palm  villa." });
    const otherCurrency = asset({ name: "Palm Villa", currency: "EUR" });
    const otherCategory = asset({ name: "Palm Villa", category: "Companies", metadata: { valuation_date: TODAY } });
    const issues = ofKind(run([a, b, otherCurrency, otherCategory], fresh(a, b, otherCurrency, otherCategory)).issues, "duplicate_suspect");
    expect(issues.map((i) => i.assetId).sort()).toEqual([a.id, b.id].sort());
    expect(issues.every((i) => i.params.count === 2 && i.severity === "low")).toBe(true);
  });

  it("tells holdings apart by broker account, bank account and wallet", () => {
    const eq = (account_id: string) =>
      asset({ name: "Index Fund", category: "Equities", quantity: 1, metadata: { account_id, trades: [{ side: "buy" }] } });
    const bank = (institution_name: string) => asset({ name: "Current Account", category: "Cash", metadata: { institution_name } });
    const coin = (exchange_name: string) => asset({ name: "Bitcoin", category: "Crypto", metadata: { exchange_name } });
    const list = [eq("acc-1"), eq("acc-2"), bank("Bank A"), bank("Bank B"), coin("Exchange A"), coin("Ledger")];
    expect(ofKind(run(list, fresh(...list)).issues, "duplicate_suspect")).toEqual([]);
    const same = [bank("Bank A"), bank("bank a ")];
    expect(ofKind(run(same, fresh(...same)).issues, "duplicate_suspect")).toHaveLength(2);
  });

  it("ignores unnamed assets and closed equity positions", () => {
    const blank1 = asset({ name: "  " });
    const blank2 = asset({ name: "--" });
    const open = asset({ name: "Old Co", category: "Equities", quantity: 1, metadata: { trades: [{ side: "buy" }] } });
    const closed = asset({ name: "Old Co", category: "Equities", quantity: 0, current_value: 0, metadata: { trades: [{ side: "buy" }] } });
    expect(ofKind(run([blank1, blank2, open, closed], fresh(blank1, blank2, open, closed)).issues, "duplicate_suspect")).toEqual([]);
  });

  it("includes liabilities (two identical loans may be one debt counted twice)", () => {
    const l1 = asset({ name: "Car loan", category: "Liabilities", is_liability: true, metadata: null });
    const l2 = asset({ name: "Car Loan", category: "Liabilities", is_liability: true, metadata: null });
    expect(ofKind(run([l1, l2]).issues, "duplicate_suspect")).toHaveLength(2);
  });
});

describe("ordering and counts", () => {
  function portfolio() {
    seq = 100;
    const sek = asset({ name: "Zeta chalet", currency: "SEK" }); // high + others
    const stale = asset({ name: "Alpha flat" }); // stale (2 years: medium)
    const cash = asset({ name: "Bravo cash", category: "Cash", metadata: null, current_value: 10 }); // mismatch (medium)
    const car = asset({ name: "Car", category: "Vehicles", metadata: {} }); // cost basis (low)
    return {
      assets: [sek, stale, cash, car],
      history: {
        [sek.id]: [row(TODAY)],
        [stale.id]: [row("2024-09-01")],
        [cash.id]: [row(TODAY, 500)],
        [car.id]: [row(TODAY)],
      },
    };
  }

  it("sorts by severity, then category (global first), then name", () => {
    const { assets, history } = portfolio();
    const issues = run(assets, history, { fxSource: "fallback" }).issues;
    expect(issues.map((i) => [i.severity, i.kind, i.assetName ?? "(global)"])).toEqual([
      ["high", "fx_missing", "Zeta chalet"],
      ["medium", "fx_fallback", "(global)"],
      ["medium", "cash_balance_mismatch", "Bravo cash"],
      ["medium", "stale_valuation", "Alpha flat"],
      ["low", "missing_cost_basis", "Car"],
    ]);
  });

  it("is deterministic whatever the input order", () => {
    const { assets, history } = portfolio();
    const forward = run(assets, history, { fxSource: "fallback" });
    const backward = run([...assets].reverse(), history, { fxSource: "fallback" });
    expect(backward).toEqual(forward);
    expect(new Set(forward.issues.map((i) => i.id)).size).toBe(forward.issues.length);
  });

  it("counts by severity and by kind", () => {
    const { assets, history } = portfolio();
    const { issues, counts } = run(assets, history, { fxSource: "fallback" });
    expect(counts).toEqual({
      total: 5,
      high: 1,
      medium: 3,
      low: 1,
      byKind: { fx_missing: 1, fx_fallback: 1, cash_balance_mismatch: 1, stale_valuation: 1, missing_cost_basis: 1 },
    });
    expect(countIssues(issues)).toEqual(counts);
  });

  it("compareIssues breaks full ties by kind order, then id", () => {
    const base = { severity: "low" as const, category: "X", assetName: "Same", params: {} };
    const a: DataQualityIssue = { ...base, id: "zero_value:1", kind: "zero_value" };
    const b: DataQualityIssue = { ...base, id: "duplicate_suspect:1", kind: "duplicate_suspect" };
    const c: DataQualityIssue = { ...base, id: "duplicate_suspect:2", kind: "duplicate_suspect" };
    expect([c, b, a].sort(compareIssues).map((i) => i.id)).toEqual(["zero_value:1", "duplicate_suspect:1", "duplicate_suspect:2"]);
    expect(DATA_QUALITY_KINDS.indexOf("zero_value")).toBeLessThan(DATA_QUALITY_KINDS.indexOf("duplicate_suspect"));
  });
});
