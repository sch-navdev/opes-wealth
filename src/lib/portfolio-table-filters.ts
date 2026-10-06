import type { TranslationKey } from "@/lib/i18n";

/** Pill value meaning "no category filter". Real category names never equal this. */
export const ALL_CATEGORIES = "__all__";

type RowWithCategory = { asset_categories: { name: string } | null };

/** Translation keys for the category names stored in `asset_categories.name` (same names as the dashboard folders). */
export const PILL_LABEL_KEYS: Record<string, TranslationKey> = {
  "Real Estate": "category_real_estate",
  Vehicles: "category_vehicles",
  "Private Equity": "category_private_equity",
  Equities: "category_equities",
  Cash: "category_cash",
  SCPI: "category_scpi",
  Crypto: "category_crypto",
  "Precious Metals": "category_precious_metals",
  "Exotic Assets": "category_exotic_assets",
  Startups: "category_startups",
  Companies: "category_companies",
  Liabilities: "category_liabilities",
};

/** Display order: the main holding classes first, then any others in first-seen order. */
const PILL_ORDER = ["Real Estate", "Vehicles", "Private Equity", "Equities", "Cash"];

export type CategoryPill = {
  /** Category name (the filter value). */
  value: string;
  count: number;
  /** Translation key for the label, or null to show `value` as-is (unknown / custom category). */
  labelKey: TranslationKey | null;
};

/** One pill per category that has at least one row, in display order. Does not include "All". */
export function buildCategoryPills(rows: RowWithCategory[]): CategoryPill[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = row.asset_categories?.name;
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const rank = (name: string) => {
    const i = PILL_ORDER.indexOf(name);
    return i === -1 ? PILL_ORDER.length : i;
  };
  // Array.sort is stable, so unranked names keep first-seen order.
  return [...counts.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([value, count]) => ({ value, count, labelKey: PILL_LABEL_KEYS[value] ?? null }));
}

/** Rows in the selected category; "All" resolves to every row. */
export function filterByCategory<T extends RowWithCategory>(rows: T[], selected: string): T[] {
  if (selected === ALL_CATEGORIES) return rows;
  return rows.filter((row) => row.asset_categories?.name === selected);
}

/**
 * Pills to render: every category with rows, plus the currently selected one even when it has
 * just run out of rows (count 0), so the filter never silently jumps back to "All".
 */
export function pillsWithSelection(pills: CategoryPill[], selected: string): CategoryPill[] {
  if (selected === ALL_CATEGORIES || pills.some((p) => p.value === selected)) return pills;
  return [...pills, { value: selected, count: 0, labelKey: PILL_LABEL_KEYS[selected] ?? null }];
}
