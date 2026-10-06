import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPERTISE_LEVEL,
  EXPERTISE_LEVELS,
  tierRank,
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
