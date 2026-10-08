import { describe, expect, it } from "vitest";
import {
  MAX_COMMAND_HOLDINGS,
  canUploadStatement,
  capHoldings,
  currencyItems,
  holdingHref,
  holdingKeywords,
  matchesSearch,
  tierSwitchItems,
  type CommandHolding,
} from "@/lib/command-menu-items";
import { visibleNavItems } from "@/lib/nav-items";

const h = (id: string, name: string, extra: Partial<CommandHolding> = {}): CommandHolding => ({
  id,
  name,
  ticker_symbol: null,
  category: null,
  is_liability: false,
  ...extra,
});

describe("command menu items", () => {
  it("builds holding hrefs", () => {
    expect(holdingHref("abc-123")).toBe("/dashboard/assets/abc-123");
    expect(holdingHref("a/b")).toBe("/dashboard/assets/a%2Fb");
  });

  it("caps, de-duplicates and sorts holdings", () => {
    const many = Array.from({ length: 250 }, (_, i) => h(`id${i}`, `Asset ${String(i).padStart(3, "0")}`));
    expect(capHoldings(many)).toHaveLength(MAX_COMMAND_HOLDINGS);
    expect(capHoldings([h("1", "Zed"), h("1", "Zed again"), h("2", "Alpha")]).map((x) => x.name)).toEqual([
      "Alpha",
      "Zed",
    ]);
    expect(capHoldings([h("1", "A")], 0)).toEqual([]);
  });

  it("uses name, ticker and category as search keywords", () => {
    expect(holdingKeywords(h("1", "Apple", { ticker_symbol: "AAPL", category: "Equities" }))).toEqual([
      "Apple",
      "AAPL",
      "Equities",
    ]);
    expect(holdingKeywords(h("2", "Villa"))).toEqual(["Villa"]);
  });

  it("matches every search token case-insensitively", () => {
    expect(matchesSearch("Apple Inc AAPL", "apple aapl")).toBe(true);
    expect(matchesSearch("Apple Inc AAPL", "apple msft")).toBe(false);
    expect(matchesSearch("anything", "   ")).toBe(true);
  });

  it("offers Basic / Professional / Expert and marks the current one", () => {
    expect(tierSwitchItems("professional").map((i) => [i.level, i.current])).toEqual([
      ["basic", false],
      ["professional", true],
      ["expert", false],
    ]);
    expect(tierSwitchItems("standard").some((i) => i.current)).toBe(false);
  });

  it("gates the statement upload and the pages by tier", () => {
    expect(canUploadStatement("basic")).toBe(false);
    expect(canUploadStatement("standard")).toBe(true);
    expect(visibleNavItems("basic").map((i) => i.id)).toEqual(["dashboard", "settings", "security"]);
    expect(visibleNavItems("expert")).toHaveLength(8);
    expect(visibleNavItems("standard").some((i) => i.id === "compare")).toBe(false);
    expect(visibleNavItems("professional").some((i) => i.id === "compare")).toBe(true);
  });

  it("lists the supported currencies and marks the current one", () => {
    const items = currencyItems("EUR");
    expect(items.find((i) => i.code === "EUR")?.current).toBe(true);
    expect(items.filter((i) => i.current)).toHaveLength(1);
    expect(currencyItems(null).some((i) => i.current)).toBe(false);
  });
});
