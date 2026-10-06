import { describe, expect, it } from "vitest";
import { classifyPdfText } from "./classify";

describe("classifyPdfText", () => {
  it("is empty when nothing was extracted and no page count is known", () => {
    expect(classifyPdfText("")).toBe("empty");
    expect(classifyPdfText(" \n\t ", 0)).toBe("empty");
  });

  it("is scanned when pages exist but there is no text", () => {
    expect(classifyPdfText("", 1)).toBe("scanned");
  });

  it("is scanned for a 1-page raster statement that extracts 2 characters", () => {
    expect(classifyPdfText("\n\n", 1)).toBe("scanned");
    expect(classifyPdfText("ab", 1)).toBe("scanned");
    expect(classifyPdfText("ab")).toBe("scanned");
  });

  it("is scanned when the per-page average is tiny and nothing looks like a date/amount", () => {
    expect(classifyPdfText("Page 1 of 3 header only", 3)).toBe("scanned");
  });

  it("is ok for real text", () => {
    expect(classifyPdfText("The following services are included in this Statement of Account ".repeat(5), 2)).toBe("ok");
  });

  it("is ok when a date or amount token is present even if short", () => {
    expect(classifyPdfText("01/02/2026 12.50", 1)).toBe("ok");
    expect(classifyPdfText("2026-02-01", 5)).toBe("ok");
  });

  it("treats boilerplate-only text (HSBC image_only case) as ok, not scanned", () => {
    const boiler = "Abbreviations CR - Credit DR - Debit Statement of Accounts information about your accounts. ".repeat(20);
    expect(classifyPdfText(boiler, 5)).toBe("ok");
  });
});
