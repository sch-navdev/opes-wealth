import { describe, expect, it } from "vitest";
import {
  AGGREGATE_LINE_KEY,
  DEFAULT_CHART_WINDOW,
  PORTFOLIO_PERFORMANCE_TOTAL_KEY,
  assetLineKey,
  buildChartSeries,
  buildHistoricalLines,
  buildInvestedLines,
  buildNetWorthSeries,
  buildProjectedLines,
  clipSeries,
  combineHistoryAndProjection,
  estimateAssetGrowth,
  isCustomWindow,
  mergeLineSeries,
  rangeStartDate,
  suffixSeriesKeys,
  thinHistory,
  windowBounds,
  type AssetHistoryInput,
  type AssetLineInput,
  type LineSeries,
} from "@/lib/portfolio-performance";

const ts = (d: string) => new Date(d).getTime();

describe("buildNetWorthSeries", () => {
  it("returns an empty series when there are no assets or no history", () => {
    expect(buildNetWorthSeries([])).toEqual({ points: [], categories: [], categoryStart: {} });
    expect(buildNetWorthSeries([{ category: "Cash", history: [] }], "2025-01-01")).toEqual({
      points: [],
      categories: [],
      categoryStart: {},
    });
  });

  it("handles a single history point", () => {
    const res = buildNetWorthSeries([
      { category: "Cash", history: [{ recorded_date: "2024-05-05", value: 10, net_equity: 10 }] },
    ]);
    expect(res.points).toEqual([{ date: "2024-05-05", total: 10, Cash: 10 }]);
    expect(res.categories).toEqual(["Cash"]);
    expect(res.categoryStart).toEqual({ Cash: "2024-05-05" });
  });

  const assets: AssetHistoryInput[] = [
    {
      category: "Equities",
      history: [
        { recorded_date: "2024-03-01", value: 150, net_equity: null },
        { recorded_date: "2024-01-01", value: 100, net_equity: 100 },
      ],
    },
    {
      category: "Real Estate",
      history: [{ recorded_date: "2024-02-01", value: 1000, net_equity: 400 }],
    },
  ];

  it("forward-fills each asset and treats it as 0 before its first row", () => {
    const res = buildNetWorthSeries(assets);
    expect(res.points.map((p) => p.date)).toEqual(["2024-01-01", "2024-02-01", "2024-03-01"]);
    expect(res.points.map((p) => p[PORTFOLIO_PERFORMANCE_TOTAL_KEY])).toEqual([100, 500, 550]);
    expect(res.points.map((p) => p["Real Estate"])).toEqual([0, 400, 400]);
    expect(res.points.map((p) => p["Equities"])).toEqual([100, 100, 150]);
  });

  it("uses net_equity over value, and falls back to value when net_equity is null", () => {
    const res = buildNetWorthSeries(assets);
    // Real Estate: net_equity 400 (not value 1000); Equities 2024-03-01: null -> value 150
    expect(res.points[1]["Real Estate"]).toBe(400);
    expect(res.points[2]["Equities"]).toBe(150);
  });

  it("honours a net_equity of 0 (does not fall back to value)", () => {
    const res = buildNetWorthSeries([
      { category: "Real Estate", history: [{ recorded_date: "2024-01-01", value: 500, net_equity: 0 }] },
    ]);
    expect(res.points[0].total).toBe(0);
  });

  it("supports negative net equity (debt exceeding value)", () => {
    const res = buildNetWorthSeries([
      { category: "Real Estate", history: [{ recorded_date: "2024-01-01", value: 500, net_equity: -50 }] },
    ]);
    expect(res.points[0].total).toBe(-50);
  });

  it("returns sorted categories and each category's earliest date", () => {
    const res = buildNetWorthSeries(assets);
    expect(res.categories).toEqual(["Equities", "Real Estate"]);
    expect(res.categoryStart).toEqual({ Equities: "2024-01-01", "Real Estate": "2024-02-01" });
  });

  it("sums several assets of the same category", () => {
    const res = buildNetWorthSeries([
      { category: "Cash", history: [{ recorded_date: "2024-01-01", value: 10, net_equity: 10 }] },
      { category: "Cash", history: [{ recorded_date: "2024-01-01", value: 5, net_equity: 5 }] },
    ]);
    expect(res.points[0].Cash).toBe(15);
    expect(res.points[0].total).toBe(15);
  });

  it("extends to throughDate with the last known values, but never shortens", () => {
    const extended = buildNetWorthSeries(assets, "2024-06-01");
    const last = extended.points[extended.points.length - 1];
    expect(last).toEqual({ date: "2024-06-01", total: 550, Equities: 150, "Real Estate": 400 });
    expect(extended.points).toHaveLength(4);

    expect(buildNetWorthSeries(assets, "2024-03-01").points).toHaveLength(3);
    expect(buildNetWorthSeries(assets, "2023-01-01").points).toHaveLength(3);
  });

  it("does not mutate its input", () => {
    const copy = JSON.parse(JSON.stringify(assets)) as AssetHistoryInput[];
    buildNetWorthSeries(assets, "2025-01-01");
    expect(assets).toEqual(copy);
  });
});

