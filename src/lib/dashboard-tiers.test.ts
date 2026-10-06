import { describe, expect, it } from "vitest";
import { EXPERTISE_LEVELS } from "@/stores/useUiTierStore";
import {
  NAV_LINK_TIERS,
  SECTION_TIERS,
  buildAllocation,
  buildCurrencyExposure,
  isNavLinkVisible,
  isSectionVisible,
  type NavLinkId,
  tierMotion,
  tileEntranceStyle,
  topAssets,
  type DashboardSection,
} from "./dashboard-tiers";

const sections = Object.keys(SECTION_TIERS) as DashboardSection[];

const navLinks = Object.keys(NAV_LINK_TIERS) as NavLinkId[];

describe("isNavLinkVisible", () => {
  const expected: Record<NavLinkId, boolean[]> = {
    // [basic, standard, professional, expert]
    dashboard: [true, true, true, true],
    settings: [true, true, true, true],
    security: [true, true, true, true],
    banking: [false, true, true, true],
    companies: [false, false, true, true],
    planning: [false, false, true, true],
  };

  it("covers every link", () => {
    expect(navLinks.sort()).toEqual(Object.keys(expected).sort());
  });

  it.each(Object.entries(expected) as [NavLinkId, boolean[]][])("%s across tiers", (id, shown) => {
    expect(EXPERTISE_LEVELS.map((tier) => isNavLinkVisible(id, tier))).toEqual(shown);
  });

  it("shows Future Projects from professional, not standard", () => {
    expect(isNavLinkVisible("planning", "standard")).toBe(false);
    expect(isNavLinkVisible("planning", "professional")).toBe(true);
  });

  const sectionLinks = navLinks.flatMap((id) => {
    const rule = NAV_LINK_TIERS[id];
    return "section" in rule ? [[id, rule.section] as const] : [];
  });

  it.each(sectionLinks)("%s link mirrors the %s section at every tier", (id, section) => {
    for (const tier of EXPERTISE_LEVELS) {
      expect(isNavLinkVisible(id, tier)).toBe(isSectionVisible(section, tier));
    }
  });
});

describe("isSectionVisible", () => {
  it("shows only the simplified overview at basic", () => {
    expect(sections.filter((s) => isSectionVisible(s, "basic"))).toEqual(["basicOverview"]);
  });

  it("swaps the basic overview for the bento layout from standard up", () => {
    for (const tier of ["standard", "professional", "expert"] as const) {
      expect(isSectionVisible("basicOverview", tier)).toBe(false);
      expect(isSectionVisible("bento", tier)).toBe(true);
      expect(isSectionVisible("analytics", tier)).toBe(true);
      expect(isSectionVisible("cashFlow", tier)).toBe(true);
      expect(isSectionVisible("quickAdd", tier)).toBe(true);
      expect(isSectionVisible("csvUpload", tier)).toBe(true);
    }
  });

  it("adds future projects and exports at professional, expert panels only at expert", () => {
    expect(isSectionVisible("futureProjects", "standard")).toBe(false);
    expect(isSectionVisible("futureProjects", "professional")).toBe(true);
    expect(isSectionVisible("export", "standard")).toBe(false);
    expect(isSectionVisible("expertPanels", "professional")).toBe(false);
    expect(isSectionVisible("expertPanels", "expert")).toBe(true);
  });

  it("never hides a section at a higher tier once it is shown (except the basic overview)", () => {
    for (const s of sections.filter((x) => x !== "basicOverview")) {
      let seen = false;
      for (const tier of EXPERTISE_LEVELS) {
        const visible = isSectionVisible(s, tier);
        if (seen) expect(visible).toBe(true);
        seen ||= visible;
      }
    }
  });
});

describe("tierMotion", () => {
  it("is fade-only with no stagger at basic", () => {
    expect(tierMotion("basic")).toMatchObject({ staggerMs: 0, offsetPx: 0 });
  });

  it("staggers faster as the screen gets denser", () => {
    expect(tierMotion("standard").staggerMs).toBeGreaterThan(tierMotion("professional").staggerMs);
    expect(tierMotion("professional").staggerMs).toBeGreaterThan(tierMotion("expert").staggerMs);
  });

  it("builds a per-tile delay from the tier stagger", () => {
    const style = tileEntranceStyle(tierMotion("standard"), 3);
    expect(style.animationDelay).toBe("225ms");
    expect(style.animationDuration).toBe("300ms");
    expect(tileEntranceStyle(tierMotion("basic"), 5).animationDelay).toBe("0ms");
    expect(tileEntranceStyle(tierMotion("standard"), -2).animationDelay).toBe("0ms");
  });
});

describe("buildAllocation / topAssets", () => {
  const rows = [
    { id: "1", name: "Villa", category: "Real Estate", amount: 600 },
    { id: "2", name: "Flat", category: "Real Estate", amount: 200 },
    { id: "3", name: "Fund", category: "Equities", amount: 200 },
    { id: "4", name: "Mortgage", category: "Real Estate", amount: -300 },
    { id: "5", name: "Empty", category: "Cash", amount: 0 },
  ];

  it("groups positive amounts by category, largest first, with shares summing to 100", () => {
    const slices = buildAllocation(rows);
    expect(slices.map((s) => s.category)).toEqual(["Real Estate", "Equities"]);
    expect(slices[0]).toMatchObject({ amount: 800, share: 80 });
    expect(slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(100);
  });

  it("returns nothing when there is no positive value", () => {
    expect(buildAllocation([{ id: "1", name: "x", category: "Cash", amount: -5 }])).toEqual([]);
    expect(buildAllocation([])).toEqual([]);
  });

  it("lists the largest holdings first and honours the limit", () => {
    // Flat and Fund tie at 200, so the name breaks the tie.
    expect(topAssets(rows, 2).map((r) => r.name)).toEqual(["Villa", "Flat"]);
    expect(topAssets(rows, 0)).toEqual([]);
    expect(topAssets(rows).every((r) => r.amount > 0)).toBe(true);
  });
});

describe("buildCurrencyExposure", () => {
  it("builds a currency x category matrix with shares of the positive total", () => {
    const exposure = buildCurrencyExposure([
      { currency: "AED", category: "Real Estate", amount: 500 },
      { currency: "AED", category: "Cash", amount: 100 },
      { currency: "USD", category: "Equities", amount: 300 },
      { currency: "EUR", category: "Equities", amount: 100 },
      { currency: "EUR", category: "Real Estate", amount: -999 },
    ]);
    expect(exposure.currencies.map((c) => c.currency)).toEqual(["AED", "USD", "EUR"]);
    expect(exposure.currencies[0]).toMatchObject({ amount: 600, share: 60 });
    expect(exposure.categories).toEqual(["Real Estate", "Equities", "Cash"]);
    expect(exposure.maxCell).toBe(500);
    expect(exposure.cells).toHaveLength(4);
  });

  it("handles empty input", () => {
    expect(buildCurrencyExposure([])).toEqual({ currencies: [], categories: [], cells: [], maxCell: 0 });
  });
});
