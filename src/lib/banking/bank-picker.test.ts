import { describe, expect, it } from "vitest";
import {
  banksForCountry,
  countriesFor,
  countryFlag,
  countryLabel,
  defaultCountry,
  isPdfBankId,
  pdfBankIds,
  selectableProfiles,
} from "@/lib/banking/bank-picker";
import { BANK_PROFILES, getBankProfile } from "@/lib/banking/csv-profiles";

const ids = (kind: "csv" | "pdf", country: string) => banksForCountry(kind, country).map((p) => p.id);

describe("bank picker helpers", () => {
  it("every PDF bank has a BANK_PROFILES entry with the same id", () => {
    for (const id of pdfBankIds()) expect(getBankProfile(id)?.id).toBe(id);
    expect(pdfBankIds().sort()).toEqual(["banque_populaire", "cbd", "cbi", "fab", "hsbc_uae", "wio"]);
  });

  it("CSV kind excludes pdf-only profiles; PDF kind is exactly the PDF pipeline's banks", () => {
    const csv = selectableProfiles("csv").map((p) => p.id);
    expect(csv).not.toContain("hsbc_uae");
    expect(csv).not.toContain("cbi");
    expect(csv.length).toBe(BANK_PROFILES.filter((p) => !p.pdfOnly).length);
    expect(selectableProfiles("pdf").map((p) => p.id).sort()).toEqual(pdfBankIds().sort());
  });

  it("lists HSBC UAE and CBI for PDF in AE but only CSV banks for CSV", () => {
    expect(ids("pdf", "AE")).toEqual(expect.arrayContaining(["wio", "fab", "hsbc_uae", "cbi"]));
    expect(ids("pdf", "AE")).not.toContain("enbd");
    expect(ids("csv", "AE")).toEqual(expect.arrayContaining(["wio", "enbd", "adcb", "fab"]));
    expect(ids("csv", "AE")).not.toContain("hsbc_uae");
  });

  it("filters by country", () => {
    expect(ids("csv", "FR")).toContain("boursobank");
    expect(ids("csv", "FR").every((id) => getBankProfile(id)?.country === "FR")).toBe(true);
    expect(ids("pdf", "FR")).toEqual(["banque_populaire"]);
    expect(banksForCountry("csv", "US")).toEqual([]);
  });

  it("countries come in display order and only when they have a bank", () => {
    expect(countriesFor("csv")).toEqual(["AE", "FR"]);
    expect(countriesFor("pdf")).toEqual(["AE", "FR"]);
  });

  it("flags and labels", () => {
    expect(countryFlag("AE")).toBe("\u{1F1E6}\u{1F1EA}");
    expect(countryFlag("fr")).toBe("\u{1F1EB}\u{1F1F7}");
    expect(countryFlag("xyz")).toBe("");
    expect(countryLabel("FR", "en")).toBe("France");
    expect(countryLabel("FR", "fr")).toBe("France");
    expect(countryLabel("AE", "en")).toBe("United Arab Emirates");
  });

  it("validates PDF bank ids", () => {
    expect(isPdfBankId("hsbc_uae")).toBe(true);
    expect(isPdfBankId("cbd")).toBe(true);
    expect(isPdfBankId("nope")).toBe(false);
    expect(isPdfBankId(null)).toBe(false);
  });

  it("default country: detected bank, else stored, else AE; unusable values are skipped", () => {
    expect(defaultCountry("csv", "boursobank", "AE")).toBe("FR");
    expect(defaultCountry("csv", null, "FR")).toBe("FR");
    expect(defaultCountry("csv", null, null)).toBe("AE");
    expect(defaultCountry("csv", null, "US")).toBe("AE");
    expect(defaultCountry("pdf", "hsbc_uae", "FR")).toBe("AE");
  });
});
