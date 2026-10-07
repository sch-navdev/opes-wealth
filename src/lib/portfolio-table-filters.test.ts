import { describe, expect, it } from "vitest";
import {
  ALL_CATEGORIES,
  PILL_LABEL_KEYS,
  buildCategoryPills,
  filterByCategory,
  pillsWithSelection,
} from "@/lib/portfolio-table-filters";
import { translate } from "@/lib/i18n";

const row = (id: string, name: string | null) => ({ id, asset_categories: name === null ? null : { name } });
const rows = [
  row("1", "Cash"),
  row("2", "Real Estate"),
  row("3", "Cash"),
  row("4", "Equities"),
  row("5", "Mystery"),
  row("6", null),
];

describe("buildCategoryPills", () => {
  it("counts per category, ordered RE, Vehicles, PE, Equities, Cash, then others", () => {
    const pills = buildCategoryPills(rows);
    expect(pills.map((p) => [p.value, p.count])).toEqual([
      ["Real Estate", 1],
      ["Equities", 1],
      ["Cash", 2],
      ["Mystery", 1],
    ]);
  });
  it("maps to real translation keys and leaves unknown names unlabelled", () => {
    const pills = buildCategoryPills(rows);
    expect(pills.find((p) => p.value === "Real Estate")?.labelKey).toBe("category_real_estate");
    expect(pills.find((p) => p.value === "Mystery")?.labelKey).toBeNull();
    for (const key of Object.values(PILL_LABEL_KEYS)) expect(translate("en", key)).not.toBe(key);
  });
  it("returns nothing for no rows", () => {
    expect(buildCategoryPills([])).toEqual([]);
  });
  it("shows the proper noun Assurance-Vie as-is (no translation key) after the main classes", () => {
    const pills = buildCategoryPills([row("1", "Assurance-Vie"), row("2", "Cash"), row("3", "Real Estate")]);
    expect(pills.map((p) => p.value)).toEqual(["Real Estate", "Cash", "Assurance-Vie"]);
    expect(pills.find((p) => p.value === "Assurance-Vie")?.labelKey).toBeNull();
  });
});

describe("filterByCategory / pillsWithSelection", () => {
  it("returns all rows for All and matching rows otherwise (empty when none)", () => {
    expect(filterByCategory(rows, ALL_CATEGORIES)).toHaveLength(6);
    expect(filterByCategory(rows, "Cash").map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterByCategory(rows, "Vehicles")).toEqual([]);
  });
  it("keeps a selected category that has no rows as a zero-count pill", () => {
    const pills = buildCategoryPills(rows);
    expect(pillsWithSelection(pills, ALL_CATEGORIES)).toBe(pills);
    expect(pillsWithSelection(pills, "Cash")).toBe(pills);
    const kept = pillsWithSelection(pills, "Vehicles");
    expect(kept.at(-1)).toEqual({ value: "Vehicles", count: 0, labelKey: "category_vehicles" });
  });
});
