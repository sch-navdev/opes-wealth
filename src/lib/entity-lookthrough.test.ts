import { describe, expect, it } from "vitest";
import {
  buildEntityLookthrough,
  buildHoldingOptions,
  flattenEntities,
  netWorthContribution,
  type LookthroughAssetRow,
  type LookthroughEntity,
} from "@/lib/entity-lookthrough";
import { convertToBaseCurrency } from "@/lib/fx";
import { assetLiability, grossAssetValue } from "@/lib/liabilities";

// Invented fixtures only.
const RATES = { USD: 1, EUR: 0.8, AED: 4 };

type Over = Partial<LookthroughAssetRow>;
const row = (id: string, category: string, current_value: number, over: Over = {}): LookthroughAssetRow => ({
  id,
  name: `Asset ${id}`,
  category,
  currency: "USD",
  current_value,
  is_liability: false,
  metadata: null,
  ...over,
});
const entity = (id: string, md: Record<string, unknown> = {}, current_value = 0, over: Over = {}) =>
  row(id, "Companies", current_value, { name: `Entity ${id}`, metadata: { ownership_percentage: 100, ...md }, ...over });
const liability = (id: string, current_value: number, over: Over = {}) =>
  row(id, "Liabilities", current_value, { is_liability: true, ...over });

/** Net worth the way the dashboard computes it: Σ gross (non-liability rows) − Σ liabilities, each in base. */
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
const byId = (roots: LookthroughEntity[], id: string) => flattenEntities(roots).find((e) => e.id === id)!;

describe("netWorthContribution", () => {
  it("is the gross value for an asset, negative for a liability, equity for a mortgaged property", () => {
    expect(netWorthContribution(row("a", "Cash", 100), "USD", RATES)).toBe(100);
    expect(netWorthContribution(liability("l", 40), "USD", RATES)).toBe(-40);
    const flat = row("p", "Real Estate", 600, {
      metadata: { market_valuation: 1000, linked_loan: { outstanding_principal: 400 } },
    });
    expect(netWorthContribution(flat, "USD", RATES)).toBe(600);
  });

  it("converts into the base currency", () => {
    expect(netWorthContribution(row("e", "Cash", 80, { currency: "EUR" }), "USD", RATES)).toBeCloseTo(100, 10);
    expect(netWorthContribution(row("e", "Cash", 80, { currency: "EUR" }), "AED", RATES)).toBeCloseTo(400, 10);
  });
});

