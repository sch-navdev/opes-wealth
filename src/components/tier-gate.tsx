"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useInitialTier } from "@/components/tier-provider";
import { DEFAULT_EXPERTISE_LEVEL, useUiTierStore, type ExpertiseLevel } from "@/stores/useUiTierStore";
import {
  isSectionVisible,
  tierMotion,
  type DashboardSection,
  type TierMotion,
} from "@/lib/dashboard-tiers";

const subscribeHydration = (cb: () => void) => useUiTierStore.persist.onFinishHydration(cb);
const getHydrated = () => useUiTierStore.persist.hasHydrated();
const getServerHydrated = () => false;

/**
 * The active UI tier. Until the persisted store has rehydrated this returns the
 * tier the server read from the cookie (via TierProvider, else the default), which
 * matches the server render, so there is no hydration mismatch or flash; afterwards
 * it is the store value.
 */
export function useUiTier(): ExpertiseLevel {
  const initial = useInitialTier() ?? DEFAULT_EXPERTISE_LEVEL;
  const hydrated = useSyncExternalStore(subscribeHydration, getHydrated, getServerHydrated);
  const stored = useUiTierStore((s) => s.user_expertise_level);
  return hydrated ? stored : initial;
}

/** Entrance-animation settings for the active tier. */
export function useTierMotion(): TierMotion {
  return tierMotion(useUiTier());
}

/**
 * Renders `children` only when `section` is shown at the active UI tier (see
 * `lib/dashboard-tiers.ts`). A client wrapper so the server-rendered dashboard
 * page can pass server components through it: the page still fetches everything
 * once and the tier only decides what is displayed. UI preference, not access control.
 */
export function TierGate({ section, children }: { section: DashboardSection; children: ReactNode }) {
  const tier = useUiTier();
  return isSectionVisible(section, tier) ? <>{children}</> : null;
}
