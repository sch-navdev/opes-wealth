import { isSectionVisible } from "@/lib/dashboard-tiers";
import { currencies } from "@/lib/currencies";
import type { TranslationKey } from "@/lib/i18n";
import type { ExpertiseLevel } from "@/stores/useUiTierStore";

/** Light holding row the dashboard layout loads for the command palette. */
export type CommandHolding = {
  id: string;
  name: string;
  ticker_symbol: string | null;
  category: string | null;
  is_liability: boolean;
};

/** Upper bound on holdings sent to the client for the palette. */
export const MAX_COMMAND_HOLDINGS = 200;

export function holdingHref(id: string): string {
  return `/dashboard/assets/${encodeURIComponent(id)}`;
}

/** De-duplicates by id, sorts by name and caps the list. */
export function capHoldings(holdings: CommandHolding[], max = MAX_COMMAND_HOLDINGS): CommandHolding[] {
  const seen = new Set<string>();
  const unique: CommandHolding[] = [];
  for (const h of holdings) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    unique.push(h);
  }
  return unique.sort((a, b) => a.name.localeCompare(b.name)).slice(0, Math.max(0, max));
}

/** Text the palette search matches a holding against. */
export function holdingKeywords(h: CommandHolding): string[] {
  return [h.name, h.ticker_symbol ?? "", h.category ?? ""].filter(Boolean);
}

/** True when every whitespace-separated token of `search` occurs in `haystack` (case-insensitive). */
export function matchesSearch(haystack: string, search: string): boolean {
  const text = haystack.toLowerCase();
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => text.includes(token));
}

/** The three views offered in "Switch view" (Standard stays reachable from the sidebar / settings). */
export const SWITCHABLE_TIERS = ["basic", "professional", "expert"] as const satisfies readonly ExpertiseLevel[];

export const TIER_NAME_KEYS: Record<ExpertiseLevel, TranslationKey> = {
  basic: "tier_basic",
  standard: "tier_standard",
  professional: "tier_professional",
  expert: "tier_expert",
};

export function tierSwitchItems(current: ExpertiseLevel) {
  return SWITCHABLE_TIERS.map((level) => ({ level, nameKey: TIER_NAME_KEYS[level], current: level === current }));
}

/** The statement import card only exists from Standard up. */
export function canUploadStatement(tier: ExpertiseLevel): boolean {
  return isSectionVisible("csvUpload", tier);
}

export function currencyItems(current: string | null) {
  return currencies.map((c) => ({ code: c.code, name: c.name, current: c.code === current }));
}
