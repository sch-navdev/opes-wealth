import { describe, expect, it } from "vitest";
import { parseBlueBookText } from "./bluebook-parser";

const TODAY = "2026-10-06";

describe("parseBlueBookText", () => {
  it("returns an empty result for empty or irrelevant text", () => {
    expect(parseBlueBookText("", TODAY)).toEqual({ value: null, currency: null, date: null, source: "", candidates: [] });
    const r = parseBlueBookText("Hello world\nNothing here", TODAY);
    expect(r.value).toBeNull();
    expect(r.candidates).toEqual([]);
  });

  it("extracts value, currency, date and guide from a typical document", () => {
    const r = parseBlueBookText(
      [
        "Kelley Blue Book",
        "Valuation Date: 15/03/2026",
        "Trade-in Value AED 45,000",
        "Mileage 85,000 km",
        "VIN 1234567890123",
      ].join("\n"),
      TODAY,
    );
    expect(r.source).toBe("Kelley Blue Book");
    expect(r.value).toBe(45000);
    expect(r.currency).toBe("AED");
    expect(r.date).toBe("2026-03-15");
    expect(r.candidates.map((c) => c.value)).toEqual([45000]);
  });

  it("ignores mileage and VIN lines when choosing a price", () => {
    const r = parseBlueBookText("Estimated value 30,000 USD\nOdometer 120,000\nChassis 99999999", TODAY);
    expect(r.value).toBe(30000);
    expect(r.candidates.map((c) => c.value)).toEqual([30000]);
  });

  it("reads French space-grouped euro amounts", () => {
    const r = parseBlueBookText("Cote Argus\nValeur: 12 500 €", TODAY);
    expect(r.source).toBe("Argus");
    expect(r.value).toBe(12500);
    expect(r.currency).toBe("EUR");
  });

  it("reads European decimal amounts", () => {
    const r = parseBlueBookText("Estimated value: 1.234,56 EUR", TODAY);
    expect(r.value).toBe(1234.56);
    expect(r.currency).toBe("EUR");
  });

  it("reads US thousands with decimals and a currency prefix", () => {
    const r = parseBlueBookText("Retail value $ 23,450.00", TODAY);
    expect(r.value).toBe(23450);
    expect(r.currency).toBe("USD");
  });

  it("looks one line ahead for a label-then-number layout", () => {
    const r = parseBlueBookText("Estimated Value\nAED 52,000", TODAY);
    expect(r.value).toBe(52000);
    expect(r.currency).toBe("AED");
  });

  it("ranks a strongly worded, currency-tagged line above a bigger unlabeled number", () => {
    const r = parseBlueBookText("Fair market value AED 40,000\nSome other figure 90,000", TODAY);
    expect(r.value).toBe(40000);
    expect(r.candidates.map((c) => c.value)).toEqual([40000, 90000]);
  });

  it("does not auto-pick an amount with no value wording but still offers it as a candidate", () => {
    const r = parseBlueBookText("Total 25,000", TODAY);
    expect(r.value).toBeNull();
    expect(r.candidates.map((c) => c.value)).toEqual([25000]);
  });

  it("treats a bare 4-digit year as a model year, not a price, and ignores amounts below 500", () => {
    const r = parseBlueBookText("Model year 2021\nValue 300", TODAY);
    expect(r.candidates).toEqual([]);
  });

  it("de-duplicates equal amounts and caps candidates at five", () => {
    const text = [
      "Value 10,000",
      "Value 10,000",
      "Value 11,000",
      "Value 12,000",
      "Value 13,000",
      "Value 14,000",
      "Value 15,000",
    ].join("\n");
    const r = parseBlueBookText(text, TODAY);
    expect(r.candidates).toHaveLength(5);
    expect(new Set(r.candidates.map((c) => c.value)).size).toBe(5);
  });

  it.each([
    ["Kelley Blue Book value 10,000", "Kelley Blue Book"],
    ["KBB value 10,000", "Kelley Blue Book"],
    ["Black Book value 10,000", "Black Book"],
    ["Parkers value 10,000", "Parkers"],
    ["Eurotax value 10,000", "Eurotax"],
    ["Schwacke Wert 10,000", "Schwacke"],
  ])("detects the guide in %j", (text, source) => {
    expect(parseBlueBookText(text, TODAY).source).toBe(source);
  });

  describe("dates", () => {
    it("reads ISO, day-first and worded dates", () => {
      expect(parseBlueBookText("Valuation date 2026-03-05", TODAY).date).toBe("2026-03-05");
      expect(parseBlueBookText("Valuation date 05/03/2026", TODAY).date).toBe("2026-03-05");
      expect(parseBlueBookText("Date: 15 March 2026", TODAY).date).toBe("2026-03-15");
      expect(parseBlueBookText("Date: 15 Sept 2025", TODAY).date).toBe("2025-09-15");
      expect(parseBlueBookText("Date: 15 mars 2026", TODAY).date).toBe("2026-03-15");
      expect(parseBlueBookText("Date: March 15, 2026", TODAY).date).toBe("2026-03-15");
    });

    it("switches to month-first when the second number exceeds 12", () => {
      expect(parseBlueBookText("Valuation date 03/25/2026", TODAY).date).toBe("2026-03-25");
    });

    it("never returns a date in the future", () => {
      expect(parseBlueBookText("Valuation date 15/03/2030", TODAY).date).toBeNull();
    });

    it("prefers a labelled date line over an earlier stray date", () => {
      const r = parseBlueBookText("Printed 01/01/2020\nValuation date 15/03/2026", TODAY);
      expect(r.date).toBe("2026-03-15");
    });

    it("rejects out-of-range months/years", () => {
      expect(parseBlueBookText("Date: 2026-13-45", TODAY).date).toBeNull();
      expect(parseBlueBookText("Date: 05/03/1999", TODAY).date).toBeNull();
    });
  });
});

