import { describe, expect, it } from "vitest";
import {
  BANK_COUNTRIES,
  BANKS,
  bankByName,
  bankFromInstitutionId,
  bankInstitutionId,
  banksByCountry,
  canConnect,
  getBank,
} from "./institutions";
import { BANK_PROFILES } from "./csv-profiles";

describe("BANKS registry integrity", () => {
  it("has unique keys and names, with a logo domain and currency for each", () => {
    expect(new Set(BANKS.map((b) => b.key)).size).toBe(BANKS.length);
    expect(new Set(BANKS.map((b) => b.name)).size).toBe(BANKS.length);
    for (const b of BANKS) {
      expect(b.domain, b.key).toBeTruthy();
      expect(b.defaultCurrency, b.key).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("lists every country that has a bank in BANK_COUNTRIES", () => {
    for (const b of BANKS) expect(BANK_COUNTRIES).toContain(b.country);
  });

  it("keeps hasCsvProfile in sync with csv-profiles.ts (same key, country and currency)", () => {
    const withProfile = BANKS.filter((b) => b.hasCsvProfile).map((b) => b.key).sort();
    // PDF-only profiles (hsbc_uae, cbi: read through OCR) are deliberately not connectable banks.
    const csvProfiles = BANK_PROFILES.filter((p) => !p.pdfOnly);
    expect(withProfile).toEqual(csvProfiles.map((p) => p.id).sort());
    for (const p of csvProfiles) {
      const bank = getBank(p.id)!;
      expect(bank.country, p.id).toBe(p.country);
      expect(bank.defaultCurrency, p.id).toBe(p.defaultCurrency);
    }
  });

  it("routes UAE banks through altareq and everything else through psd2", () => {
    for (const b of BANKS) expect(b.provider).toBe(b.country === "AE" ? "altareq" : "psd2");
  });
});

describe("lookups", () => {
  it("getBank / bankByName find banks or return undefined", () => {
    expect(getBank("enbd")?.name).toBe("Emirates NBD");
    expect(bankByName("Emirates NBD")?.key).toBe("enbd");
    expect(getBank("nope")).toBeUndefined();
    expect(bankByName("nope")).toBeUndefined();
  });

  it("banksByCountry filters", () => {
    expect(banksByCountry("AE").every((b) => b.country === "AE")).toBe(true);
    expect(banksByCountry("IT").map((b) => b.key)).toEqual(["intesa_sanpaolo", "unicredit"]);
  });
});

describe("institution ids", () => {
  it("prefixes sandbox ids only in sandbox mode", () => {
    expect(bankInstitutionId("enbd", "sandbox")).toBe("sandbox-enbd");
    expect(bankInstitutionId("enbd", "live")).toBe("enbd");
    expect(bankInstitutionId("enbd", "unconfigured")).toBe("enbd");
  });

  it("round-trips an institution id back to the bank", () => {
    expect(bankFromInstitutionId("sandbox-enbd")?.key).toBe("enbd");
    expect(bankFromInstitutionId("enbd")?.key).toBe("enbd");
    expect(bankFromInstitutionId("sandbox-nope")).toBeUndefined();
  });
});

describe("canConnect", () => {
  const uae = getBank("wio")!;
  const fr = getBank("lcl")!;

  it("allows every bank in sandbox", () => {
    expect(canConnect(uae, "sandbox")).toBe(true);
    expect(canConnect(fr, "sandbox")).toBe(true);
  });

  it("allows only implemented providers (altareq) when live", () => {
    expect(canConnect(uae, "live")).toBe(true);
    expect(canConnect(fr, "live")).toBe(false);
  });

  it("allows nothing when unconfigured", () => {
    expect(canConnect(uae, "unconfigured")).toBe(false);
  });
});
