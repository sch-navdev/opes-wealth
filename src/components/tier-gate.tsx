"use client";

import type { ReactNode } from "react";
import { useUiTierStore, type ExpertiseLevel } from "@/stores/useUiTierStore";
import {
  isSectionVisible,
  tierMotion,
  type DashboardSection,
  type TierMotion,
} from "@/lib/dashboard-tiers";

/** The active UI tier (default `standard` until the persisted choice rehydrates). */
export function useUiTier(): ExpertiseLevel {
  return useUiTierStore((s) => s.user_expertise_level);
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