describe("thinHistory", () => {
  const rows = (n: number): [string, number][] =>
    Array.from({ length: n }, (_, i) => [`2024-01-${String(i + 1).padStart(2, "0")}`, i] as [string, number]);

  it("returns everything when under the cap", () => {
    expect(thinHistory(rows(5), 10)).toEqual(rows(5));
    expect(thinHistory(rows(5), 5)).toEqual(rows(5));
    expect(thinHistory([], 3)).toEqual([]);
  });

  it("keeps first and last and caps the length", () => {
    const out = thinHistory(rows(30), 5);
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out[0]).toEqual(rows(30)[0]);
    expect(out[out.length - 1]).toEqual(rows(30)[29]);
    const dates = out.map(([d]) => d);
    expect(dates).toEqual([...dates].sort());
  });

  it("does not thin when maxPoints < 2", () => {
    expect(thinHistory(rows(10), 1)).toHaveLength(10);
  });

  it("never thins rows on/after keepFullFrom", () => {
    const all = rows(30);
    const out = thinHistory(all, 3, "2024-01-21");
    const recent = out.filter(([d]) => d >= "2024-01-21");
    expect(recent).toEqual(all.filter(([d]) => d >= "2024-01-21"));
    expect(out.filter(([d]) => d < "2024-01-21").length).toBeLessThanOrEqual(3);
  });
});

describe("buildHistoricalLines", () => {
  const a: AssetLineInput = {
    id: "a",
    name: "A",
    category: "Equities",
    currentValue: 150,
    history: [
      ["2024-01-01", 100],
      ["2024-03-01", 150],
    ],
  };
  const b: AssetLineInput = {
    id: "b",
    name: "B",
    category: "Cash",
    currentValue: 20,
    history: [["2024-02-01", 20]],
  };

  it("returns empty when no asset has history", () => {
    expect(buildHistoricalLines([], "aggregate", "2024-06-01")).toEqual({ lines: [], points: [] });
    expect(buildHistoricalLines([{ ...a, history: [] }], "individual", "2024-06-01")).toEqual({
      lines: [],
      points: [],
    });
  });

  it("aggregate sums forward-filled values (0 before an asset exists) through throughDate", () => {
    const res = buildHistoricalLines([a, b], "aggregate", "2024-06-01");
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].key).toBe(AGGREGATE_LINE_KEY);
    expect(res.points.map((p) => [p.date, p[AGGREGATE_LINE_KEY]])).toEqual([
      ["2024-01-01", 100],
      ["2024-02-01", 120],
      ["2024-03-01", 170],
      ["2024-06-01", 170],
    ]);
    expect(res.points[0].ts).toBe(ts("2024-01-01"));
  });

  it("individual lines are null before the asset's first row", () => {
    const res = buildHistoricalLines([a, b], "individual", "2024-03-01");
    expect(res.lines.map((l) => l.key)).toEqual([assetLineKey("a"), assetLineKey("b")]);
    expect(res.points[0][assetLineKey("b")]).toBeNull();
    expect(res.points[1][assetLineKey("b")]).toBe(20);
    expect(res.points[2][assetLineKey("a")]).toBe(150);
  });

  it("includes throughDate as a point even when it precedes the history", () => {
    const res = buildHistoricalLines([a], "aggregate", "2023-06-01");
    expect(res.points[0].date).toBe("2023-06-01");
    expect(res.points[0][AGGREGATE_LINE_KEY]).toBe(0);
  });

  it("keeps each asset's group index relative to the full input", () => {
    const res = buildHistoricalLines([{ ...a, history: [] }, b], "individual", "2024-03-01");
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].group).toBe(1);
  });
});

