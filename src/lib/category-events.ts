/**
 * A tiny page-level signal: "open the explorer for this asset category". The allocation dial (a separate
 * dashboard block) sends it; `DashboardAnalytics`, which owns the explorer state, listens. Nothing happens
 * when no listener is mounted (for example in the Basic tier, which has no explorer).
 */
export const OPEN_CATEGORY_EVENT = "opes:open-category";

export function requestOpenCategory(category: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(OPEN_CATEGORY_EVENT, { detail: category }));
}
