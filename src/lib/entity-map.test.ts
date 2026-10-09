import { describe, expect, it } from "vitest";
import { buildEntityLookthrough, flattenEntities, type LookthroughAssetRow, type LookthroughEntity } from "@/lib/entity-lookthrough";
import {
  MAP_COLUMN_STEP,
  MAP_NODE_WIDTH,
  MISSING_VALUE,
  buildEntityMap,
  finiteOrNull,
  formatMapValue,
  mapTotals,
} from "@/lib/entity-map";

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
const entity = (id: string, md: Record<string, unknown> = {}, current_value = 0, over: Partial<LookthroughAssetRow> = {}) =>
  row(id, "Companies", current_value, { name: `Entity ${id}`, metadata: { ownership_percentage: 100, ...md }, ...over });
const liability = (id: string, current_value: number, over: Partial<LookthroughAssetRow> = {}) =>
  row(id, "Liabilities", current_value, { is_liability: true, ...over });

const lookthrough = (assets: LookthroughAssetRow[], base = "USD") => buildEntityLookthrough({ assets, baseCurrency: base, rates: RATES });

const portfolio: LookthroughAssetRow[] = [
  entity("trust", { entity_type: "trust", held_asset_ids: ["villa", "mortgage"] }, 300),
  entity("spv", { entity_type: "spv", ownership_percentage: 80, held_via: "holding", holding_company_id: "trust", held_asset_ids: ["fund"] }, 100),
  entity("empty", { entity_type: "foundation" }, 0),
  row("villa", "Real Estate", 1000),
  liability("mortgage", 400),
  row("fund", "Private Equity", 250, { currency: "EUR" }),
  row("cash", "Cash", 50),
  row("gold", "Precious Metals", 75),
];

