import { describe, expect, it } from "vitest";
import { EXPERTISE_LEVELS } from "@/stores/useUiTierStore";
import { isSectionVisible } from "@/lib/dashboard-tiers";
import {
  BLOCKS,
  BLOCK_IDS,
  blocksForTier,
  defaultLayout,
  emptyLayouts,
  getBlock,
  isBlockAvailable,
  layoutForTier,
  layoutsFitLimit,
  moveBlock,
  moveBlockBy,
  normalizeLayout,
  normalizeLayouts,
  resizeBlock,
  sizeOf,
  tiersOfBlock,
  toggleBlock,
  visibleBlocks,
  withTierLayout,
} from "@/lib/dashboard-layout";

describe("registry", () => {
  it("has unique ids and a label key per block", () => {
    expect(new Set(BLOCK_IDS).size).toBe(BLOCK_IDS.length);
    for (const b of BLOCKS) expect(b.labelKey).toBe(`dlayout_block_${b.id}`);
  });

  it("every default size is an allowed size", () => {
    for (const b of BLOCKS) expect(b.allowedSizes).toContain(b.defaultSize);
  });

  it("availability follows the TierGate section rules exactly", () => {
    for (const tier of EXPERTISE_LEVELS) {
      for (const b of BLOCKS) expect(isBlockAvailable(b.id, tier)).toBe(isSectionVisible(b.section, tier));
    }
  });

  it("offers the right blocks per tier", () => {
    expect(blocksForTier("basic").map((b) => b.id)).toEqual(["basicOverview"]);
    expect(blocksForTier("standard").map((b) => b.id)).not.toContain("expertRatios");
    expect(blocksForTier("standard").map((b) => b.id)).not.toContain("incomeCalendar");
    expect(blocksForTier("professional").map((b) => b.id)).toContain("incomeCalendar");
    expect(blocksForTier("expert").map((b) => b.id)).toContain("expertAttribution");
    expect(blocksForTier("expert").map((b) => b.id)).not.toContain("basicOverview");
    expect(tiersOfBlock("expertTax")).toEqual(["expert"]);
  });


  it("registers the Global exposure block first, full width, from Professional up", () => {
    expect(BLOCK_IDS[0]).toBe("fxExposure");
    const block = getBlock("fxExposure");
    expect(block.section).toBe("fxExposure");
    expect(block.defaultSize).toBe("full");
    expect([...block.allowedSizes]).toEqual(["l", "full"]);
    expect(block.labelKey).toBe("dlayout_block_fxExposure");
    expect(tiersOfBlock("fxExposure")).toEqual(["professional", "expert"]);
    expect(blocksForTier("standard").map((b) => b.id)).not.toContain("fxExposure");
    expect(blocksForTier("basic").map((b) => b.id)).not.toContain("fxExposure");
    expect(defaultLayout("professional").order[0]).toBe("fxExposure");
    expect(defaultLayout("expert").order[0]).toBe("fxExposure");
    expect(resizeBlock(defaultLayout("expert"), "fxExposure", "s")).toEqual(defaultLayout("expert"));
  });
  it("splits the expert panels into six tiles with the old arrangement", () => {
    const tiles = BLOCKS.filter((b) => b.section === "expertPanels");
    expect(tiles.map((b) => [b.id, b.defaultSize])).toEqual([
      ["expertRaw", "m"],
      ["expertPrivateEquity", "m"],
      ["expertTax", "m"],
      ["expertExposure", "m"],
      ["expertRatios", "full"],
      ["expertAttribution", "full"],
    ]);
  });
});

