import { describe, expect, it } from "vitest";
import {
  COMPANY_ENTITY_TYPES,
  EMPTY_COMPANY_METADATA,
  buildHoldingStructure,
  companyStakeValue,
  getCompanyMetadataErrors,
  parseCompanyMetadata,
  sanitizeHeldAssetIds,
  type CompanyMetadata,
  type CompanyNode,
} from "@/lib/companies";

const co = (id: string, md: Partial<CompanyMetadata> = {}, current_value = 100) => ({
  id,
  name: `Co ${id}`,
  currency: "USD",
  current_value,
  metadata: md as unknown,
});

const ids = (nodes: CompanyNode[]) => nodes.map((n) => n.id);

describe("parseCompanyMetadata", () => {
  it("defaults for null / non-objects", () => {
    expect(parseCompanyMetadata(null)).toEqual(EMPTY_COMPANY_METADATA);
    expect(parseCompanyMetadata(7)).toEqual(EMPTY_COMPANY_METADATA);
  });

  it("merges stored fields over the defaults", () => {
    const p = parseCompanyMetadata({ legal_name: "Acme LLC", ownership_percentage: 60 });
    expect(p.legal_name).toBe("Acme LLC");
    expect(p.ownership_percentage).toBe(60);
    expect(p.held_via).toBe("personal");
    expect(p.entity_type).toBe("llc");
    expect(p.held_asset_ids).toEqual([]);
  });

  it("keeps the structure entity types", () => {
    for (const type of ["trust", "foundation", "spv"] as const) {
      expect(COMPANY_ENTITY_TYPES).toContain(type);
      expect(parseCompanyMetadata({ entity_type: type }).entity_type).toBe(type);
    }
    expect(new Set(COMPANY_ENTITY_TYPES).size).toBe(COMPANY_ENTITY_TYPES.length);
  });

  it("sanitises held_asset_ids to unique, non-empty, trimmed strings", () => {
    expect(parseCompanyMetadata({ held_asset_ids: ["a", " b ", "a", "", "   ", 7, null, { id: "x" }, "b"] }).held_asset_ids).toEqual([
      "a",
      "b",
    ]);
    expect(parseCompanyMetadata({ held_asset_ids: "a" }).held_asset_ids).toEqual([]);
    expect(parseCompanyMetadata({ held_asset_ids: null }).held_asset_ids).toEqual([]);
    expect(parseCompanyMetadata({ held_asset_ids: { 0: "a" } }).held_asset_ids).toEqual([]);
    expect(sanitizeHeldAssetIds(undefined)).toEqual([]);
  });

  it("keeps unknown metadata keys (so saving the form never drops them)", () => {
    const p = parseCompanyMetadata({ held_asset_ids: ["p1"], some_future_key: 1 }) as CompanyMetadata & Record<string, unknown>;
    expect(p.some_future_key).toBe(1);
    expect(p.held_asset_ids).toEqual(["p1"]);
  });

  it("never hands out the shared default list", () => {
    const a = parseCompanyMetadata(null);
    a.held_asset_ids.push("x");
    expect(parseCompanyMetadata(null).held_asset_ids).toEqual([]);
    expect(EMPTY_COMPANY_METADATA.held_asset_ids).toEqual([]);
  });
});

describe("getCompanyMetadataErrors", () => {
  const m = (ownership_percentage: number | null) => ({ ...EMPTY_COMPANY_METADATA, ownership_percentage });

  it("ownership is required", () => {
    expect(getCompanyMetadataErrors(m(null))).toEqual(["company_ownership_required"]);
    expect(getCompanyMetadataErrors(m(NaN))).toEqual(["company_ownership_required"]);
  });

  it("ownership must be within 0..100 inclusive", () => {
    expect(getCompanyMetadataErrors(m(-0.1))).toEqual(["ownership_percentage_range"]);
    expect(getCompanyMetadataErrors(m(100.1))).toEqual(["ownership_percentage_range"]);
    expect(getCompanyMetadataErrors(m(0))).toEqual([]);
    expect(getCompanyMetadataErrors(m(100))).toEqual([]);
    expect(getCompanyMetadataErrors(m(33.3))).toEqual([]);
  });
});

describe("companyStakeValue", () => {
  it("is company value x ownership %", () => {
    expect(companyStakeValue(1_000_000, 25)).toBe(250_000);
    expect(companyStakeValue(1_000_000, 100)).toBe(1_000_000);
    expect(companyStakeValue(800, 12.5)).toBe(100);
  });

  it("a 0% stake is worth 0 (zero is not treated as missing)", () => {
    expect(companyStakeValue(1_000_000, 0)).toBe(0);
  });

  it("an unknown ownership is taken as 100%", () => {
    expect(companyStakeValue(1_000_000, null)).toBe(1_000_000);
  });

  it("handles zero and negative equity values", () => {
    expect(companyStakeValue(0, 50)).toBe(0);
    expect(companyStakeValue(-1000, 50)).toBe(-500);
  });

  it("complementary stakes add back up to the whole", () => {
    expect(companyStakeValue(9_000, 40) + companyStakeValue(9_000, 60)).toBeCloseTo(9_000, 8);
  });
});

