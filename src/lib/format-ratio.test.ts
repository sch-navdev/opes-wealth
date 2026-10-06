import { describe, expect, it } from "vitest";
import { formatMultiple, formatPercent, RATIO_NA } from "@/lib/format-ratio";

describe("formatPercent", () => {
  it("formats a fraction with one decimal", () => {
    expect(formatPercent(0.049)).toBe("4.9%");
    expect(formatPercent(0.1234)).toBe("12.3%");
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(1)).toBe("100.0%");
  });

  it("keeps the sign and avoids negative zero", () => {
    expect(formatPercent(-0.012)).toBe("-1.2%");
    expect(formatPercent(0.0004)).toBe("0.0%");
    expect(formatPercent(-0.0004)).toBe("0.0%");
  });

  it("stays compact for huge values", () => {
    expect(formatPercent(25_000)).toBe("2.5M%");
  });

  it("is locale-aware", () => {
    expect(formatPercent(0.049, "de-DE")).toContain("4,9");
    expect(formatPercent(0.049, "fr-FR")).toContain("4,9");
  });

  it("returns an en dash for missing or non-finite input", () => {
    for (const v of [null, undefined, NaN, Infinity, -Infinity]) expect(formatPercent(v)).toBe(RATIO_NA);
  });
});

describe("formatMultiple", () => {
  it("formats with two decimals and an x suffix", () => {
    expect(formatMultiple(1.374)).toBe("1.37x");
    expect(formatMultiple(0)).toBe("0.00x");
    expect(formatMultiple(12)).toBe("12.00x");
    expect(formatMultiple(1234.5)).toBe("1,234.50x");
  });

  it("keeps the sign and avoids negative zero", () => {
    expect(formatMultiple(-0.5)).toBe("-0.50x");
    expect(formatMultiple(-0.001)).toBe("0.00x");
  });

  it("is locale-aware", () => {
    expect(formatMultiple(1.374, "de-DE")).toBe("1,37x");
  });

  it("returns an en dash for missing or non-finite input", () => {
    for (const v of [null, undefined, NaN, Infinity, -Infinity]) expect(formatMultiple(v)).toBe(RATIO_NA);
  });
});