describe("defaultLayout", () => {
  it("shows every offered block in the page's original order at default sizes", () => {
    const layout = defaultLayout("expert");
    expect(layout.hidden).toEqual([]);
    expect(layout.order).toEqual([
      "fxExposure",
      "bento",
      "quickAdd",
      "metricCards",
      "cashFlow",
      "incomeCalendar",
      "csvUpload",
      "futureProjects",
      "analytics",
      "portfolio",
      "expertRaw",
      "expertPrivateEquity",
      "expertTax",
      "expertExposure",
      "expertRatios",
      "expertAttribution",
      "export",
    ]);
    expect(visibleBlocks(layout, "expert")).toEqual(layout.order);
    for (const id of layout.order) expect(sizeOf(layout, id)).toBe(getBlock(id).defaultSize);
  });

  it("is idempotent through the normaliser", () => {
    for (const tier of EXPERTISE_LEVELS) {
      expect(normalizeLayout(defaultLayout(tier), tier)).toEqual(defaultLayout(tier));
    }
  });
});

describe("normalizeLayout", () => {
  it("never trusts garbage input", () => {
    for (const raw of [null, undefined, 5, "x", [], [1, 2], { order: "no", hidden: 7, sizes: [] }, { order: [null, {}, 3] }]) {
      expect(normalizeLayout(raw, "professional")).toEqual(defaultLayout("professional"));
    }
  });

  it("drops unknown ids, blocks the tier does not offer, and duplicates", () => {
    const layout = normalizeLayout(
      {
        order: ["export", "nope", "export", "expertRaw", "__proto__", "bento"],
        hidden: ["nope", "expertRaw", "bento", "bento"],
        sizes: { nope: "s", expertRaw: "s", bento: "l" },
      },
      "professional",
    );
    expect(layout.order.slice(0, 2)).toEqual(["export", "bento"]);
    expect(layout.order).not.toContain("expertRaw");
    expect(layout.order).not.toContain("nope");
    expect(new Set(layout.order).size).toBe(layout.order.length);
    expect(layout.hidden).toEqual(["bento"]);
    expect(Object.keys(layout.sizes)).not.toContain("nope");
    expect(Object.keys(layout.sizes)).not.toContain("expertRaw");
    expect(layout.sizes.bento).toBe("l");
  });

  it("appends blocks added after the layout was saved, visible and at the default size", () => {
    const layout = normalizeLayout({ version: 1, order: ["export", "bento"], hidden: [], sizes: { export: "l" } }, "professional");
    expect(layout.order.slice(0, 2)).toEqual(["export", "bento"]);
    expect(layout.order).toContain("incomeCalendar");
    expect(layout.order.length).toBe(blocksForTier("professional").length);
    expect(layout.hidden).toEqual([]);
    expect(layout.sizes.incomeCalendar).toBe("full");
    expect(layout.sizes.export).toBe("l");
  });

  it("clamps sizes the block does not allow and rejects non-sizes", () => {
    const layout = normalizeLayout(
      { order: [], sizes: { analytics: "s", bento: "huge", quickAdd: "s", metricCards: 4, portfolio: "m" } },
      "expert",
    );
    expect(layout.sizes.analytics).toBe("full"); // analytics: l or full only
    expect(layout.sizes.portfolio).toBe("full");
    expect(layout.sizes.bento).toBe("full");
    expect(layout.sizes.metricCards).toBe("full");
    expect(layout.sizes.quickAdd).toBe("s"); // allowed
  });

  it("is a pure function: input untouched, output independent", () => {
    const raw = { order: ["export"], hidden: ["export"], sizes: { export: "m" } };
    const copy = JSON.parse(JSON.stringify(raw));
    const out = normalizeLayout(raw, "professional");
    expect(raw).toEqual(copy);
    out.order.push("bento");
    expect(raw.order).toEqual(["export"]);
  });

  it("does not pollute prototypes through crafted keys", () => {
    const raw = JSON.parse('{"order":[],"sizes":{"__proto__":{"polluted":"full"},"constructor":"s"}}');
    normalizeLayout(raw, "expert");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("edit operations", () => {
  const base = defaultLayout("expert");

  it("moveBlock reorders and the rest shift; clamps the index", () => {
    const moved = moveBlock(base, "export", 0);
    expect(moved.order[0]).toBe("export");
    expect(moved.order.slice(1)).toEqual(base.order.filter((id) => id !== "export"));
    expect(moveBlock(base, "bento", 999).order.at(-1)).toBe("bento");
    expect(moveBlock(base, "fxExposure", -5).order).toEqual(base.order);
    expect(moveBlock(base, "basicOverview", 2)).toBe(base);
    expect(moveBlock(base, "bento", Number.NaN)).toBe(base);
  });

  it("moveBlockBy moves one slot and stops at the ends", () => {
    expect(moveBlockBy(base, "quickAdd", -1).order.slice(1, 3)).toEqual(["quickAdd", "bento"]);
    expect(moveBlockBy(base, "bento", 1).order.slice(1, 3)).toEqual(["quickAdd", "bento"]);
    expect(moveBlockBy(base, "fxExposure", -1).order).toEqual(base.order);
    expect(moveBlockBy(base, "export", 1).order).toEqual(base.order);
  });

  it("does not mutate its input", () => {
    const snapshot = JSON.stringify(base);
    moveBlock(base, "export", 0);
    toggleBlock(base, "bento");
    resizeBlock(base, "bento", "m");
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it("toggleBlock hides and shows, and visibleBlocks follows", () => {
    const off = toggleBlock(base, "bento");
    expect(off.hidden).toEqual(["bento"]);
    expect(visibleBlocks(off, "expert")).not.toContain("bento");
    expect(off.order).toEqual(base.order);
    const on = toggleBlock(off, "bento");
    expect(on.hidden).toEqual([]);
    expect(toggleBlock(base, "basicOverview")).toBe(base);
  });

  it("resizeBlock sets allowed sizes only", () => {
    expect(sizeOf(resizeBlock(base, "metricCards", "m"), "metricCards")).toBe("m");
    expect(resizeBlock(base, "analytics", "s")).toBe(base);
    expect(resizeBlock(base, "analytics", "bogus" as never)).toBe(base);
    expect(resizeBlock(base, "bento", "full")).toBe(base);
  });

  it("visibleBlocks never lists a block the tier does not offer, even if the layout does", () => {
    const hostile = { ...base, order: [...base.order, "basicOverview" as const] };
    expect(visibleBlocks(hostile, "expert")).not.toContain("basicOverview");
    expect(visibleBlocks(defaultLayout("basic"), "expert")).toEqual([]);
  });
});

describe("DashboardLayouts container", () => {
  it("falls back to empty for unusable input and ignores unknown tiers", () => {
    expect(normalizeLayouts(null)).toEqual(emptyLayouts());
    expect(normalizeLayouts("x")).toEqual(emptyLayouts());
    expect(normalizeLayouts({ tiers: [] })).toEqual(emptyLayouts());
    const out = normalizeLayouts({ tiers: { expert: { order: ["export"] }, gold: { order: [] }, basic: 4 } });
    expect(Object.keys(out.tiers)).toEqual(["expert"]);
    expect(out.tiers.expert?.order[0]).toBe("export");
  });

  it("layoutForTier uses the saved tier layout, else the default", () => {
    const saved = withTierLayout(null, "expert", moveBlock(defaultLayout("expert"), "export", 0));
    expect(layoutForTier(saved, "expert").order[0]).toBe("export");
    expect(layoutForTier(saved, "professional")).toEqual(defaultLayout("professional"));
    expect(layoutForTier(null, "basic")).toEqual(defaultLayout("basic"));
  });

  it("stays well inside the size limit even when every tier is saved", () => {
    let all = emptyLayouts();
    for (const tier of EXPERTISE_LEVELS) all = withTierLayout(all, tier, defaultLayout(tier));
    expect(layoutsFitLimit(all)).toBe(true);
    expect(JSON.stringify(all).length).toBeLessThan(4000);
  });
});
