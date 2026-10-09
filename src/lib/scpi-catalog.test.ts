import { describe, expect, it } from "vitest";
import {
  SCPI_CATALOG,
  applyReferencePrices,
  getCatalogEntry,
  referenceOffer,
  searchScpiCatalog,
  type ScpiCatalogEntry,
} from "@/lib/scpi-catalog";
import { EMPTY_SCPI_METADATA } from "@/lib/scpi";

describe("catalog integrity", () => {
  it("has unique ids and names", () => {
    expect(new Set(SCPI_CATALOG.map((e) => e.id)).size).toBe(SCPI_CATALOG.length);
    expect(new Set(SCPI_CATALOG.map((e) => e.name)).size).toBe(SCPI_CATALOG.length);
  });
  it("every entry is verified, dated, sourced over https and has a manager", () => {
    for (const e of SCPI_CATALOG) {
      expect(e.verified).toBe(true);
      expect(e.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.sourceUrl.startsWith("https://")).toBe(true);
      expect(e.managementCompany.length).toBeGreaterThan(1);
    }
  });
  it("a price reference always carries its date and source (none required)", () => {
    for (const e of SCPI_CATALOG) {
      if (e.reference) {
        expect(e.reference.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(e.reference.sourceUrl.startsWith("https://")).toBe(true);
      }
    }
  });
});

describe("searchScpiCatalog", () => {
  it("empty query returns everything, sorted", () => {
    const all = searchScpiCatalog("");
    expect(all).toHaveLength(SCPI_CATALOG.length);
    expect(all.map((e) => e.name)).toEqual([...all.map((e) => e.name)].sort((a, b) => a.localeCompare(b)));
  });
  it("matches names and managers ignoring accents and case, all words required", () => {
    expect(searchScpiCatalog("epargne pierre").length).toBeGreaterThanOrEqual(3);
    expect(searchScpiCatalog("GENEPIERRE").map((e) => e.id)).toContain("genepierre");
    expect(searchScpiCatalog("sofidy").every((e) => e.managementCompany === "Sofidy")).toBe(true);
    expect(searchScpiCatalog("corum zzz")).toEqual([]);
  });
  it("finds renamed SCPI by their former name", () => {
    expect(searchScpiCatalog("PFO2").map((e) => e.id)).toContain("perial-o2");
  });
  it("works on a custom catalog (easy to extend)", () => {
    const extra: ScpiCatalogEntry = {
      id: "test-scpi",
      name: "Test SCPI",
      managementCompany: "Test Gestion",
      verified: true,
      lastChecked: "2026-01-01",
      sourceUrl: "https://example.com",
    };
    expect(searchScpiCatalog("test", [extra])).toEqual([extra]);
  });
});

describe("reference price offers", () => {
  const entry: ScpiCatalogEntry = {
    id: "t",
    name: "T",
    managementCompany: "M",
    verified: true,
    lastChecked: "2026-01-01",
    sourceUrl: "https://example.com",
    reference: { subscriptionPrice: 200, withdrawalPrice: 180, asOf: "2026-01-01", sourceUrl: "https://example.com/doc.pdf" },
  };
  it("offers only sourced, dated, positive prices", () => {
    expect(referenceOffer(entry)).toEqual(entry.reference);
    expect(referenceOffer(undefined)).toBeNull();
    expect(referenceOffer({ ...entry, reference: undefined })).toBeNull();
    expect(referenceOffer({ ...entry, reference: { subscriptionPrice: null, withdrawalPrice: 0, asOf: "2026-01-01", sourceUrl: "x" } })).toBeNull();
    expect(referenceOffer({ ...entry, reference: { subscriptionPrice: 200, withdrawalPrice: null, asOf: "", sourceUrl: "x" } })).toBeNull();
  });
  it("applying writes only the prices the offer holds", () => {
    const base = { ...EMPTY_SCPI_METADATA, subscription_price: 150, withdrawal_value: 140 };
    expect(applyReferencePrices(base, { subscriptionPrice: 200, withdrawalPrice: null, asOf: "2026-01-01", sourceUrl: "x" })).toMatchObject({
      subscription_price: 200,
      withdrawal_value: 140,
    });
  });
  it("getCatalogEntry finds by id", () => {
    expect(getCatalogEntry("corum-origin")?.managementCompany).toBe("CORUM Asset Management");
    expect(getCatalogEntry("nope")).toBeUndefined();
  });
});