describe("buildEntityMap reconciliation", () => {
  it("map totals equal the look-through totals and net worth", () => {
    const lt = lookthrough(portfolio);
    const map = buildEntityMap(lt, { assets: portfolio });
    const t = mapTotals(map);
    expect(t.unknown).toBe(0);
    expect(t.structuresTotal).toBeCloseTo(lt.heldThroughStructures, 8);
    expect(t.personal).toBeCloseTo(lt.heldPersonally, 8);
    expect(t.total).toBeCloseTo(lt.netWorth, 8);
    // 300 + 100 + 0 own, +1000 - 400 + 250/0.8 held, 125 personal
    expect(t.total).toBeCloseTo(300 + 100 + 1000 - 400 + 312.5 + 125, 8);
  });

  it("entity node values are the look-through subtotals and the owner node is net worth", () => {
    const lt = lookthrough(portfolio);
    const map = buildEntityMap(lt);
    const byId = new Map(map.nodes.map((n) => [n.id, n]));
    for (const e of flattenEntities(lt.roots)) {
      expect(byId.get(`ent:${e.id}`)!.data.value).toBeCloseTo(e.subtotal, 8);
    }
    expect(byId.get("owner")!.data.value).toBeCloseTo(lt.netWorth, 8);
    // top-level subtotals add up to the structures total
    const tops = lt.roots.reduce((s, r) => s + byId.get(`ent:${r.id}`)!.data.value!, 0);
    expect(tops).toBeCloseTo(lt.heldThroughStructures, 8);
  });

  it("holds when the base currency is not USD and with a linked-loan property", () => {
    const rows = [
      entity("e", { held_asset_ids: ["flat"] }, 10),
      row("flat", "Real Estate", 600, { metadata: { market_valuation: 1000, linked_loan: { outstanding_principal: 400 } } }),
      row("other", "Cash", 80, { currency: "EUR" }),
    ];
    const lt = lookthrough(rows, "AED");
    const t = mapTotals(buildEntityMap(lt));
    expect(t.total).toBeCloseTo(lt.netWorth, 8);
    expect(t.structuresTotal).toBeCloseTo(lt.heldThroughStructures, 8);
  });

  it("counts entities, assets and loans, and one edge per node except the owner", () => {
    const map = buildEntityMap(lookthrough(portfolio), { assets: portfolio });
    expect(map.summary).toEqual({ entities: 3, assets: 2, loans: 1, refused: 0 });
    expect(map.edges).toHaveLength(map.nodes.length - 1);
    const ids = new Set(map.nodes.map((n) => n.id));
    for (const e of map.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
    expect(map.nodes.find((n) => n.id === "personal")!.data.childCount).toBe(2);
  });
});

describe("buildEntityMap edge cases", () => {
  it("is empty when there are no entities", () => {
    const map = buildEntityMap(lookthrough([row("cash", "Cash", 10)]));
    expect(map.nodes).toEqual([]);
    expect(map.edges).toEqual([]);
    expect(map.bounds).toEqual({ width: 0, height: 0 });
  });

  it("an entity with no holdings is a leaf with value 0 and no outgoing edge", () => {
    const rows = [entity("solo", {}, 0)];
    const map = buildEntityMap(lookthrough(rows));
    const solo = map.nodes.find((n) => n.id === "ent:solo")!;
    expect(solo.data.childCount).toBe(0);
    expect(map.edges.filter((e) => e.source === "ent:solo")).toHaveLength(0);
    expect(solo.data.value).toBe(0);
  });

  it("loans are negative holding nodes", () => {
    const rows = [entity("e", { held_asset_ids: ["loan"] }), liability("loan", 120)];
    const map = buildEntityMap(lookthrough(rows));
    const loan = map.nodes.find((n) => n.type === "holding")!;
    expect(loan.data.isLiability).toBe(true);
    expect(loan.data.value).toBe(-120);
    expect(map.nodes.find((n) => n.id === "ent:e")!.data.value).toBe(-120);
  });

  it("holding cycles in the stored data never produce a looping map (the tree breaks them)", () => {
    const rows = [
      entity("a", { held_via: "holding", holding_company_id: "b" }, 10),
      entity("b", { held_via: "holding", holding_company_id: "a" }, 20),
    ];
    const lt = lookthrough(rows);
    const map = buildEntityMap(lt);
    expect(map.nodes.filter((n) => n.type === "entity")).toHaveLength(flattenEntities(lt.roots).length);
    expect(mapTotals(map).total).toBeCloseTo(lt.netWorth, 8);
  });

  it("refuses a cyclic or duplicated tree handed in directly", () => {
    const lt = lookthrough([entity("a", {}, 10), entity("b", {}, 20)]);
    const [a, b] = lt.roots as [LookthroughEntity, LookthroughEntity];
    a.children = [b];
    b.children = [a]; // cycle
    lt.roots = [a, b]; // and b is also a root
    const map = buildEntityMap(lt);
    expect(map.nodes.filter((n) => n.type === "entity")).toHaveLength(2);
    expect(new Set(map.nodes.map((n) => n.id)).size).toBe(map.nodes.length);
    expect(map.summary.refused).toBeGreaterThan(0);
  });

  it("never emits NaN or Infinity: unknown values become null", () => {
    const lt = lookthrough([entity("e", { held_asset_ids: ["x"] }, 5), row("x", "Cash", 10)]);
    lt.roots[0]!.subtotal = Number.NaN;
    lt.roots[0]!.holdings[0]!.value = Number.POSITIVE_INFINITY;
    lt.netWorth = Number.NaN;
    const map = buildEntityMap(lt);
    for (const n of map.nodes) {
      expect(n.data.value === null || Number.isFinite(n.data.value)).toBe(true);
      expect(Number.isFinite(n.position.x) && Number.isFinite(n.position.y)).toBe(true);
    }
    expect(map.nodes.find((n) => n.id === "owner")!.data.value).toBeNull();
    expect(mapTotals(map).unknown).toBe(1);
  });
});

describe("layout", () => {
  it("is deterministic and layered by depth", () => {
    const a = buildEntityMap(lookthrough(portfolio));
    const b = buildEntityMap(lookthrough([...portfolio].reverse()));
    expect(b.nodes).toEqual(a.nodes);
    const x = (id: string) => a.nodes.find((n) => n.id === id)!.position.x;
    expect(x("owner")).toBe(0);
    expect(x("ent:trust")).toBe(MAP_COLUMN_STEP);
    expect(x("personal")).toBe(MAP_COLUMN_STEP);
    expect(x("ent:spv")).toBe(2 * MAP_COLUMN_STEP);
    expect(x("hold:spv:fund")).toBe(3 * MAP_COLUMN_STEP);
  });

  it("does not overlap nodes in the same column", () => {
    const map = buildEntityMap(lookthrough(portfolio));
    const seen = new Set<string>();
    for (const n of map.nodes) {
      const key = `${n.position.x}:${n.position.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("mirrors the x axis in right-to-left mode", () => {
    const ltr = buildEntityMap(lookthrough(portfolio));
    const rtl = buildEntityMap(lookthrough(portfolio), { rtl: true });
    for (const n of ltr.nodes) {
      const m = rtl.nodes.find((r) => r.id === n.id)!;
      expect(m.position.x === 0 ? 0 : m.position.x).toBe(n.position.x === 0 ? 0 : -n.position.x);
      expect(m.position.y).toBe(n.position.y);
    }
    expect(rtl.bounds.width).toBe(ltr.bounds.width);
    expect(ltr.bounds.width).toBeGreaterThan(MAP_NODE_WIDTH);
  });
});

describe("missing value helpers", () => {
  it("finiteOrNull", () => {
    expect(finiteOrNull(0)).toBe(0);
    expect(finiteOrNull(-3)).toBe(-3);
    expect(finiteOrNull(Number.NaN)).toBeNull();
    expect(finiteOrNull(undefined)).toBeNull();
    expect(finiteOrNull(Number.NEGATIVE_INFINITY)).toBeNull();
  });
  it("formatMapValue prints an en dash, never 0 or NaN, for unknown values", () => {
    expect(formatMapValue(null, (n) => String(n))).toBe(MISSING_VALUE);
    expect(MISSING_VALUE).toBe("–");
    expect(formatMapValue(0, (n) => `$${n}`)).toBe("$0");
  });
});
