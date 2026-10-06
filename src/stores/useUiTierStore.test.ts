import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPERTISE_LEVEL,
  EXPERTISE_LEVELS,
  tierRank,
  UI_TIER_COOKIE,
  buildTierCookie,
  parseExpertiseLevel,
  readTierFromCookieString,
  type ExpertiseLevel,
} from "@/stores/useUiTierStore";

// The persisted zustand store itself needs localStorage/rehydration (a browser), so only the
// exported level ladder and `tierRank` are exercised here.

describe("EXPERTISE_LEVELS", () => {
  it("is ordered from least to most advanced", () => {
    expect([...EXPERTISE_LEVELS]).toEqual(["basic", "standard", "professional", "expert"]);
  });

  it("has no duplicates", () => {
    expect(new Set(EXPERTISE_LEVELS).size).toBe(EXPERTISE_LEVELS.length);
  });

  it("defaults to a level that exists on the ladder", () => {
    expect(DEFAULT_EXPERTISE_LEVEL).toBe("standard");
    expect(EXPERTISE_LEVELS).toContain(DEFAULT_EXPERTISE_LEVEL);
  });
});

describe("tierRank", () => {
  it("returns the position on the ladder", () => {
    expect(tierRank("basic")).toBe(0);
    expect(tierRank("standard")).toBe(1);
    expect(tierRank("professional")).toBe(2);
    expect(tierRank("expert")).toBe(3);
  });

  it("is strictly increasing along the ladder, so a higher rank unlocks a lower one", () => {
    const ranks = EXPERTISE_LEVELS.map((l) => tierRank(l));
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
  });

  it("supports gating checks (rank >= required)", () => {
    const unlocks = (user: ExpertiseLevel, required: ExpertiseLevel) => tierRank(user) >= tierRank(required);
    expect(unlocks("expert", "basic")).toBe(true);
    expect(unlocks("standard", "standard")).toBe(true);
    expect(unlocks("basic", "professional")).toBe(false);
  });

  it("returns -1 for an unknown level (so it never satisfies a gate)", () => {
    expect(tierRank("godmode" as ExpertiseLevel)).toBe(-1);
  });
});

describe("tier cookie helpers", () => {
  it("builds a cookie string, Secure only on https", () => {
    expect(buildTierCookie("expert", false)).toBe(`${UI_TIER_COOKIE}=expert; Path=/; Max-Age=31536000; SameSite=Lax`);
    expect(buildTierCookie("basic", true)).toMatch(/; Secure$/);
  });

  it("validates values", () => {
    expect(parseExpertiseLevel("professional")).toBe("professional");
    expect(parseExpertiseLevel("admin")).toBeUndefined();
    expect(parseExpertiseLevel("")).toBeUndefined();
    expect(parseExpertiseLevel(undefined)).toBeUndefined();
  });

  it("reads the tier out of a cookie header", () => {
    expect(readTierFromCookieString("a=1; opes-ui-tier=basic; b=2")).toBe("basic");
    expect(readTierFromCookieString("opes-ui-tier=bogus")).toBeUndefined();
    expect(readTierFromCookieString("x=opes-ui-tier=basic")).toBeUndefined();
    expect(readTierFromCookieString("")).toBeUndefined();
  });
});
