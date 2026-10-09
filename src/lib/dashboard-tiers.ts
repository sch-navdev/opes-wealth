import { tierRank, type ExpertiseLevel } from "@/stores/useUiTierStore";

/**
 * Which dashboard section shows at which UI tier (a UI preference, not access
 * control). `min` is the lowest tier that shows it; `max` (optional) the highest.
 *
 *  - basic: simplified net worth, allocation dial, top assets
 *  - standard / professional: bento grid, performance, cash flow, quick-add
 *  - professional and up: also the Global exposure (FX) bar
 *  - expert: everything, plus raw data, PE valuations, tax/depreciation, FX heatmap
 */
export type DashboardSection =
  | "basicOverview"
  | "fxExposure"
  | "bento"
  | "metricCards"
  | "allocation"
  | "dataQuality"
  | "analytics"
  | "cashFlow"
  | "quickAdd"
  | "csvUpload"
  | "portfolio"
  | "futureProjects"
  | "incomeCalendar"
  | "scpi"
  | "export"
  | "expertPanels";

type TierRange = { min: ExpertiseLevel; max?: ExpertiseLevel };

export const SECTION_TIERS: Record<DashboardSection, TierRange> = {
  basicOverview: { min: "basic", max: "basic" },
  fxExposure: { min: "professional" },
  bento: { min: "standard" },
  metricCards: { min: "standard" },
  allocation: { min: "standard" },
  dataQuality: { min: "standard" },
  analytics: { min: "standard" },
  cashFlow: { min: "standard" },
  quickAdd: { min: "standard" },
  csvUpload: { min: "standard" },
  portfolio: { min: "standard" },
  futureProjects: { min: "professional" },
  incomeCalendar: { min: "professional" },
  scpi: { min: "standard" },
  export: { min: "professional" },
  expertPanels: { min: "expert" },
};

export function isSectionVisible(section: DashboardSection, tier: ExpertiseLevel): boolean {
  const { min, max } = SECTION_TIERS[section];
  const rank = tierRank(tier);
  return rank >= tierRank(min) && (max === undefined || rank <= tierRank(max));
}

/**
 * Sidebar links. Single source of truth for which link shows at which UI tier:
 * a link either follows a dashboard section (so the link and the card it leads
 * to always appear together) or has its own plain minimum tier.
 */
export type NavLinkId = "dashboard" | "dataQuality" | "banking" | "brokerage" | "companies" | "planning" | "compare" | "cashFlowPage" | "settings" | "security";

type NavLinkRule = { section: DashboardSection } | { min: ExpertiseLevel };

export const NAV_LINK_TIERS: Record<NavLinkId, NavLinkRule> = {
  dashboard: { min: "basic" },
  dataQuality: { min: "standard" },
  banking: { section: "cashFlow" },
  brokerage: { min: "standard" },
  companies: { min: "professional" },
  planning: { section: "futureProjects" },
  compare: { min: "professional" },
  cashFlowPage: { min: "professional" },
  settings: { min: "basic" },
  security: { min: "basic" },
};

export function isNavLinkVisible(id: NavLinkId, tier: ExpertiseLevel): boolean {
  const rule = NAV_LINK_TIERS[id];
  return "section" in rule ? isSectionVisible(rule.section, tier) : tierRank(tier) >= tierRank(rule.min);
}

/** Entrance-animation settings for the dashboard tiles at a given tier. */
export type TierMotion = {
  /** Delay added per tile index, in ms (0 = all tiles enter together). */
  staggerMs: number;
  durationMs: number;
  /** Slide-up distance in px (0 = fade only). */
  offsetPx: number;
};

const TIER_MOTION: Record<ExpertiseLevel, TierMotion> = {
  // Calm: a short fade, nothing travels.
  basic: { staggerMs: 0, durationMs: 200, offsetPx: 0 },
  // The 21st.dev bento rhythm.
  standard: { staggerMs: 75, durationMs: 300, offsetPx: 8 },
  professional: { staggerMs: 60, durationMs: 350, offsetPx: 8 },
  // Dense screens: quick and tight so data is not kept waiting.
  expert: { staggerMs: 35, durationMs: 200, offsetPx: 4 },
};

export function tierMotion(tier: ExpertiseLevel): TierMotion {
  return TIER_MOTION[tier];
}

/** Inline style for the `index`-th tile of an entrance sequence. */
export function tileEntranceStyle(motion: TierMotion, index: number) {
  return {
    animationDelay: `${Math.max(0, index) * motion.staggerMs}ms`,
    animationDuration: `${motion.durationMs}ms`,
    animationFillMode: "backwards",
    "--tw-enter-translate-y": `${motion.offsetPx}px`,
  } as const;
}

/* ---------- pure data builders for the tier panels ---------- */

export type AmountRow = { id: string; name: string; category: string; amount: number };

export type AllocationSlice = { category: string; amount: number; share: number };

/** Positive amounts grouped by category, largest first; `share` is 0-100 of the positive total. */
export function buildAllocation(rows: AmountRow[]): AllocationSlice[] {
  const byCategory = new Map<string, number>();
  for (const row of rows) {
    if (!(row.amount > 0)) continue;
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.amount);
  }
  const total = [...byCategory.values()].reduce((sum, v) => sum + v, 0);
  return [...byCategory.entries()]
    .map(([category, amount]) => ({ category, amount, share: total > 0 ? (amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

/** The `limit` largest positive holdings. */
export function topAssets(rows: AmountRow[], limit = 5): AmountRow[] {
  return rows
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit));
}

export type ExposureRow = { currency: string; category: string; amount: number };

export type ExposureCell = { currency: string; category: string; amount: number; share: number };

export type CurrencyExposure = {
  currencies: { currency: string; amount: number; share: number }[];
  categories: string[];
  cells: ExposureCell[];
  /** Largest cell amount, for scaling heat intensity. */
  maxCell: number;
};

/**
 * Gross exposure by native currency x category (positive amounts only, in the
 * Base Currency), for the multi-currency heatmap. `share` is 0-100 of the total.
 */
export function buildCurrencyExposure(rows: ExposureRow[]): CurrencyExposure {
  const cellMap = new Map<string, ExposureCell>();
  const currencyTotals = new Map<string, number>();
  const categoryTotals = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    if (!(row.amount > 0)) continue;
    const key = `${row.currency}\u0000${row.category}`;
    const cell = cellMap.get(key) ?? { currency: row.currency, category: row.category, amount: 0, share: 0 };
    cell.amount += row.amount;
    cellMap.set(key, cell);
    currencyTotals.set(row.currency, (currencyTotals.get(row.currency) ?? 0) + row.amount);
    categoryTotals.set(row.category, (categoryTotals.get(row.category) ?? 0) + row.amount);
    total += row.amount;
  }
  const cells = [...cellMap.values()].map((c) => ({ ...c, share: total > 0 ? (c.amount / total) * 100 : 0 }));
  return {
    currencies: [...currencyTotals.entries()]
      .map(([currency, amount]) => ({ currency, amount, share: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency)),
    categories: [...categoryTotals.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([category]) => category),
    cells,
    maxCell: cells.reduce((max, c) => Math.max(max, c.amount), 0),
  };
}
