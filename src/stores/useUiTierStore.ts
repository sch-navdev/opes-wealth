import { create } from "zustand";
import { persist } from "zustand/middleware";

export const EXPERTISE_LEVELS = ["basic", "standard", "professional", "expert"] as const;
export type ExpertiseLevel = (typeof EXPERTISE_LEVELS)[number];

export const DEFAULT_EXPERTISE_LEVEL: ExpertiseLevel = "standard";

/** Position in the ladder; a higher rank unlocks everything a lower one does. */
export function tierRank(level: ExpertiseLevel): number {
  return EXPERTISE_LEVELS.indexOf(level);
}

type UiTierState = {
  user_expertise_level: ExpertiseLevel;
  setExpertiseLevel: (level: ExpertiseLevel) => void;
};

/**
 * UI-only preference, kept in localStorage. It decides which navigation links
 * are shown; it is not an access-control boundary (routes stay reachable and
 * the auth/AAL2 guards are unaffected). `skipHydration` keeps the first client
 * render identical to the server's; call `useUiTierStore.persist.rehydrate()`
 * once after mount.
 */
export const useUiTierStore = create<UiTierState>()(
  persist(
    (set) => ({
      user_expertise_level: DEFAULT_EXPERTISE_LEVEL,
      setExpertiseLevel: (level) => set({ user_expertise_level: level }),
    }),
    {
      name: "opes-ui-tier",
      skipHydration: true,
      partialize: (s) => ({ user_expertise_level: s.user_expertise_level }),
      merge: (persisted, current) => {
        const level = (persisted as Partial<UiTierState> | undefined)?.user_expertise_level;
        return level && EXPERTISE_LEVELS.includes(level)
          ? { ...current, user_expertise_level: level }
          : current;
      },
    },
  ),
);
