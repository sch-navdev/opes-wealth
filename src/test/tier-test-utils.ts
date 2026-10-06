import { vi } from "vitest";

/**
 * Fresh copies of the UI-tier modules for one test.
 *
 * `useUiTierStore` is created with `skipHydration` and zustand's persist keeps its
 * "hydrated" flag in a closure with no reset API, so a store that one test rehydrated
 * would look hydrated to the next. Clearing the registry and re-importing gives every
 * test a brand-new, un-hydrated store (and TierGate/UiTierPreference bound to it).
 * React and Testing Library are node_modules externals and are not reloaded.
 * Also clears localStorage and the tier cookie.
 */
export async function loadTierModules() {
  localStorage.clear();
  document.cookie = "opes-ui-tier=; Path=/; Max-Age=0";
  vi.resetModules();
  const [store, gate, provider, pref, lang] = await Promise.all([
    import("@/stores/useUiTierStore"),
    import("@/components/tier-gate"),
    import("@/components/tier-provider"),
    import("@/components/ui-tier-preference"),
    import("@/context/language-context"),
  ]);
  return { ...store, ...gate, ...provider, ...pref, ...lang };
}

/** Writes what zustand persist would have stored, so `rehydrate()` picks it up. */
export function persistTier(level: string) {
  localStorage.setItem("opes-ui-tier", JSON.stringify({ state: { user_expertise_level: level }, version: 0 }));
}