describe("estimateAssetGrowth", () => {
  const base: AssetLineInput = { id: "x", name: "X", category: "Real Estate", currentValue: 1, history: [] };

  it("uses the category assumption for contribution-driven categories regardless of history", () => {
    const g = estimateAssetGrowth(
      { ...base, category: "Equities", history: [["2015-01-01", 1], ["2025-01-01", 1000]] },
      "2025-01-01",
    );
    expect(g).toEqual({ rate: 0.07, source: "assumed" });
    expect(estimateAssetGrowth({ ...base, category: "Cash" }, "2025-01-01").rate).toBe(0.02);
  });

  it("falls back to 3% for an unknown category and for Vehicles' own default", () => {
    expect(estimateAssetGrowth({ ...base, category: "Mystery" }, "2025-01-01")).toEqual({
      rate: 0.03,
      source: "assumed",
    });
    expect(estimateAssetGrowth({ ...base, category: "Vehicles" }, "2025-01-01").rate).toBe(-0.1);
  });

  it("falls back with empty history, short history, or non-positive last value", () => {
    expect(estimateAssetGrowth(base, "2025-01-01").source).toBe("assumed");
    expect(
      estimateAssetGrowth({ ...base, history: [["2024-10-01", 100], ["2025-01-01", 110]] }, "2025-01-01").source,
    ).toBe("assumed");
    expect(
      estimateAssetGrowth({ ...base, history: [["2020-01-01", 100], ["2025-01-01", 0]] }, "2025-01-01").source,
    ).toBe("assumed");
    expect(estimateAssetGrowth({ ...base, history: [["2020-01-01", 0]] }, "2025-01-01").source).toBe("assumed");
  });

  it("derives CAGR from history (unsorted input) when long enough", () => {
    const g = estimateAssetGrowth(
      { ...base, history: [["2025-01-01", 110], ["2023-01-01", 100]] },
      "2025-01-01",
    );
    expect(g.source).toBe("history");
    expect(g.rate).toBeCloseTo(0.0488, 3);
  });

  it("starts from the first positive value, ignoring leading zeros", () => {
    const g = estimateAssetGrowth(
      { ...base, history: [["2022-01-01", 0], ["2023-01-01", 100], ["2025-01-01", 110]] },
      "2025-01-01",
    );
    expect(g.source).toBe("history");
    expect(g.rate).toBeCloseTo(0.0488, 3);
  });

  it("clamps extreme growth and decline to the sane band", () => {
    expect(
      estimateAssetGrowth({ ...base, history: [["2020-01-01", 100], ["2025-01-01", 200]] }, "2025-01-01").rate,
    ).toBe(0.1);
    expect(
      estimateAssetGrowth({ ...base, history: [["2024-01-01", 100], ["2025-01-01", 50]] }, "2025-01-01").rate,
    ).toBe(-0.15);
  });
});

