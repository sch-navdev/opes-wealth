import { describe, expect, it } from "vitest";
import {
  AV_HOLDINGS_TOLERANCE,
  AV_MAX_HOLDINGS,
  AV_METADATA_VERSION,
  deriveAllocationFromHoldings,
  getAssuranceVieMetadataErrors,
  getHoldingRowErrors,
  getHoldingsErrors,
  getHoldingsWarnings,
  holdingsByType,
  holdingsTotal,
  isBlankHolding,
  isValidIsin,
  parseAssuranceVieMetadata,
  parseHoldings,
  reconcileHoldings,
  allocationIsDerived,
  withDerivedAllocation,
  EMPTY_ASSURANCE_VIE_METADATA,
  type AvHolding,
} from "@/lib/assurance-vie";

const TODAY = "2026-10-09";
const h = (over: Partial<AvHolding> = {}): AvHolding => ({
  id: "x",
  type: "fund_opcvm",
  name: "Fund A",
  isin: "",
  ticker: "",
  units: null,
  unit_price: null,
  value: 100,
  as_of: "",
  ...over,
});

describe("parseHoldings", () => {
  it("never throws and returns [] for non-arrays", () => {
    for (const bad of [null, undefined, 5, "x", {}, true]) expect(parseHoldings(bad)).toEqual([]);
  });

  it("sanitises rows, drops blank and malformed ones, upper-cases ISIN and falls back to 'other'", () => {
    const out = parseHoldings([
      { id: "a", type: "etf", name: " World ETF ", isin: "ie00b4l5y983", ticker: "iwda", units: 2, unit_price: 50, value: 100.456, as_of: "2026-01-31" },
      { id: "b", type: "nonsense", name: "Mystery", value: 5, isin: "BAD", as_of: "2026-02-30", units: -1 },
      { id: "c", type: "bond", name: "", value: null },
      "garbage",
      null,
      { name: "No id", value: 1 },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ id: "a", type: "etf", name: "World ETF", isin: "IE00B4L5Y983", ticker: "IWDA", units: 2, unit_price: 50, value: 100.46, as_of: "2026-01-31" });
    expect(out[1]).toMatchObject({ type: "other", isin: "", as_of: "", units: null });
    expect(out[2].id).toBeTruthy();
  });

  it("caps the list", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ id: `i${i}`, name: `N${i}`, value: 1 }));
    expect(parseHoldings(many)).toHaveLength(AV_MAX_HOLDINGS);
  });

  it("keeps a zero value and treats a default-only row as blank", () => {
    expect(parseHoldings([{ name: "Z", value: 0 }])[0].value).toBe(0);
    expect(isBlankHolding({ type: "etf", name: " ", isin: "", ticker: "", units: null, unit_price: null, value: null, as_of: "" })).toBe(true);
  });
});

describe("validators", () => {
  it("accepts valid rows and blank rows", () => {
    expect(getHoldingsErrors([h(), h({ isin: "FR0000120271", as_of: "2026-10-09", units: 1, unit_price: 100 })], TODAY)).toEqual([]);
    expect(getHoldingsErrors([{ type: "etf", name: "", value: null }], TODAY)).toEqual([]);
    expect(getHoldingsErrors(undefined, TODAY)).toEqual([]);
  });

  it("reports each problem with its code", () => {
    expect(getHoldingRowErrors(h({ name: "" }), TODAY)).toEqual(["av_hold_err_name"]);
    expect(getHoldingRowErrors(h({ value: null }), TODAY)).toEqual(["av_hold_err_value"]);
    expect(getHoldingRowErrors({ name: "A", value: -1 }, TODAY)).toContain("av_hold_err_value");
    expect(getHoldingRowErrors(h({ units: -2 }), TODAY)).toEqual(["av_hold_err_units"]);
    expect(getHoldingRowErrors(h({ unit_price: -2 }), TODAY)).toEqual(["av_hold_err_price"]);
    expect(getHoldingRowErrors(h({ isin: "XX123" }), TODAY)).toEqual(["av_hold_err_isin"]);
    expect(getHoldingRowErrors(h({ as_of: "2026-13-01" }), TODAY)).toEqual(["av_hold_err_date"]);
    expect(getHoldingRowErrors(h({ as_of: "2099-01-01" }), TODAY)).toEqual(["av_hold_err_date_future"]);
    expect(getHoldingRowErrors({ type: "nope", name: "A", value: 1 }, TODAY)).toEqual(["av_hold_err_type"]);
    expect(getHoldingRowErrors("x", TODAY)).toEqual(["av_hold_err_row"]);
  });

  it("flags too many rows and a non-array, de-duplicating codes", () => {
    expect(getHoldingsErrors(Array.from({ length: AV_MAX_HOLDINGS + 1 }, () => h()), TODAY)).toEqual(["av_hold_err_count"]);
    expect(getHoldingsErrors("no", TODAY)).toEqual(["av_hold_err_invalid"]);
    expect(getHoldingsErrors([h({ name: "" }), h({ name: "" })], TODAY)).toEqual(["av_hold_err_name"]);
  });

  it("feeds the contract validator", () => {
    expect(getAssuranceVieMetadataErrors({ ...EMPTY_ASSURANCE_VIE_METADATA, holdings: [h({ name: "" })] }, TODAY)).toContain("av_hold_err_name");
    expect(getAssuranceVieMetadataErrors({ ...EMPTY_ASSURANCE_VIE_METADATA, holdings: [h()] }, TODAY)).toEqual([]);
  });

  it("isValidIsin checks the format only", () => {
    expect(isValidIsin("FR0000120271")).toBe(true);
    expect(isValidIsin("fr0000120271")).toBe(false);
    expect(isValidIsin("FR000012027")).toBe(false);
  });

  it("warns (never blocks) on duplicate ISINs and units x price mismatches", () => {
    expect(getHoldingsWarnings([h({ isin: "FR0000120271" }), h({ isin: "FR0000120271" })])).toEqual(["av_hold_warn_duplicate_isin"]);
    expect(getHoldingsWarnings([h({ units: 2, unit_price: 50, value: 100 })])).toEqual([]);
    expect(getHoldingsWarnings([h({ units: 2, unit_price: 50, value: 150 })])).toEqual(["av_hold_warn_value_mismatch"]);
  });
});

