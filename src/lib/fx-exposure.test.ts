import { describe, expect, it } from "vitest";
import { buildFxExposure, sumByCurrency, type FxExposureInput } from "@/lib/fx-exposure";

const rows: FxExposureInput[] = [
  { currency: "EUR", assets: 600, liabilities: 100 },
  { currency: "USD", assets: 300, liabilities: 0 },
  { currency: "AED", assets: 200, liabilities: 100 },
  { currency: "EUR", assets: 100, liabilities: 0 },
];

describe("sumByCurrency", () => {
  it("sums per native currency, normalises codes and ignores non-finite amounts", () => {
    expect(
      sumByCurrency([
        { currency: "eur ", assets: 1, liabilities: 2 },
        { currency: "EUR", assets: 3, liabilities: Number.NaN },
        { currency: "", assets: Number.POSITIVE_INFINITY, liabilities: 5 },
      ]),
    ).toEqual([
      { currency: "EUR", assets: 4, liabilities: 2 },
      { currency: "???", assets: 0, liabilities: 5 },
    ]);
  });
});

describe("buildFxExposure", () => {
  it("computes gross, net, totals and shares per currency, sorted by net desc", () => {
    const fx = buildFxExposure(rows, { baseCurrency: "EUR" });
    expect(fx.totalAssets).toBe(1200);
    expect(fx.totalLiabilities).toBe(200);
    expect(fx.netWorth).toBe(1000);
    expect(fx.shareBasis).toBe("net");
    expect(fx.rows.map((r) => [r.label, r.assets, r.liabilities, r.net])).toEqual([
      ["EUR", 700, 100, 600],
      ["USD", 300, 0, 300],
      ["AED", 200, 100, 100],
    ]);
    expect(fx.rows.map((r) => r.share)).toEqual([60, 30, 10]);
    expect(fx.rows[0].isBase).toBe(true);
    expect(fx.hasLiabilities).toBe(true);
  });

  it("net per currency sums to net worth and shares to 100", () => {
    const fx = buildFxExposure(rows, { baseCurrency: "USD" });
    expect(fx.rows.reduce((s, r) => s + r.net, 0)).toBeCloseTo(fx.netWorth);
    expect(fx.rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(100);
  });

  it("non-base share is the share held outside the base currency", () => {
    expect(buildFxExposure(rows, { baseCurrency: "EUR" }).nonBaseShare).toBeCloseTo(40);
    expect(buildFxExposure(rows, { baseCurrency: "EUR" }).nonBaseNet).toBe(400);
    expect(buildFxExposure(rows, { baseCurrency: "USD" }).nonBaseShare).toBeCloseTo(70);
    expect(buildFxExposure(rows, { baseCurrency: "GBP" }).nonBaseShare).toBeCloseTo(100);
  });

  it("merges the pegged AED and USD into one block when grouping is on, and treats it as base for either", () => {
    const fx = buildFxExposure(rows, { baseCurrency: "USD", groupPeg: true });
    expect(fx.rows.map((r) => [r.key, r.label, r.net, r.isBase])).toEqual([
      ["EUR", "EUR", 600, false],
      ["AED+USD", "AED + USD", 400, true],
    ]);
    expect(fx.nonBaseShare).toBeCloseTo(60);
    expect(buildFxExposure(rows, { baseCurrency: "AED", groupPeg: true }).nonBaseShare).toBeCloseTo(60);
    // Base EUR: the merged block is entirely non-base.
    expect(buildFxExposure(rows, { baseCurrency: "EUR", groupPeg: true }).nonBaseShare).toBeCloseTo(40);
  });

  it("does not merge when only one of the pegged currencies is held", () => {
    const fx = buildFxExposure([{ currency: "AED", assets: 10, liabilities: 0 }], { baseCurrency: "EUR", groupPeg: true });
    expect(fx.rows[0].label).toBe("AED");
    expect(fx.rows[0].key).toBe("AED+USD");
  });

  it("flags a single non-base currency above the threshold, never the base currency", () => {
    const heavy = [
      { currency: "EUR", assets: 300, liabilities: 0 },
      { currency: "USD", assets: 620, liabilities: 0 },
      { currency: "GBP", assets: 80, liabilities: 0 },
    ];
    const fx = buildFxExposure(heavy, { baseCurrency: "EUR" });
    expect(fx.concentration).toMatchObject({ key: "USD", label: "USD" });
    expect(fx.concentration?.share).toBeCloseTo(62);
    expect(buildFxExposure(heavy, { baseCurrency: "USD" }).concentration).toBeNull();
    // exactly at the threshold is not above it
    expect(
      buildFxExposure(
        [
          { currency: "EUR", assets: 50, liabilities: 0 },
          { currency: "USD", assets: 50, liabilities: 0 },
        ],
        { baseCurrency: "EUR" },
      ).concentration,
    ).toBeNull();
  });

  it("peg grouping can create a concentration that single currencies would not", () => {
    const split = [
      { currency: "EUR", assets: 400, liabilities: 0 },
      { currency: "USD", assets: 300, liabilities: 0 },
      { currency: "AED", assets: 300, liabilities: 0 },
    ];
    expect(buildFxExposure(split, { baseCurrency: "EUR" }).concentration).toBeNull();
    expect(buildFxExposure(split, { baseCurrency: "EUR", groupPeg: true }).concentration?.label).toBe("AED + USD");
  });

  it("a liability in a currency offsets its assets (natural hedge) and can make that net negative", () => {
    const fx = buildFxExposure(
      [
        { currency: "EUR", assets: 1000, liabilities: 0 },
        { currency: "USD", assets: 100, liabilities: 400 },
      ],
      { baseCurrency: "EUR" },
    );
    const usd = fx.rows.find((r) => r.key === "USD")!;
    expect(usd.net).toBe(-300);
    expect(usd.share).toBeCloseTo(-300 / 700 * 100);
    expect(fx.netWorth).toBe(700);
    expect(fx.concentration).toBeNull();
    // sorted last
    expect(fx.rows.map((r) => r.key)).toEqual(["EUR", "USD"]);
  });

  it("falls back to gross-based shares (no NaN/Infinity) when net worth is zero or negative", () => {
    const fx = buildFxExposure(
      [
        { currency: "EUR", assets: 100, liabilities: 300 },
        { currency: "USD", assets: 100, liabilities: 0 },
      ],
      { baseCurrency: "EUR" },
    );
    expect(fx.netWorth).toBe(-100);
    expect(fx.shareBasis).toBe("gross");
    expect(fx.rows.map((r) => [r.key, r.share])).toEqual([
      ["EUR", 80],
      ["USD", 20],
    ]);
    expect(fx.nonBaseShare).toBeCloseTo(20);
    expect(fx.concentration).toBeNull();
    for (const r of fx.rows) expect(Number.isFinite(r.share)).toBe(true);

    const zero = buildFxExposure(
      [
        { currency: "EUR", assets: 100, liabilities: 100 },
        { currency: "USD", assets: 50, liabilities: 50 },
      ],
      { baseCurrency: "EUR" },
    );
    expect(zero.netWorth).toBe(0);
    expect(zero.shareBasis).toBe("gross");
    expect(zero.rows.map((r) => r.share)).toEqual([200 / 300 * 100, 100 / 300 * 100]);
  });

  it("handles no holdings at all", () => {
    for (const input of [[], [{ currency: "EUR", assets: 0, liabilities: 0 }]]) {
      const fx = buildFxExposure(input, { baseCurrency: "EUR" });
      expect(fx.rows).toEqual([]);
      expect(fx.shareBasis).toBe("none");
      expect(fx.nonBaseShare).toBeNull();
      expect(fx.concentration).toBeNull();
      expect(fx.netWorth).toBe(0);
      expect(fx.hasLiabilities).toBe(false);
    }
  });

  it("reports no liabilities when there are none", () => {
    expect(buildFxExposure([{ currency: "EUR", assets: 5, liabilities: 0 }], { baseCurrency: "EUR" }).hasLiabilities).toBe(false);
  });

  it("is stable: equal amounts order by label, and input order does not matter", () => {
    const a = buildFxExposure(
      [
        { currency: "GBP", assets: 10, liabilities: 0 },
        { currency: "CHF", assets: 10, liabilities: 0 },
        { currency: "EUR", assets: 10, liabilities: 0 },
      ],
      { baseCurrency: "EUR" },
    );
    expect(a.rows.map((r) => r.key)).toEqual(["CHF", "EUR", "GBP"]);
    const b = buildFxExposure([...rows].reverse(), { baseCurrency: "EUR" });
    expect(b.rows).toEqual(buildFxExposure(rows, { baseCurrency: "EUR" }).rows);
  });

  it("is case-insensitive for the base currency", () => {
    expect(buildFxExposure(rows, { baseCurrency: "eur" }).nonBaseShare).toBeCloseTo(40);
  });
});
