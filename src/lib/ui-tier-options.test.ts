import { describe, expect, it } from "vitest";
import { EXPERTISE_LEVELS } from "@/stores/useUiTierStore";
import { TIER_OPTION_KEYS, tierForKey } from "@/lib/ui-tier-options";
import { translate } from "@/lib/i18n";

describe("tierForKey", () => {
  it("moves forward and backward with wrap-around", () => {
    expect(tierForKey("basic", "ArrowRight")).toBe("standard");
    expect(tierForKey("basic", "ArrowDown")).toBe("standard");
    expect(tierForKey("expert", "ArrowRight")).toBe("basic");
    expect(tierForKey("basic", "ArrowLeft")).toBe("expert");
    expect(tierForKey("professional", "ArrowUp")).toBe("standard");
  });

  it("supports Home/End and ignores other keys", () => {
    expect(tierForKey("standard", "Home")).toBe("basic");
    expect(tierForKey("standard", "End")).toBe("expert");
    expect(tierForKey("standard", "Tab")).toBeUndefined();
  });
});

describe("TIER_OPTION_KEYS", () => {
  it("has English and French copy for every tier", () => {
    for (const level of EXPERTISE_LEVELS) {
      for (const k of [TIER_OPTION_KEYS[level].name, TIER_OPTION_KEYS[level].desc]) {
        expect(translate("en", k).length).toBeGreaterThan(0);
        expect(translate("fr", k).length).toBeGreaterThan(0);
      }
    }
  });

  it("interpolates the confirmation message", () => {
    expect(translate("en", "prefs_tier_saved", { tier: "Expert" })).toBe("Dashboard view set to Expert");
  });
});
