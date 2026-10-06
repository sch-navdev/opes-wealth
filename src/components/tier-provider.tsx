"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ExpertiseLevel } from "@/stores/useUiTierStore";

const InitialTierContext = createContext<ExpertiseLevel | undefined>(undefined);

/**
 * Carries the tier the server read from the `opes-ui-tier` cookie, so the first
 * server render (and hydration) already matches the user's choice. Deliberately
 * React context and NOT `useUiTierStore.setState`: on the server a module-level
 * store is shared across requests and would leak one user's tier to another.
 */
export function TierProvider({
  initialTier,
  children,
}: {
  initialTier: ExpertiseLevel | undefined;
  children: ReactNode;
}) {
  return <InitialTierContext.Provider value={initialTier}>{children}</InitialTierContext.Provider>;
}

/** The server-provided tier (undefined when there was no valid cookie). */
export function useInitialTier(): ExpertiseLevel | undefined {
  return useContext(InitialTierContext);
}