describe("totals, by type, reconciliation", () => {
  const list = [h({ type: "euro_fund", value: 600 }), h({ type: "etf", value: 300 }), h({ type: "etf", value: 100 }), h({ type: "cash_balance", value: null })];

  it("totals only positive finite values", () => {
    expect(holdingsTotal(list)).toBe(1000);
    expect(holdingsTotal([])).toBe(0);
  });

  it("groups by type, largest first, with shares", () => {
    const rows = holdingsByType(list);
    expect(rows.map((r) => r.type)).toEqual(["euro_fund", "etf"]);
    expect(rows[1]).toMatchObject({ total: 400, count: 2 });
    expect(rows[0].share).toBeCloseTo(0.6);
  });

  it("reconciles: none / match / under / over / no contract value", () => {
    expect(reconcileHoldings([], 100)).toEqual({ state: "none" });
    expect(reconcileHoldings(list, 1000)).toMatchObject({ state: "match", difference: 0 });
    expect(reconcileHoldings(list, 1000 + AV_HOLDINGS_TOLERANCE)).toMatchObject({ state: "match" });
    expect(reconcileHoldings(list, 1200)).toMatchObject({ state: "under", difference: -200, holdingsTotal: 1000 });
    expect(reconcileHoldings(list, 900)).toMatchObject({ state: "over", difference: 100 });
    expect(reconcileHoldings(list, null)).toMatchObject({ contractValue: null, difference: null });
    expect(reconcileHoldings(list, Number.NaN)).toMatchObject({ contractValue: null });
  });
});

describe("derived allocation", () => {
  it("is null without a total (manual percentages stay)", () => {
    expect(deriveAllocationFromHoldings([])).toBeNull();
    expect(deriveAllocationFromHoldings([h({ value: null })])).toBeNull();
    const md = { ...EMPTY_ASSURANCE_VIE_METADATA, euro_fund_pct: 40, uc_pct: 60 };
    expect(allocationIsDerived(md)).toBe(false);
    expect(withDerivedAllocation(md)).toBe(md);
  });

  it("splits euro fund vs everything else, always totalling 100", () => {
    expect(deriveAllocationFromHoldings([h({ type: "euro_fund", value: 700 }), h({ type: "etf", value: 200 }), h({ type: "cash_balance", value: 100 })])).toEqual({ euro_fund_pct: 70, uc_pct: 30 });
    expect(deriveAllocationFromHoldings([h({ type: "euro_fund", value: 1 }), h({ type: "bond", value: 2 })])).toEqual({ euro_fund_pct: 33.33, uc_pct: 66.67 });
    expect(deriveAllocationFromHoldings([h({ type: "etf", value: 5 })])).toEqual({ euro_fund_pct: 0, uc_pct: 100 });
  });

  it("parse overrides stored percentages when holdings exist", () => {
    const md = parseAssuranceVieMetadata({ euro_fund_pct: 10, uc_pct: 90, holdings: [{ id: "a", type: "euro_fund", name: "Fonds euro", value: 500 }, { id: "b", type: "etf", name: "ETF", value: 500 }] });
    expect(md.euro_fund_pct).toBe(50);
    expect(md.uc_pct).toBe(50);
    expect(allocationIsDerived(md)).toBe(true);
  });
});

describe("backwards compatibility", () => {
  it("loads a v1 record unchanged, with no holdings and its manual percentages", () => {
    const v1 = { version: 1, insurer: "Old Insurer", euro_fund_pct: 80, uc_pct: 20, household: "couple", opened_on: "2015-05-05", beneficiaries: [{ id: "b1", name: "Alex", share_pct: 100 }] };
    const md = parseAssuranceVieMetadata(v1);
    expect(md).toMatchObject({ version: AV_METADATA_VERSION, insurer: "Old Insurer", euro_fund_pct: 80, uc_pct: 20, household: "couple", opened_on: "2015-05-05", holdings: [] });
    expect(md.beneficiaries).toHaveLength(1);
    expect(getAssuranceVieMetadataErrors(v1, TODAY)).toEqual([]);
  });

  it("is idempotent with holdings and does not share the empty array", () => {
    const once = parseAssuranceVieMetadata({ holdings: [{ id: "a", type: "etf", name: "E", isin: "IE00B4L5Y983", value: 10 }] });
    expect(parseAssuranceVieMetadata(once)).toEqual(once);
    parseAssuranceVieMetadata(null).holdings.push(h());
    expect(parseAssuranceVieMetadata(null).holdings).toHaveLength(0);
  });
});
