import { EXPERTISE_LEVELS, type ExpertiseLevel } from "@/stores/useUiTierStore";
import type { TranslationKey } from "@/lib/i18n";

/** Translation keys for each tier's name and one-line description. */
export const TIER_OPTION_KEYS: Record<ExpertiseLevel, { name: TranslationKey; desc: TranslationKey }> = {
  basic: { name: "tier_basic", desc: "prefs_tier_basic_desc" },
  standard: { name: "tier_standard", desc: "prefs_tier_standard_desc" },
  professional: { name: "tier_professional", desc: "prefs_tier_professional_desc" },
  expert: { name: "tier_expert", desc: "prefs_tier_expert_desc" },
};

/**
 * Radio-group arrow-key navigation (WAI-ARIA): Right/Down = next, Left/Up = previous,
 * both wrapping; Home/End jump to the ends. Returns undefined for any other key.
 */
export function tierForKey(current: ExpertiseLevel, key: string): ExpertiseLevel | undefined {
  const last = EXPERTISE_LEVELS.length - 1;
  const i = EXPERTISE_LEVELS.indexOf(current);
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return EXPERTISE_LEVELS[i >= last ? 0 : i + 1];
    case "ArrowLeft":
    case "ArrowUp":
      return EXPERTISE_LEVELS[i <= 0 ? last : i - 1];
    case "Home":
      return EXPERTISE_LEVELS[0];
    case "End":
      return EXPERTISE_LEVELS[last];
    default:
      return undefined;
  }
}
