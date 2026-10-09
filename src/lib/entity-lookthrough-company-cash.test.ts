import { describe, expect, it } from "vitest";
import {
  buildEntityLookthrough,
  buildHoldingOptions,
  flattenEntities,
  type LookthroughAssetRow,
} from "@/lib/entity-lookthrough";
import { convertToBaseCurrency } from "@/lib/fx";
import { assetLiability, grossAssetValue } from "@/lib/liabilities";

// Invented fixtures only.
const RATES = { USD: 1, EUR: 0.8, AED: 4 };

const row = (id: string, category: string, current_value: number, over: Partial<LookthroughAssetRow> = {}): LookthroughAssetRow => ({
  id,
  name: `Asset ${id}`,
  category,
  currency: "USD",
  current_value,
  is_liability: false,
  metadata: null,
  ...over,
});
const entity = (id: string, md: Record<string, unknown> = {}, current_value = 0) =>
  row(id, "Companies", current_value, { name: `Entity ${id}`, metadata: { ownership_percentage: 100, ...md } });
const companyCash = (id: string, companyId: string, value: number, over: Partial<LookthroughAssetRow> = {}) =>
  row(id, "Cash", value, { metadata: { company_id: companyId }, ...over });

function dashboardNetWorth(rows: LookthroughAssetRow[], base: string) {
  let assets = 0;
  let debts = 0;
  for (const r of rows) {
    const a = { current_value: r.current_value, is_liability: r.is_liability, metadata: r.metadata, asset_categories: { name: r.category } };
    if (!r.is_liability) assets += convertToBaseCurrency(grossAssetValue(a), r.currency, base, RATES);
    debts += convertToBaseCurrency(assetLiability(a), r.currency, base, RATES);
  }
  return assets - debts;
}

const build = (assets: LookthroughAssetRow[], baseCurrency = "USD") => buildEntityLookthrough({ assets, baseCurrency, rates: RATES });
const find = (lt: ReturnType<typeof build>, id: string) => flattenEntities(lt.roots).find((e) => e.id === id)!;

describe("look-through with company bank accounts", () => {
  it("keeps a company account under its company (no held_asset_ids needed) and adds it to the subtotal", () => {
    const rows = [entity("co", {}, 1000), companyCash("c1", "co", 250), row("p", "Cash", 100)];
    const lt = build(rows);
    const co = find(lt, "co");
    expect(co.holdings.map((h) => h.id)).toEqual(["c1"]);
    expect(co.holdings[0].isCompanyAccount).toBe(true);
    expect(co.ownValue).toBe(1000);
    expect(co.companyCash).toBe(250);
    expect(co.subtotal).toBe(1250);
    expect(co.breakdown.find((b) => b.category === "Cash")?.value).toBe(250);
    expect(lt.holderByAssetId).toEqual({ c1: "co" });
    expect(lt.heldPersonally).toBe(100);
    expect(lt.companyCash).toBe(250);
  });

  it("totals still reconcile to the dashboard net worth (company cash included, never twice)", () => {
    const rows = [
      entity("co", {}, 1000),
      companyCash("c1", "co", 250),
      companyCash("c2", "co", 80, { currency: "EUR" }),
      row("p", "Cash", 100),
      row("loan", "Liabilities", 40, { is_liability: true }),
    ];
    const lt = build(rows, "AED");
    expect(lt.netWorth).toBeCloseTo(dashboardNetWorth(rows, "AED"), 8);
    expect(lt.heldThroughStructures + lt.heldPersonally).toBeCloseTo(lt.netWorth, 8);
    expect(lt.companyCash).toBeCloseTo(250 * 4 + (80 / 0.8) * 4, 8);
  });

  it("company_id wins: the same account in another entity's held_asset_ids is reported as a duplicate and kept once", () => {
    const rows = [
      entity("a", { held_asset_ids: ["c1"] }),
      entity("b", {}),
      companyCash("c1", "b", 300),
    ];
    const lt = build(rows);
    expect(lt.holderByAssetId).toEqual({ c1: "b" });
    expect(find(lt, "a").holdings).toEqual([]);
    expect(find(lt, "b").holdings.map((h) => h.id)).toEqual(["c1"]);
    expect(lt.warnings).toEqual([
      expect.objectContaining({ kind: "duplicate_link", assetId: "c1", entityId: "a", keptEntityId: "b" }),
    ]);
    // no double count
    expect(lt.heldThroughStructures + lt.heldPersonally).toBeCloseTo(lt.netWorth, 10);
    expect(lt.heldThroughStructures).toBe(300);
  });

  it("the same entity listing its own company account is silently merged (no warning, kept once)", () => {
    const rows = [entity("co", { held_asset_ids: ["c1", "v"] }, 500), companyCash("c1", "co", 120), row("v", "Real Estate", 900)];
    const lt = build(rows);
    const co = find(lt, "co");
    expect(co.holdings.map((h) => h.id)).toEqual(["c1", "v"]);
    expect(lt.warnings).toEqual([]);
    expect(co.subtotal).toBe(500 + 120 + 900);
    expect(lt.netWorth).toBe(1520);
    expect(lt.heldThroughStructures).toBe(1520);
  });

  it("the double-count note only concerns links typed in held_asset_ids, not company accounts", () => {
    expect(find(build([entity("co", {}, 1000), companyCash("c1", "co", 5)]), "co").possibleDoubleCount).toBe(false);
    expect(
      find(build([entity("co", { held_asset_ids: ["v"] }, 1000), companyCash("c1", "co", 5), row("v", "Real Estate", 10)]), "co")
        .possibleDoubleCount,
    ).toBe(true);
  });

  it("an orphan company_id (no such company) leaves the account personal", () => {
    const lt = build([entity("co", {}, 10), companyCash("c1", "missing", 70)]);
    expect(lt.companyCash).toBe(0);
    expect(lt.holderByAssetId).toEqual({});
    expect(lt.heldPersonally).toBe(70);
  });

  it("rolls company cash of sub-entities up in companyCashSubtotal", () => {
    const rows = [
      entity("holdco", {}, 0),
      entity("opco", { held_via: "holding", holding_company_id: "holdco" }, 400),
      companyCash("c1", "holdco", 10),
      companyCash("c2", "opco", 30),
    ];
    const lt = build(rows);
    expect(find(lt, "holdco").companyCash).toBe(10);
    expect(find(lt, "holdco").companyCashSubtotal).toBe(40);
    expect(find(lt, "opco").companyCash).toBe(30);
    expect(lt.companyCash).toBe(40);
    expect(find(lt, "holdco").subtotal).toBe(440);
  });

  it("a liability or a non-Cash asset with company_id is not a company account", () => {
    const rows = [
      entity("co", {}, 0),
      row("card", "Liabilities", 50, { is_liability: true, metadata: { company_id: "co" } }),
      row("eq", "Equities", 60, { metadata: { company_id: "co" } }),
    ];
    const lt = build(rows);
    expect(lt.companyCash).toBe(0);
    expect(find(lt, "co").holdings).toEqual([]);
  });

  it("company accounts are not offered in the Manage holdings checklist", () => {
    const rows = [entity("co", {}, 0), companyCash("c1", "co", 10), row("p", "Cash", 5)];
    const lt = build(rows);
    expect(buildHoldingOptions(rows, lt).map((o) => o.id)).toEqual(["p"]);
  });
});
