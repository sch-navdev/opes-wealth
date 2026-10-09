import { describe, expect, it } from "vitest";
import {
  ALL_COUNTRIES,
  NO_COUNTRY,
  accountCountry,
  countriesInRows,
  countryOptions,
  groupRowsByCountry,
  isImportedBankAccount,
  resolveCountryFilter,
} from "./account-country";

const r = (institution: string, baseBalance: number, country?: string) => ({ institution, baseBalance, country });

describe("accountCountry", () => {
  it("prefers the stored country, then the bank profile's, then the registry bank's", () => {
    expect(accountCountry({ country: "GB", bank_profile: "wio" })).toBe("GB");
    expect(accountCountry({ bank_profile: "wio" })).toBe("AE");
    expect(accountCountry({ bank_profile: "boursobank" })).toBe("FR");
    expect(accountCountry({ bank_key: "chase" })).toBe("US");
    expect(accountCountry({}, "Wio Bank")).toBe("AE");
    expect(accountCountry(null, "Some Unknown Bank")).toBe("");
  });
  it("ignores an invalid stored country", () => {
    expect(accountCountry({ country: "uae", bank_profile: "wio" })).toBe("AE");
  });
});

describe("countryOptions", () => {
  it("lists the statement countries first and keeps a current value outside the list", () => {
    const opts = countryOptions("JP");
    expect(opts.slice(0, 2)).toEqual(["AE", "FR"]);
    expect(opts).toContain("GB");
    expect(opts).toContain("JP");
    expect(new Set(opts).size).toBe(opts.length);
  });
});

describe("isImportedBankAccount", () => {
  it("is true with a bank profile, or imported history or transactions", () => {
    expect(isImportedBankAccount({ metadata: { bank_profile: "wio" } })).toBe(true);
    expect(isImportedBankAccount({ metadata: {}, historySources: ["manual", "csv_import"] })).toBe(true);
    expect(isImportedBankAccount({ metadata: null, transactionSources: ["pdf_import"] })).toBe(true);
  });
  it("is false for a manual account", () => {
    expect(
      isImportedBankAccount({ metadata: { institution_name: "X" }, historySources: ["manual"], transactionSources: [null] }),
    ).toBe(false);
    expect(isImportedBankAccount({ metadata: null })).toBe(false);
  });
});

describe("groupRowsByCountry", () => {
  const rows = [
    r("Wio Bank", 100, "AE"),
    r("ADCB", 300, "AE"),
    r("Wio Bank", 50, "AE"),
    r("BoursoBank", 500, "FR"),
    r("Mystery", 900),
  ];

  it("groups by country (largest first, no-country last) then by institution", () => {
    const g = groupRowsByCountry(rows);
    expect(g.map((x) => x.country)).toEqual(["FR", "AE", NO_COUNTRY]);
    const ae = g[1];
    expect(ae.total).toBe(450);
    expect(ae.institutions.map((i) => [i.institution, i.total])).toEqual([
      ["ADCB", 300],
      ["Wio Bank", 150],
    ]);
  });
  it("filters to one country", () => {
    const g = groupRowsByCountry(rows, "FR");
    expect(g).toHaveLength(1);
    expect(g[0].institutions[0].institution).toBe("BoursoBank");
  });
  it("names an institution-less group with the fallback label", () => {
    expect(groupRowsByCountry([r("", 1, "AE")], ALL_COUNTRIES, "Other")[0].institutions[0].institution).toBe("Other");
  });
  it("lists the countries present", () => {
    expect(countriesInRows(rows)).toEqual(["FR", "AE", NO_COUNTRY]);
  });
});

describe("resolveCountryFilter", () => {
  it("defaults to all and ignores a stored country that is no longer present", () => {
    expect(resolveCountryFilter(null, ["AE"])).toBe(ALL_COUNTRIES);
    expect(resolveCountryFilter("FR", ["AE"])).toBe(ALL_COUNTRIES);
    expect(resolveCountryFilter("AE", ["AE", "FR"])).toBe("AE");
  });
});