describe("buildProjectedLines", () => {
  const house: AssetLineInput = {
    id: "h",
    name: "House",
    category: "Real Estate",
    currentValue: 1000,
    history: [["2024-01-01", 900]],
  };
  const car: AssetLineInput = {
    id: "c",
    name: "Car",
    category: "Vehicles",
    currentValue: 200,
    history: [],
  };

  it("starts today at the current value and compounds with the override rate", () => {
    const res = buildProjectedLines([house], "individual", {
      today: "2025-01-15",
      horizonYears: 2,
      growthOverride: 0.1,
    });
    expect(res.points).toHaveLength(25);
    expect(res.points[0].date).toBe("2025-01-15");
    expect(res.points[0][assetLineKey("h")]).toBe(1000);
    expect(res.points[12][assetLineKey("h")] as number).toBeCloseTo(1100, 6);
    expect(res.points[24][assetLineKey("h")] as number).toBeCloseTo(1210, 6);
    expect(res.rates.h).toEqual({ rate: 0.1, source: "assumed" });
    expect(res.lines.every((l) => l.kind === "projected")).toBe(true);
  });

  it("a zero override is applied (not treated as 'no override')", () => {
    const res = buildProjectedLines([house], "aggregate", { today: "2025-01-15", horizonYears: 1, growthOverride: 0 });
    expect(res.points[12][AGGREGATE_LINE_KEY]).toBe(1000);
  });

  it("aggregate equals the sum of the individual projections", () => {
    const opts = { today: "2025-01-15", horizonYears: 3 };
    const ind = buildProjectedLines([house, car], "individual", opts);
    const agg = buildProjectedLines([house, car], "aggregate", opts);
    expect(agg.points).toHaveLength(ind.points.length);
    ind.points.forEach((p, i) => {
      const sum = (p[assetLineKey("h")] as number) + (p[assetLineKey("c")] as number);
      expect(agg.points[i][AGGREGATE_LINE_KEY] as number).toBeCloseTo(sum, 6);
    });
  });

  it("clamps month-end dates (31 Jan -> 28 Feb, 29 Feb in leap years)", () => {
    const common = { horizonYears: 1, growthOverride: 0 };
    const plain = buildProjectedLines([house], "aggregate", { today: "2025-01-31", ...common });
    expect(plain.points[1].date).toBe("2025-02-28");
    expect(plain.points[2].date).toBe("2025-03-31");
    const leap = buildProjectedLines([house], "aggregate", { today: "2024-01-31", ...common });
    expect(leap.points[1].date).toBe("2024-02-29");
    const leapDay = buildProjectedLines([house], "aggregate", { today: "2024-02-29", ...common });
    expect(leapDay.points[12].date).toBe("2025-02-28");
  });

  it("skips assets with no history and zero value, but keeps zero-history assets with value", () => {
    const empty: AssetLineInput = { id: "e", name: "E", category: "Cash", currentValue: 0, history: [] };
    const res = buildProjectedLines([empty, car], "individual", { today: "2025-01-15", horizonYears: 1 });
    expect(res.lines.map((l) => l.assetId)).toEqual(["c"]);
    expect(Object.keys(res.rates)).toEqual(["c"]);
  });

  it("projects negative values (debt) toward more debt at a positive rate and keeps sign", () => {
    const debt: AssetLineInput = { id: "d", name: "Loan", category: "Liabilities", currentValue: -500, history: [] };
    const res = buildProjectedLines([debt], "aggregate", { today: "2025-01-15", horizonYears: 1 });
    expect(res.points[12][AGGREGATE_LINE_KEY]).toBe(-500);
  });

  it("handles a zero-year horizon (single point)", () => {
    const res = buildProjectedLines([house], "aggregate", { today: "2025-01-15", horizonYears: 0 });
    expect(res.points).toHaveLength(1);
  });
});