describe("buildEntityLookthrough", () => {
  it("empty input: no entities, everything zero", () => {
    const r = build([]);
    expect(r.roots).toEqual([]);
    expect(r.entityCount).toBe(0);
    expect(r.warnings).toEqual([]);
    expect(r).toMatchObject({ heldThroughStructures: 0, heldPersonally: 0, netWorth: 0 });
  });

  it("no entities: everything is held personally and still reconciles", () => {
    const assets = [row("a", "Cash", 100), liability("l", 30)];
    const r = build(assets);
    expect(r.roots).toEqual([]);
    expect(r.heldPersonally).toBe(70);
    expect(r.heldThroughStructures).toBe(0);
    expect(r.netWorth).toBe(70);
  });

  it("nests 3 levels: trust -> holding -> SPV -> property + mortgage, with subtotals at every level", () => {
    const assets = [
      entity("trust", { entity_type: "trust", held_asset_ids: ["cash"] }, 0),
      entity("hold", { entity_type: "holding", held_via: "holding", holding_company_id: "trust" }, 0),
      entity("spv", { entity_type: "spv", held_via: "holding", holding_company_id: "hold", held_asset_ids: ["villa", "mortgage"] }, 0),
      row("villa", "Real Estate", 2_000_000),
      liability("mortgage", 800_000),
      row("cash", "Cash", 50_000),
      row("watch", "Exotic Assets", 10_000),
    ];
    const r = build(assets);
    expect(r.roots.map((e) => e.id)).toEqual(["trust"]);
    const trust = r.roots[0];
    const hold = trust.children[0];
    const spv = hold.children[0];
    expect([trust.depth, hold.depth, spv.depth]).toEqual([0, 1, 2]);
    expect(hold.id).toBe("hold");
    expect(spv.id).toBe("spv");
    expect(spv.entityType).toBe("spv");
    expect(trust.entityType).toBe("trust");

    expect(spv.holdings.map((h) => [h.id, h.value])).toEqual([
      ["villa", 2_000_000],
      ["mortgage", -800_000],
    ]);
    expect(spv.holdings[1].isLiability).toBe(true);
    expect(spv.subtotal).toBe(1_200_000);
    expect(hold.subtotal).toBe(1_200_000);
    expect(trust.holdingsValue).toBe(50_000);
    expect(trust.subtotal).toBe(1_250_000);

    // breakdown by class sums to the subtotal at each level
    expect(trust.breakdown).toEqual([
      { category: "Real Estate", value: 2_000_000 },
      { category: "Liabilities", value: -800_000 },
      { category: "Cash", value: 50_000 },
    ]);
    for (const e of flattenEntities(r.roots)) {
      expect(e.breakdown.reduce((s, b) => s + b.value, 0)).toBeCloseTo(e.subtotal, 8);
    }

    expect(r.heldThroughStructures).toBe(1_250_000);
    expect(r.heldPersonally).toBe(10_000);
    expect(r.netWorth).toBe(1_260_000);
    expect(r.netWorth).toBeCloseTo(dashboardNetWorth(assets, "USD"), 8);
    expect(r.holderByAssetId).toEqual({ cash: "trust", villa: "spv", mortgage: "spv" });
    expect(r.warnings).toEqual([]);
  });

  it("counts the entity's own recorded stake under Companies and flags a possible double count", () => {
    const assets = [entity("h", { held_asset_ids: ["p"] }, 300), row("p", "Real Estate", 1000), entity("solo", {}, 50)];
    const r = build(assets);
    const h = byId(r.roots, "h");
    expect(h.ownValue).toBe(300);
    expect(h.subtotal).toBe(1300);
    expect(h.breakdown).toEqual([
      { category: "Real Estate", value: 1000 },
      { category: "Companies", value: 300 },
    ]);
    expect(h.possibleDoubleCount).toBe(true);
    // own value but no holdings, or holdings but zero own value: no flag
    expect(byId(r.roots, "solo").possibleDoubleCount).toBe(false);
    expect(build([entity("z", { held_asset_ids: ["p"] }, 0), row("p", "Cash", 1)]).roots[0].possibleDoubleCount).toBe(false);
    // it is a lens: totals are unchanged
    expect(r.heldThroughStructures + r.heldPersonally).toBeCloseTo(r.netWorth, 8);
    expect(r.netWorth).toBe(1350);
  });

  it("multi-currency: every value is in the base currency and reconciles with the dashboard's net worth", () => {
    const assets = [
      entity("f", { entity_type: "foundation", held_asset_ids: ["eurFlat", "aedLoan", "usdBroker"] }, 400, { currency: "EUR" }),
      row("eurFlat", "Real Estate", 600_000, {
        currency: "EUR",
        metadata: { market_valuation: 1_000_000, linked_loan: { outstanding_principal: 400_000 } },
      }),
      liability("aedLoan", 40_000, { currency: "AED" }),
      row("usdBroker", "Equities", 25_000),
      row("aedCash", "Cash", 4_000, { currency: "AED" }),
    ];
    for (const base of ["USD", "EUR", "AED"]) {
      const r = build(assets, base);
      expect(r.baseCurrency).toBe(base);
      expect(r.heldThroughStructures + r.heldPersonally).toBeCloseTo(r.netWorth, 6);
      expect(r.netWorth).toBeCloseTo(dashboardNetWorth(assets, base), 6);
    }
    const usd = build(assets, "USD");
    const f = usd.roots[0];
    expect(f.ownValue).toBeCloseTo(500, 8); // 400 EUR
    const flat = f.holdings.find((h) => h.id === "eurFlat")!;
    expect(flat.nativeValue).toBe(600_000); // equity in EUR
    expect(flat.value).toBeCloseTo(750_000, 6);
    expect(f.holdings.find((h) => h.id === "aedLoan")!.value).toBeCloseTo(-10_000, 8);
    expect(usd.heldPersonally).toBeCloseTo(1_000, 8);
  });

  it("an asset linked by two entities stays with the first (tree order: by name) and raises a warning", () => {
    const assets = [
      entity("b", { held_asset_ids: ["p"] }, 0, { name: "Beta Trust" }),
      entity("a", { held_asset_ids: ["p"] }, 0, { name: "Alpha SPV" }),
      row("p", "Real Estate", 1000, { name: "Villa" }),
    ];
    // same result whatever the input order
    for (const input of [assets, [...assets].reverse()]) {
      const r = build(input);
      expect(r.roots.map((e) => e.id)).toEqual(["a", "b"]);
      expect(byId(r.roots, "a").holdings.map((h) => h.id)).toEqual(["p"]);
      expect(byId(r.roots, "b").holdings).toEqual([]);
      expect(r.warnings).toEqual([
        {
          kind: "duplicate_link",
          assetId: "p",
          assetName: "Villa",
          entityId: "b",
          entityName: "Beta Trust",
          keptEntityId: "a",
          keptEntityName: "Alpha SPV",
        },
      ]);
      expect(r.netWorth).toBe(1000);
      expect(r.heldThroughStructures).toBe(1000);
      expect(r.heldPersonally).toBe(0);
    }
  });

  it("a parent visited before its sub-entity keeps a shared link", () => {
    const r = build([
      entity("z-parent", { held_asset_ids: ["p"] }, 0, { name: "Zed" }),
      entity("a-child", { held_via: "holding", holding_company_id: "z-parent", held_asset_ids: ["p"] }, 0, { name: "Aaa" }),
      row("p", "Cash", 10),
    ]);
    expect(r.holderByAssetId).toEqual({ p: "z-parent" });
    expect(r.warnings).toMatchObject([{ kind: "duplicate_link", entityId: "a-child", keptEntityId: "z-parent" }]);
    expect(r.roots[0].subtotal).toBe(10);
  });

  it("ignores links to missing / not visible ids and to Company assets (itself included), with warnings", () => {
    const assets = [
      entity("h", { held_asset_ids: ["gone", "sub", "h", "cash"] }, 100, { name: "Holdco" }),
      entity("sub", {}, 20, { name: "Opco" }),
      row("cash", "Cash", 5),
    ];
    const r = build(assets);
    const h = byId(r.roots, "h");
    expect(h.holdings.map((x) => x.id)).toEqual(["cash"]);
    expect(h.linkedIds).toEqual(["gone", "sub", "h", "cash"]);
    expect(r.warnings).toEqual([
      { kind: "missing_link", assetId: "gone", entityId: "h", entityName: "Holdco" },
      { kind: "company_link", assetId: "sub", assetName: "Opco", entityId: "h", entityName: "Holdco" },
      { kind: "company_link", assetId: "h", assetName: "Holdco", entityId: "h", entityName: "Holdco" },
    ]);
    // the linked company is NOT nested by held_asset_ids: it stays top-level
    expect(r.roots.map((e) => e.id)).toEqual(["h", "sub"]);
    expect(r.netWorth).toBe(125);
    expect(r.heldThroughStructures).toBe(125);
    expect(r.heldPersonally).toBe(0);
  });

  it("holding cycles are broken (every entity still shown once) and the reconciliation holds", () => {
    const assets = [
      entity("x", { held_via: "holding", holding_company_id: "y", held_asset_ids: ["p"] }, 10),
      entity("y", { held_via: "holding", holding_company_id: "x" }, 20),
      row("p", "Cash", 5),
    ];
    const r = build(assets);
    const all = flattenEntities(r.roots).map((e) => e.id).sort();
    expect(all).toEqual(["x", "y"]);
    expect(r.heldThroughStructures).toBe(35);
    expect(r.netWorth).toBe(35);
  });

  it("entities held via an untracked vehicle are top-level and carry its name", () => {
    const r = build([entity("a", { held_via: "holding", holding_name: "  Family Office  " }, 1)]);
    expect(r.roots[0].viaName).toBe("Family Office");
    expect(r.roots[0].ownershipPercentage).toBe(100);
  });

  it("tolerates garbage metadata on entities", () => {
    const r = build([
      row("e1", "Companies", 5, { metadata: { held_asset_ids: "nope" } }),
      row("e2", "Companies", 5, { metadata: null }),
      row("c", "Cash", 1),
    ]);
    expect(r.entityCount).toBe(2);
    expect(r.warnings).toEqual([]);
    expect(r.netWorth).toBe(11);
    expect(r.heldPersonally).toBe(1);
  });
});

describe("buildHoldingOptions", () => {
  it("lists every non-Company asset by name with its value and current holder", () => {
    const assets = [
      entity("h", { held_asset_ids: ["b"] }, 1, { name: "Holdco" }),
      row("b", "Cash", 10, { name: "Bank" }),
      liability("a", 4, { name: "Auto loan" }),
    ];
    const lt = build(assets);
    expect(buildHoldingOptions(assets, lt)).toEqual([
      { id: "a", name: "Auto loan", category: "Liabilities", isLiability: true, value: -4, holder: null },
      { id: "b", name: "Bank", category: "Cash", isLiability: false, value: 10, holder: { id: "h", name: "Holdco" } },
    ]);
  });
});
