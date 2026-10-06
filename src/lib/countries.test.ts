import { describe, expect, it } from "vitest";
import { countries } from "@/lib/countries";

describe("countries", () => {
  it("has a full list of countries", () => {
    expect(countries.length).toBeGreaterThanOrEqual(190);
  });

  it("every entry has a trimmed name, ISO alpha-2 code and a +digits dial code", () => {
    for (const c of countries) {
      expect(c.name).toBe(c.name.trim());
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.dialCode).toMatch(/^\+\d{1,4}$/);
    }
  });

  it("has unique ISO codes and unique names", () => {
    const codes = countries.map((c) => c.code);
    const names = countries.map((c) => c.name);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("contains the markets the app targets with correct dial codes", () => {
    const by = Object.fromEntries(countries.map((c) => [c.code, c]));
    expect(by.AE).toMatchObject({ name: "United Arab Emirates", dialCode: "+971" });
    expect(by.FR).toMatchObject({ name: "France", dialCode: "+33" });
    expect(by.GB).toMatchObject({ dialCode: "+44" });
    expect(by.US).toMatchObject({ dialCode: "+1" });
    expect(by.IN).toMatchObject({ dialCode: "+91" });
    expect(by.CN).toMatchObject({ dialCode: "+86" });
    expect(by.SA).toMatchObject({ dialCode: "+966" });
  });

  it("allows shared dial codes (NANP +1, +7) but only across different countries", () => {
    const plusOne = countries.filter((c) => c.dialCode === "+1").map((c) => c.code);
    expect(plusOne).toEqual(expect.arrayContaining(["US", "CA"]));
    const plusSeven = countries.filter((c) => c.dialCode === "+7").map((c) => c.code);
    expect(plusSeven).toEqual(expect.arrayContaining(["RU", "KZ"]));
  });
});