describe("rangeStartDate", () => {
  it("returns null for 'all'", () => {
    expect(rangeStartDate("all", "2025-06-15")).toBeNull();
  });

  it("subtracts the range from today", () => {
    expect(rangeStartDate("1M", "2025-06-15")).toBe("2025-05-15");
    expect(rangeStartDate("6M", "2025-06-15")).toBe("2024-12-15");
    expect(rangeStartDate("1Y", "2025-06-15")).toBe("2024-06-15");
    expect(rangeStartDate("5Y", "2025-06-15")).toBe("2020-06-15");
  });

  it("crosses year boundaries", () => {
    expect(rangeStartDate("1M", "2025-01-10")).toBe("2024-12-10");
  });

  // portfolio-performance.ts:363 — setUTCMonth(-1) on 31 March yields "31 Feb" which JS
  // rolls forward to 3 March, so the 1M window is shorter than a month. The clamped
  // 28 Feb is the correct start (addMonthsIso in the same file already clamps).
  it.fails("clamps to the end of a shorter month for 1M (31 Mar -> 28 Feb)", () => {
    expect(rangeStartDate("1M", "2025-03-31")).toBe("2025-02-28");
  });

  // portfolio-performance.ts:364 — same overflow bug for 6M (31 Aug -> "31 Feb" -> 3 Mar).
  it.fails("clamps to the end of a shorter month for 6M (31 Aug -> 28 Feb)", () => {
    expect(rangeStartDate("6M", "2025-08-31")).toBe("2025-02-28");
  });
});

describe("windowBounds / isCustomWindow", () => {
  it("uses the preset range when no custom dates are set", () => {
    expect(isCustomWindow(DEFAULT_CHART_WINDOW)).toBe(false);
    expect(windowBounds(DEFAULT_CHART_WINDOW, "2025-06-15")).toEqual({ from: null, to: null });
    expect(windowBounds({ range: "1Y", from: "", to: "" }, "2025-06-15")).toEqual({
      from: "2024-06-15",
      to: null,
    });
  });

  it("custom dates override the range, support open ends, and are swapped when reversed", () => {
    expect(isCustomWindow({ range: "1Y", from: "2024-01-01", to: "" })).toBe(true);
    expect(windowBounds({ range: "1Y", from: "2024-01-01", to: "" }, "2025-06-15")).toEqual({
      from: "2024-01-01",
      to: null,
    });
    expect(windowBounds({ range: "all", from: "", to: "2024-05-01" }, "2025-06-15")).toEqual({
      from: null,
      to: "2024-05-01",
    });
    expect(windowBounds({ range: "all", from: "2024-09-01", to: "2024-01-01" }, "2025-06-15")).toEqual({
      from: "2024-01-01",
      to: "2024-09-01",
    });
  });
});

