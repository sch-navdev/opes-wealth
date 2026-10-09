import { describe, expect, it } from "vitest";
import { buildFxExposure } from "@/lib/fx-exposure";
import {
  EMPTY_FX_TARGETS,
  FX_TARGET_DEFAULT_TOLERANCE,
  clampTolerance,
  computeFxDrift,
  driftStatus,
  hasTargets,
  parseFxTargets,
  serializeFxTargets,
  targetBoundaries,
  targetsTotal,
  withTarget,
} from "@/lib/fx-target";

const fx = buildFxExposure(
  [
    { currency: "EUR", assets: 500, liabilities: 0 },
    { currency: "USD", assets: 300, liabilities: 0 },
    { currency: "AED", assets: 200, liabilities: 0 },
  ],
  { baseCurrency: "EUR" },
);

describe("parseFxTargets", () => {
  it("round-trips through serialize", () => {
    const t = withTarget(withTarget(EMPTY_FX_TARGETS, "EUR", 50), "USD", 30.04);
    expect(parseFxTargets(serializeFxTargets({ ...t, tolerance: 3 }))).toEqual({ targets: { EUR: 50, USD: 30 }, tolerance: 3 });
  });

  it("never throws and treats garbage as no targets with the default tolerance", () => {
    for (const bad of ["", "not json", "[]", "null", "42", undefined, null, 7, { targets: "x" }]) {
      const out = parseFxTargets(bad);
      expect(out.targets).toEqual({});
      expect(out.tolerance).toBe(FX_TARGET_DEFAULT_TOLERANCE);
    }
  });

  it("drops invalid keys and values, normalises keys, clamps the tolerance", () => {
    const out = parseFxTargets(
      JSON.stringify({ targets: { eur: 40, "AED+USD": 20, "bad key!": 10, GBP: -1, CHF: 101, JPY: "9", XXX: null }, tolerance: 999 }),
    );
    expect(out.targets).toEqual({ EUR: 40, "AED+USD": 20 });
    expect(out.tolerance).toBe(50);
    expect(clampTolerance(-3)).toBe(0);
    expect(clampTolerance(Number.NaN)).toBe(FX_TARGET_DEFAULT_TOLERANCE);
  });
});

describe("withTarget", () => {
  it("sets, clamps and removes", () => {
    let t = withTarget(EMPTY_FX_TARGETS, "EUR", 140);
    expect(t.targets.EUR).toBe(100);
    t = withTarget(t, "EUR", -5);
    expect(t.targets.EUR).toBe(0);
    t = withTarget(t, "EUR", null);
    expect(hasTargets(t)).toBe(false);
    expect(withTarget(t, "EUR", Number.NaN).targets).toEqual({});
    expect(EMPTY_FX_TARGETS.targets).toEqual({}); // never mutated
  });

  it("sums the targets that were set", () => {
    expect(targetsTotal({ targets: { EUR: 40, USD: 25.5 }, tolerance: 5 })).toBe(65.5);
  });
});

describe("driftStatus", () => {
  it("treats the band edge as within, and is signed", () => {
    expect(driftStatus(5, 5)).toBe("within");
    expect(driftStatus(-5, 5)).toBe("within");
    expect(driftStatus(5.1, 5)).toBe("over");
    expect(driftStatus(-5.1, 5)).toBe("under");
    expect(driftStatus(0, 0)).toBe("within");
  });
});

describe("computeFxDrift", () => {
  it("is inactive without targets or without a net-worth basis", () => {
    expect(computeFxDrift(fx, EMPTY_FX_TARGETS).active).toBe(false);
    const negative = buildFxExposure([{ currency: "EUR", assets: 10, liabilities: 50 }], { baseCurrency: "EUR" });
    expect(computeFxDrift(negative, { targets: { EUR: 50 }, tolerance: 5 }).active).toBe(false);
  });

  it("computes signed drift in points only for segments with a target", () => {
    const d = computeFxDrift(fx, { targets: { EUR: 40, USD: 30, AED: 28 }, tolerance: 5 });
    const by = Object.fromEntries(d.rows.map((r) => [r.key, r]));
    expect(by.EUR).toMatchObject({ share: 50, target: 40, drift: 10, status: "over" });
    expect(by.USD).toMatchObject({ drift: 0, status: "within" });
    expect(by.AED.drift).toBeCloseTo(-8, 9);
    expect(by.AED.status).toBe("under");
    expect(computeFxDrift(fx, { targets: { EUR: 40 }, tolerance: 5 }).rows.map((r) => r.key)).toEqual(["EUR"]);
  });

  it("keeps a target for a segment that holds nothing, reading under target", () => {
    const d = computeFxDrift(fx, { targets: { GBP: 10 }, tolerance: 5 });
    expect(d.rows).toEqual([{ key: "GBP", label: "GBP", share: 0, target: 10, drift: -10, status: "under" }]);
    expect(d.complete).toBe(false);
  });

  it("is complete only when every bar segment has a target and they add up to 100", () => {
    expect(computeFxDrift(fx, { targets: { EUR: 40, USD: 30, AED: 30 }, tolerance: 5 }).complete).toBe(true);
    expect(computeFxDrift(fx, { targets: { EUR: 40, USD: 30 }, tolerance: 5 }).complete).toBe(false);
    expect(computeFxDrift(fx, { targets: { EUR: 40, USD: 30, AED: 20 }, tolerance: 5 }).complete).toBe(false);
  });

  it("uses a merged peg block key when the peg grouping is on", () => {
    const pegged = buildFxExposure(
      [
        { currency: "EUR", assets: 500, liabilities: 0 },
        { currency: "USD", assets: 300, liabilities: 0 },
        { currency: "AED", assets: 200, liabilities: 0 },
      ],
      { baseCurrency: "EUR", groupPeg: true },
    );
    const d = computeFxDrift(pegged, { targets: { "AED+USD": 40 }, tolerance: 5 });
    expect(d.rows[0]).toMatchObject({ key: "AED+USD", label: "AED + USD", share: 50, drift: 10 });
  });
});

describe("targetBoundaries", () => {
  it("returns cumulative target positions in bar order, excluding the end of the bar", () => {
    const b = targetBoundaries(fx.rows, { targets: { EUR: 40, USD: 30, AED: 30 }, tolerance: 5 });
    expect(b).toEqual([
      { key: "EUR", at: 40 },
      { key: "USD", at: 70 },
    ]);
  });
});
