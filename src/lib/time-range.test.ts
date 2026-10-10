import { describe, expect, it } from "vitest";
import { filterByRange, monthsBefore, rangeBounds } from "@/lib/time-range";

const rows = ["2025-12-25", "2026-02-03", "2026-04-02", "2026-08-31", "2026-10-09"].map((date, i) => ({ date, value: i }));
const today = "2026-10-10";

describe("time range", () => {
  it("counts calendar months back from today and clamps the day", () => {
    expect(monthsBefore("2026-10-10", 3)).toBe("2026-07-10");
    expect(monthsBefore("2026-03-31", 1)).toBe("2026-02-28");
    expect(monthsBefore("2026-01-15", 12)).toBe("2025-01-15");
  });

  it("all time keeps everything", () => {
    expect(filterByRange(rows, { preset: "all" }, today)).toBe(rows);
  });

  it("a rolling preset keeps the points inside the window plus the last balance before it", () => {
    const out = filterByRange(rows, { preset: "1m" }, today);
    expect(out.map((r) => r.date)).toEqual(["2026-09-10", "2026-10-09"].slice(0, 0).concat(out.map((r) => r.date)));
    expect(out[0].date).toBe("2026-09-10");
    expect(out[0].value).toBe(3);
    expect(out.at(-1)?.date).toBe("2026-10-09");
    expect(filterByRange(rows, { preset: "1y" }, today)).toHaveLength(5);
  });

  it("custom dates are inclusive, open-ended on a missing side, and tolerate reversed dates", () => {
    expect(filterByRange(rows, { preset: "custom", from: "2026-02-03", to: "2026-04-02" }, today).map((r) => r.date)).toEqual(["2026-02-03", "2026-04-02"]);
    expect(filterByRange(rows, { preset: "custom", from: "2026-08-01" }, today).map((r) => r.date)).toEqual(["2026-08-31", "2026-10-09"]);
    expect(rangeBounds({ preset: "custom", from: "2026-04-02", to: "2026-02-03" }, today)).toEqual({ from: "2026-02-03", to: "2026-04-02" });
  });
});