describe("clipSeries / mergeLineSeries / suffixSeriesKeys / combine", () => {
  const series: LineSeries = {
    lines: [
      { key: "x", label: "X", assetId: "x" },
      { key: "y", label: "Y", assetId: "y" },
    ],
    points: [
      { date: "2024-01-01", ts: ts("2024-01-01"), x: 1, y: null },
      { date: "2024-02-01", ts: ts("2024-02-01"), x: 2, y: 20 },
      { date: "2024-03-01", ts: ts("2024-03-01"), x: 3, y: null },
      { date: "2024-04-01", ts: ts("2024-04-01"), x: 4, y: 40 },
    ],
  };

  it("returns the series untouched with an open window", () => {
    expect(clipSeries(series, null, null)).toBe(series);
  });

  it("anchors both edges with each line's last known value", () => {
    const res = clipSeries(series, "2024-02-15", "2024-03-15");
    expect(res.points.map((p) => p.date)).toEqual(["2024-02-15", "2024-03-01", "2024-03-15"]);
    expect(res.points[0]).toMatchObject({ x: 2, y: 20 });
    // y has no row on 03-01 (null) so the right anchor carries its last value 20
    expect(res.points[2]).toMatchObject({ x: 3, y: 20 });
  });

  it("does not add anchors when the window edge already has a point or covers the data", () => {
    const res = clipSeries(series, "2024-02-01", "2024-04-01");
    expect(res.points.map((p) => p.date)).toEqual(["2024-02-01", "2024-03-01", "2024-04-01"]);
    const wide = clipSeries(series, "2023-01-01", "2025-01-01");
    expect(wide.points).toHaveLength(4);
  });

  it("anchors a left edge before any value as null", () => {
    const res = clipSeries(series, "2024-01-10", null);
    expect(res.points[0].date).toBe("2024-01-10");
    expect(res.points[0]).toMatchObject({ x: 1, y: null });
  });

  it("yields an empty/anchored result for a window outside the data without throwing", () => {
    expect(() => clipSeries(series, "2030-01-01", "2030-02-01")).not.toThrow();
    expect(clipSeries({ lines: [], points: [] }, "2024-01-01", "2024-02-01").points).toEqual([]);
  });

  it("suffixSeriesKeys renames every data key but not date/ts", () => {
    const res = suffixSeriesKeys(series, "__p");
    expect(res.lines.map((l) => l.key)).toEqual(["x__p", "y__p"]);
    expect(res.points[1]).toEqual({ date: "2024-02-01", ts: ts("2024-02-01"), x__p: 2, y__p: 20 });
  });

  it("mergeLineSeries joins on ts, orders by time, and concatenates lines", () => {
    const other: LineSeries = {
      lines: [{ key: "z", label: "Z", assetId: "z" }],
      points: [
        { date: "2024-02-01", ts: ts("2024-02-01"), z: 99 },
        { date: "2023-12-01", ts: ts("2023-12-01"), z: 98 },
      ],
    };
    const res = mergeLineSeries(series, other);
    expect(res.lines.map((l) => l.key)).toEqual(["x", "y", "z"]);
    expect(res.points.map((p) => p.date)).toEqual([
      "2023-12-01",
      "2024-01-01",
      "2024-02-01",
      "2024-03-01",
      "2024-04-01",
    ]);
    expect(res.points[2]).toMatchObject({ x: 2, y: 20, z: 99 });
  });

  it("combineHistoryAndProjection puts projected keys beside historical ones", () => {
    const projected: LineSeries = {
      lines: [{ key: "x", label: "X", assetId: "x", kind: "projected" }],
      points: [{ date: "2024-04-01", ts: ts("2024-04-01"), x: 4 }],
    };
    const res = combineHistoryAndProjection(series, projected);
    expect(res.lines.map((l) => l.key)).toEqual(["x", "y", "x__p"]);
    expect(res.points[3]).toMatchObject({ x: 4, x__p: 4 });
  });
});

describe("buildInvestedLines", () => {
  const withCost: AssetLineInput = {
    id: "a",
    name: "A",
    category: "Equities",
    currentValue: 10,
    history: [["2024-01-01", 10]],
    invested: [
      ["2024-01-01", 100],
      ["2024-03-01", 250],
    ],
  };
  const other: AssetLineInput = {
    id: "b",
    name: "B",
    category: "Vehicles",
    currentValue: 5,
    history: [["2024-01-01", 5]],
    invested: [["2024-02-01", 40]],
  };
  const noCost: AssetLineInput = { id: "c", name: "C", category: "Cash", currentValue: 1, history: [["2024-01-01", 1]] };

  it("is empty when nothing has cost data", () => {
    expect(buildInvestedLines([noCost], "aggregate", "2024-06-01")).toEqual({ lines: [], points: [] });
    expect(buildInvestedLines([{ ...noCost, invested: [] }], "aggregate", "2024-06-01")).toEqual({
      lines: [],
      points: [],
    });
  });

  it("aggregate sums stepped cumulative capital and runs through throughDate", () => {
    const res = buildInvestedLines([withCost, other, noCost], "aggregate", "2024-06-01");
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].kind).toBe("invested");
    expect(res.points.map((p) => [p.date, p["invested"]])).toEqual([
      ["2024-01-01", 100],
      ["2024-02-01", 140],
      ["2024-03-01", 290],
      ["2024-06-01", 290],
    ]);
  });

  it("individual lines are null before the first outlay and skip assets without cost data", () => {
    const res = buildInvestedLines([withCost, other, noCost], "individual", "2024-03-01");
    expect(res.lines.map((l) => l.key)).toEqual(["i_a", "i_b"]);
    expect(res.points[0]["i_b"]).toBeNull();
    expect(res.points[1]["i_b"]).toBe(40);
  });
});

