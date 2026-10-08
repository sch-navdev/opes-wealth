import { describe, expect, it } from "vitest";
import { dialArcs, dialTicks } from "./dial-geometry";

describe("dialTicks", () => {
  it("draws 60 minute ticks with an index every fifth", () => {
    const ticks = dialTicks(132);
    expect(ticks).toHaveLength(60);
    expect(ticks.filter((t) => t.major)).toHaveLength(12);
  });

  it("starts at 12 o'clock and keeps every tick inside the box", () => {
    const ticks = dialTicks(100);
    expect(ticks[0].x2).toBeCloseTo(50, 1);
    expect(ticks[0].y2).toBeCloseTo(1, 1);
    for (const t of ticks) for (const v of [t.x1, t.y1, t.x2, t.y2]) expect(v).toBeGreaterThanOrEqual(0);
    for (const t of ticks) for (const v of [t.x1, t.y1, t.x2, t.y2]) expect(v).toBeLessThanOrEqual(100);
  });

  it("makes the index ticks longer than the minute ticks", () => {
    const [major, minor] = [dialTicks(100)[0], dialTicks(100)[1]];
    const len = (t: typeof major) => Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
    expect(len(major)).toBeGreaterThan(len(minor));
  });
});

describe("dialArcs", () => {
  it("returns one arc per positive slice and drops zero, negative and non-finite ones", () => {
    const arcs = dialArcs(
      [
        { key: "a", share: 50 },
        { key: "b", share: 0 },
        { key: "c", share: -3 },
        { key: "d", share: Number.NaN },
        { key: "e", share: 50 },
      ],
      132,
      44,
    );
    expect(arcs.map((a) => a.key)).toEqual(["a", "e"]);
    expect(arcs.every((a) => a.path?.startsWith("M"))).toBe(true);
  });

  it("closes a single slice as a full ring (no path)", () => {
    expect(dialArcs([{ key: "only", share: 12 }], 132, 44)).toEqual([{ key: "only", share: 12, path: null, full: true }]);
  });

  it("returns nothing when there is nothing to draw", () => {
    expect(dialArcs([], 132, 44)).toEqual([]);
    expect(dialArcs([{ key: "a", share: 0 }], 132, 44)).toEqual([]);
  });

  it("flags the large-arc flag for a slice over half the ring", () => {
    const [big, small] = dialArcs(
      [
        { key: "big", share: 75 },
        { key: "small", share: 25 },
      ],
      100,
      40,
    );
    expect(big.path).toMatch(/ 0 1 1 /);
    expect(small.path).toMatch(/ 0 0 1 /);
  });

  it("starts the first arc at 12 o'clock, just after the half gap", () => {
    const [first] = dialArcs([{ key: "a", share: 60 }, { key: "b", share: 40 }], 100, 40);
    const m = first.path!.match(/^M([\d.]+) ([\d.]+)/)!;
    expect(Math.abs(Number(m[1]) - 50)).toBeLessThan(1.5);
    expect(Math.abs(Number(m[2]) - 10)).toBeLessThan(1.5);
  });
});