describe("parseBlueBookText skip labels are whole-word labels, not substrings", () => {
  it("keeps 'Reference value: AED 85,000'", () => {
    const r = parseBlueBookText("Reference value: AED 85,000", TODAY);
    expect(r.value).toBe(85000);
    expect(r.currency).toBe("AED");
  });

  it("keeps 'Preferred retail value 90 000 EUR'", () => {
    const r = parseBlueBookText("Preferred retail value 90 000 EUR", TODAY);
    expect(r.value).toBe(90000);
    expect(r.currency).toBe("EUR");
  });

  it("does not treat Hotel / Provincial / Television as skip labels", () => {
    expect(parseBlueBookText("Hotel Provincial market value AED 60,000", TODAY).value).toBe(60000);
    expect(parseBlueBookText("Television Provincial price 45 000 AED", TODAY).value).toBe(45000);
    expect(parseBlueBookText("Advised estimate value: 31,500 USD", TODAY).value).toBe(31500);
  });

  it("still skips reference numbers, VINs and phone numbers", () => {
    expect(parseBlueBookText("Ref: 2025/123456", TODAY).candidates).toEqual([]);
    expect(parseBlueBookText("Ref. no 1234567", TODAY).candidates).toEqual([]);
    expect(parseBlueBookText("Reference number: 99887766", TODAY).candidates).toEqual([]);
    expect(parseBlueBookText("VIN WBA1234567890", TODAY).candidates).toEqual([]);
    expect(parseBlueBookText("Tel: 04 123 4567", TODAY).candidates).toEqual([]);
    expect(parseBlueBookText("Telephone +971 4 123 4567\nFax 04 765 4321", TODAY).candidates).toEqual([]);
    expect(parseBlueBookText("Plate no 123456", TODAY).candidates).toEqual([]);
    expect(parseBlueBookText("Invoice no 4455667", TODAY).candidates).toEqual([]);
    expect(parseBlueBookText("Engine 2000 cc 123456", TODAY).candidates).toEqual([]);
  });

  it("does not use a skipped label line as the look-ahead value", () => {
    expect(parseBlueBookText("Estimated Value\nVIN 12345678901", TODAY).candidates).toEqual([]);
  });

  it("on a mixed line keeps the valuation and blanks only the identifier", () => {
    expect(parseBlueBookText("Estimated value AED 80,000 (ref 12345)", TODAY).value).toBe(80000);
    expect(parseBlueBookText("Estimated value AED 80,000 (ref 12345)", TODAY).candidates.map((c) => c.value)).toEqual([80000]);
    expect(parseBlueBookText("Estimated value AED 80,000 Ref: 2025/123456", TODAY).candidates.map((c) => c.value)).toEqual([80000]);
    expect(parseBlueBookText("Ref no 123456 Estimated value AED 80,000", TODAY).candidates.map((c) => c.value)).toEqual([80000]);
    expect(parseBlueBookText("Retail value AED 70,000 VIN WBA1234567890", TODAY).candidates.map((c) => c.value)).toEqual([70000]);
    expect(parseBlueBookText("Market value AED 66,000 mileage 85,000 km", TODAY).candidates.map((c) => c.value)).toEqual([66000]);
  });
});