describe("buildChartSeries", () => {
  const house: AssetLineInput = {
    id: "h",
    name: "House",
    category: "Real Estate",
    currentValue: 1200,
    history: [
      ["2024-01-01", 1000],
      ["2024-07-01", 1200],
    ],
    invested: [["2024-01-01", 900]],
  };
  const opts = {
    mode: "aggregate" as const,
    timeline: "historical" as const,
    window: DEFAULT_CHART_WINDOW,
    showInvested: false,
    today: "2025-01-01",
    horizonYears: 1,
    growthOverride: 0.05,
  };

  it("historical timeline runs from the first row through today", () => {
    const res = buildChartSeries([house], opts);
    expect(res.points[0].date).toBe("2024-01-01");
    expect(res.points[res.points.length - 1].date).toBe("2025-01-01");
    expect(res.points[res.points.length - 1][AGGREGATE_LINE_KEY]).toBe(1200);
  });

  it("projection timeline returns only projected lines", () => {
    const res = buildChartSeries([house], { ...opts, timeline: "projection" });
    expect(res.lines.every((l) => l.kind === "projected")).toBe(true);
    expect(res.points[0].date).toBe("2025-01-01");
  });

  it("combined timeline carries both historical and __p projected keys", () => {
    const res = buildChartSeries([house], { ...opts, timeline: "combined" });
    expect(res.lines.map((l) => l.key)).toEqual([AGGREGATE_LINE_KEY, `${AGGREGATE_LINE_KEY}__p`]);
    const today = res.points.find((p) => p.date === "2025-01-01");
    expect(today?.[AGGREGATE_LINE_KEY]).toBe(1200);
    expect(today?.[`${AGGREGATE_LINE_KEY}__p`]).toBe(1200);
  });

  it("showInvested overlays the invested line, forward-filled across valuation dates", () => {
    const res = buildChartSeries([house], { ...opts, showInvested: true });
    expect(res.lines.map((l) => l.key)).toEqual([AGGREGATE_LINE_KEY, "invested"]);
    const mid = res.points.find((p) => p.date === "2024-07-01");
    expect(mid?.["invested"]).toBe(900);
  });

  it("applies the date window with exact edges", () => {
    const res = buildChartSeries([house], {
      ...opts,
      window: { range: "all", from: "2024-03-01", to: "2024-09-01" },
    });
    expect(res.points.map((p) => p.date)).toEqual(["2024-03-01", "2024-07-01", "2024-09-01"]);
    expect(res.points[0][AGGREGATE_LINE_KEY]).toBe(1000);
    expect(res.points[2][AGGREGATE_LINE_KEY]).toBe(1200);
  });

  it("uses historicalOverride when given", () => {
    const override: LineSeries = {
      lines: [{ key: AGGREGATE_LINE_KEY, label: "", assetId: null }],
      points: [{ date: "2024-05-05", ts: ts("2024-05-05"), [AGGREGATE_LINE_KEY]: 7 }],
    };
    const res = buildChartSeries([house], { ...opts, historicalOverride: override });
    expect(res.points).toHaveLength(1);
    expect(res.points[0][AGGREGATE_LINE_KEY]).toBe(7);
  });

  it("handles an empty portfolio", () => {
    expect(buildChartSeries([], opts)).toEqual({ lines: [], points: [] });
  });
});