describe("buildHoldingStructure", () => {
  it("empty input gives an empty structure", () => {
    expect(buildHoldingStructure([])).toEqual({ personal: [], untrackedHoldings: [], roots: [] });
  });

  it("entities with no holding link are held personally", () => {
    const s = buildHoldingStructure([co("a"), co("b")]);
    expect(ids(s.personal)).toEqual(["a", "b"]);
    expect(s.roots).toEqual([]);
    expect(s.untrackedHoldings).toEqual([]);
  });

  it("carries name, currency and the stake (current_value) onto the node, with parsed metadata", () => {
    const s = buildHoldingStructure([co("a", { legal_name: "Acme" }, 4321)]);
    expect(s.personal[0]).toMatchObject({ id: "a", name: "Co a", currency: "USD", stakeValue: 4321, children: [] });
    expect(s.personal[0].metadata.legal_name).toBe("Acme");
    expect(s.personal[0].metadata.held_via).toBe("personal");
  });

  it("a tracked holding company with subsidiaries becomes a root with them as children, even if listed after them", () => {
    const s = buildHoldingStructure([
      co("child1", { held_via: "holding", holding_company_id: "hold" }),
      co("hold"),
      co("child2", { held_via: "holding", holding_company_id: "hold" }),
      co("solo"),
    ]);
    expect(ids(s.roots)).toEqual(["hold"]);
    expect(ids(s.roots[0].children)).toEqual(["child1", "child2"]);
    expect(ids(s.personal)).toEqual(["solo"]);
  });

  it("a holding company with no subsidiaries is just a personal entry, not a root", () => {
    const s = buildHoldingStructure([co("hold", { entity_type: "holding" })]);
    expect(s.roots).toEqual([]);
    expect(ids(s.personal)).toEqual(["hold"]);
  });

  it("supports multi-level chains: only the top of the chain is a root", () => {
    const s = buildHoldingStructure([
      co("top"),
      co("mid", { held_via: "holding", holding_company_id: "top" }),
      co("leaf", { held_via: "holding", holding_company_id: "mid" }),
    ]);
    expect(ids(s.roots)).toEqual(["top"]);
    expect(ids(s.roots[0].children)).toEqual(["mid"]);
    expect(ids(s.roots[0].children[0].children)).toEqual(["leaf"]);
    expect(s.personal).toEqual([]);
  });

  it("untracked holding vehicles group their companies by (trimmed) name", () => {
    const s = buildHoldingStructure([
      co("a", { held_via: "holding", holding_name: "Offshore Ltd" }),
      co("b", { held_via: "holding", holding_name: "  Offshore Ltd  " }),
      co("c", { held_via: "holding", holding_name: "Other SPV" }),
    ]);
    expect(s.untrackedHoldings.map((g) => g.name)).toEqual(["Offshore Ltd", "Other SPV"]);
    expect(ids(s.untrackedHoldings[0].companies)).toEqual(["a", "b"]);
    expect(ids(s.untrackedHoldings[1].companies)).toEqual(["c"]);
    expect(s.personal).toEqual([]);
  });

  it("a tracked parent takes priority over a holding name", () => {
    const s = buildHoldingStructure([
      co("hold"),
      co("a", { held_via: "holding", holding_company_id: "hold", holding_name: "Ignored" }),
    ]);
    expect(ids(s.roots[0].children)).toEqual(["a"]);
    expect(s.untrackedHoldings).toEqual([]);
  });

  it("a dangling holding_company_id with no name falls back to personal", () => {
    const s = buildHoldingStructure([co("a", { held_via: "holding", holding_company_id: "missing" })]);
    expect(ids(s.personal)).toEqual(["a"]);
  });

  it("a dangling holding_company_id with a name falls back to that untracked group", () => {
    const s = buildHoldingStructure([co("a", { held_via: "holding", holding_company_id: "missing", holding_name: "SPV" })]);
    expect(s.untrackedHoldings).toEqual([{ name: "SPV", companies: [expect.objectContaining({ id: "a" })] }]);
  });

  it("an entity that points at itself is not its own parent", () => {
    const s = buildHoldingStructure([co("a", { held_via: "holding", holding_company_id: "a" })]);
    expect(ids(s.personal)).toEqual(["a"]);
    expect(s.personal[0].children).toEqual([]);
  });

  it("holding_company_id is ignored unless held_via is 'holding'", () => {
    const s = buildHoldingStructure([co("hold"), co("a", { held_via: "personal", holding_company_id: "hold" })]);
    expect(s.roots).toEqual([]);
    expect(ids(s.personal)).toEqual(["hold", "a"]);
  });

  it("tolerates missing / garbage metadata", () => {
    const s = buildHoldingStructure([
      { id: "a", name: "A", currency: "USD", current_value: 1, metadata: null },
      { id: "b", name: "B", currency: "USD", current_value: 2, metadata: "junk" },
    ]);
    expect(ids(s.personal)).toEqual(["a", "b"]);
  });

  // BUG (companies.ts:142-153): two entities that name each other as holding company
  // (a data-entry cycle) become each other's only parent, so neither is a root,
  // personal or untracked: both silently disappear from the structure.
  it("every company still appears somewhere even if two entities hold each other", () => {
    const s = buildHoldingStructure([
      co("x", { held_via: "holding", holding_company_id: "y" }),
      co("y", { held_via: "holding", holding_company_id: "x" }),
    ]);
    const seen = new Set<string>();
    const walk = (n: CompanyNode) => {
      if (seen.has(n.id)) return;
      seen.add(n.id);
      n.children.forEach(walk);
    };
    [...s.personal, ...s.roots, ...s.untrackedHoldings.flatMap((g) => g.companies)].forEach(walk);
    expect([...seen].sort()).toEqual(["x", "y"]);
  });
});
