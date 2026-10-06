import { describe, expect, it } from "vitest";
import { buildSparkline, sparklinePath, sparklineTrend } from "./sparkline";

describe("buildSparkline", () => {
  it("returns [] for fewer than 2 usable points", () => {
    expect(buildSparkline([])).toEqual([]);
    expect(buildSparkline([["2024-01-01", 1]])).toEqual([]);
    expect(buildSparkline([["2024-01-01", 1], ["2024-01-02", NaN]])).toEqual([]);
  });
  it("sorts by date and drops non-finite", () => {
    expect(buildSparkline([["2024-01-03", 3], ["2024-01-01", 1], ["2024-01-02", Infinity], ["2024-01-02", 2]])).toEqual([1, 2, 3]);
  });
  it("downsamples evenly, keeping first and last", () => {
    const pts: [string, number][] = Array.from({ length: 100 }, (_, i) => [`2024-01-${String(i).padStart(3, "0")}`, i]);
    const out = buildSparkline(pts, 24);
    expect(out).toHaveLength(24);
    expect(out[0]).toBe(0);
    expect(out[23]).toBe(99);
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
  });
});

describe("sparklinePath", () => {
  it("inverts y so higher values are higher on screen", () => {
    const p = sparklinePath([0, 10], 100, 20, 0);
    expect(p).toBe("M 0 20 L 100 0");
  });
  it("draws flat series as a centred line, never NaN", () => {
    const p = sparklinePath([5, 5, 5], 60, 20);
    expect(p).not.toContain("NaN");
    expect(p).toBe("M 1 10 L 30 10 L 59 10");
  });
  it("handles empty and single values", () => {
    expect(sparklinePath([], 10, 10)).toBe("");
    expect(sparklinePath([3], 10, 10)).not.toContain("NaN");
  });
});

describe("sparklineTrend", () => {
  it("classifies", () => {
    expect(sparklineTrend([1, 2, 3])).toBe("up");
    expect(sparklineTrend([3, 2, 1])).toBe("down");
    expect(sparklineTrend([2, 9, 2])).toBe("flat");
    expect(sparklineTrend([])).toBe("flat");
  });
  it("handles negative series", () => {
    expect(sparklineTrend([-10, -5])).toBe("up");
  });
});
