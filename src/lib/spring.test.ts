import { describe, expect, it } from "vitest";
import { MAX_OVERSHOOT, springProgress } from "./spring";

describe("springProgress", () => {
  it("starts at 0 and ends exactly at 1", () => {
    expect(springProgress(0)).toBe(0);
    expect(springProgress(1)).toBe(1);
    expect(springProgress(0, { bounce: 0.5 })).toBe(0);
    expect(springProgress(1, { bounce: 0.5 })).toBe(1);
  });
  it("clamps t outside 0..1 and non-finite input", () => {
    expect(springProgress(-3)).toBe(0);
    expect(springProgress(5)).toBe(1);
    expect(springProgress(NaN)).toBe(0);
  });
  it("is monotonic and never overshoots by default", () => {
    let prev = 0;
    for (let i = 0; i <= 200; i++) {
      const p = springProgress(i / 200);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeLessThanOrEqual(1);
      prev = p;
    }
  });
  it("is front-loaded (more than half done at t=0.3)", () => {
    expect(springProgress(0.3)).toBeGreaterThan(0.5);
  });
  it("bounce stays within 0..MAX_OVERSHOOT", () => {
    for (const bounce of [0, 0.1, 0.5, 0.9]) {
      for (let i = 0; i <= 200; i++) {
        const p = springProgress(i / 200, { bounce });
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(MAX_OVERSHOOT);
      }
    }
  });
});
