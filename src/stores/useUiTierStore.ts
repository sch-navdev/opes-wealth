import { create } from "zustand";
import { persist } from "zustand/middleware";

export const EXPERTISE_LEVELS = ["basic", "standard", "professional", "expert"] as const;
export type ExpertiseLevel = (typeof EXPERTISE_LEVELS)[number];

export const DEFAULT_EXPERTISE_LEVEL: ExpertiseLevel = "standard";

/** Position in the ladder; a higher rank unlocks everything a lower one does. */
export function tierRank(level: ExpertiseLevel): number {
  return EXPERTISE_LEVELS.indexOf(level);
}

export const UI_TIER_COOKIE = "opes-ui-tier";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Validates a raw cookie/storage value; anything that is not a known level -> undefined. */
export function parseExpertiseLevel(value: string | null | undefined): ExpertiseLevel | undefined {
  return (EXPERTISE_LEVELS as readonly string[]).includes(value ?? "")
    ? (value as ExpertiseLevel)
    : undefined;
}

/**
 * Builds the `document.cookie` string mirroring the tier. Non-sensitive UI
 * preference (not access control), so it is intentionally readable by script.
 * `Secure` only on https so local http dev still works.
 */
export function buildTierCookie(level: ExpertiseLevel, secure: boolean): string {
  return `${UI_TIER_COOKIE}=${level}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** Extracts the tier from a raw `Cookie`/`document.cookie` header string. */
export function readTierFromCookieString(cookieString: string): ExpertiseLevel | undefined {
  for (const part of cookieString.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === UI_TIER_COOKIE) return parseExpertiseLevel(part.slice(idx + 1).trim());
  }
  return undefined;
}

/** Client-only; writes the cookie when it is missing or differs. */
function syncTierCookie(level: ExpertiseLevel) {
  if (typeof document === "undefined") return;
  if (readTierFromCookieString(document.cookie) === level) return;
  document.cookie = buildTierCookie(level, window.location.protocol === "https:");
}

type UiTierState = {
  user_expertise_level: ExpertiseLevel;
  setExpertiseLevel: (level: ExpertiseLevel) => void;
};

/**
 * UI-only preference, kept in localStorage and mirrored to the `opes-ui-tier`
 * cookie so the server can render the right tier on the first paint (see
 * dashboard/layout.tsx + TierProvider). Caveat: a user with a stored non-default tier
 * but no cookie yet sees one flash, ever; the cookie is written on first rehydrate. It decides which navigation links
 * are shown; it is not an access-control boundary (routes stay reachable and
 * the auth/AAL2 guards are unaffected). `skipHydration` keeps the first client
 * render identical to the server's; call `useUiTierStore.persist.rehydrate()`
 * once after mount.
 */
export const useUiTierStore = create<UiTierState>()(
  persist(
    (set) => ({
      user_expertise_level: DEFAULT_EXPERTISE_LEVEL,
      setExpertiseLevel: (level) => {
        set({ user_expertise_level: level });
        syncTierCookie(level);
      },
    }),
    {
      name: "opes-ui-tier",
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (state) syncTierCookie(state.user_expertise_level);
      },
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
