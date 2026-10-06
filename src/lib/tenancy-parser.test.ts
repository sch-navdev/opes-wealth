import { describe, expect, it } from "vitest";
import {
  hasAnyExtractedField,
  parseEjariContract,
  parseTawtheeqContract,
  parseTenancyContract,
} from "./tenancy-parser";

const EJARI = [
  "Ejari Tenancy Contract",
  "Tenant Name",
  "محمد علي MICHAEL WILLIAM MCGROARTY اسم المستأجر",
  "Start Date",
  "21-11-2025تاريخ البدء01-12-2026",
  "End Date",
  "Contract Amount",
  "120,000.00 AED قيمة العقد 100,000.00 AED",
  "Annual Amount",
].join("\n");

describe("parseEjariContract", () => {
  it("reads the tenant, both dates and both amounts from the interleaved layout", () => {
    expect(parseEjariContract(EJARI)).toEqual({
      tenant_name: "MICHAEL WILLIAM MCGROARTY",
      tenancy_start_date: "2025-11-21",
      tenancy_end_date: "2026-12-01",
      tenancy_contract_value: 120000,
      annual_rent: 100000,
    });
  });

  it("copes with CRLF line endings and padded lines", () => {
    const parsed = parseEjariContract(EJARI.split("\n").map((l) => `  ${l}  `).join("\r\n"));
    expect(parsed.tenancy_start_date).toBe("2025-11-21");
    expect(parsed.tenant_name).toBe("MICHAEL WILLIAM MCGROARTY");
  });

  it("accepts slash and dot separated dates", () => {
    const parsed = parseEjariContract("Start Date\n21/11/2025x01.12.2026\n");
    expect(parsed.tenancy_start_date).toBe("2025-11-21");
    expect(parsed.tenancy_end_date).toBe("2026-12-01");
  });

  it("returns null for the end date when only one date is present", () => {
    const parsed = parseEjariContract("Start Date\n21-11-2025\n");
    expect(parsed.tenancy_start_date).toBe("2025-11-21");
    expect(parsed.tenancy_end_date).toBeNull();
  });

  it("rejects a month above 12", () => {
    expect(parseEjariContract("Start Date\n21-13-2025\n").tenancy_start_date).toBeNull();
  });

  it("leaves the annual rent null when only one amount is on the line", () => {
    const parsed = parseEjariContract("Contract Amount\n120,000.00 AED\n");
    expect(parsed.tenancy_contract_value).toBe(120000);
    expect(parsed.annual_rent).toBeNull();
  });

  it("returns all nulls for empty or unrelated text", () => {
    const empty = {
      tenant_name: null,
      tenancy_start_date: null,
      tenancy_end_date: null,
      tenancy_contract_value: null,
      annual_rent: null,
    };
    expect(parseEjariContract("")).toEqual(empty);
    expect(parseEjariContract("hello world")).toEqual(empty);
  });

  it("does not read a label that is the last line", () => {
    expect(parseEjariContract("Start Date").tenancy_start_date).toBeNull();
  });

  // tenancy-parser.ts:12-22 — normalizeDate only range-checks the month, so a
  // day like 45 (or 31 February) is emitted as a bogus ISO date instead of null.
  it("rejects impossible days instead of emitting an invalid ISO date", () => {
    expect(parseEjariContract("Start Date\n45-11-2025\n").tenancy_start_date).toBeNull();
  });
});

const TAWTHEEQ = [
  "CONTRACT DETAILS",
  "Start Date2026-04-28تاريخ البدء",
  "End Date2027-04-27تاريخ الانتهاء",
  "Annual Rent157,500.00 الايجار",
  "Contract Value160,000.00 قيمة",
  "LANDLORD DETAILS",
  "Full Name",
  "عبدالله",
  "JOHN LANDLORD",
  "TENANT DETAILS",
  "Full Name",
  "محمد",
  "MICHAEL WILLIAM ",
  "MCGROARTY",
  "PROPERTY DETAILS",
  "Unit 1",
].join("\n");

describe("parseTawtheeqContract", () => {
  it("reads ISO dates, amounts and the wrapped English tenant name", () => {
    expect(parseTawtheeqContract(TAWTHEEQ)).toEqual({
      tenant_name: "MICHAEL WILLIAM MCGROARTY",
      tenancy_start_date: "2026-04-28",
      tenancy_end_date: "2027-04-27",
      tenancy_contract_value: 160000,
      annual_rent: 157500,
    });
  });

  it("does not pick up the landlord's name", () => {
    expect(parseTawtheeqContract(TAWTHEEQ).tenant_name).not.toContain("LANDLORD");
  });

  it("falls back to the signature line when there is no tenant section", () => {
    const text = "Signed\nJOHN SMITH 784199012345678 محمد\n";
    expect(parseTawtheeqContract(text).tenant_name).toBe("JOHN SMITH");
  });

  it("returns nulls for empty text", () => {
    expect(hasAnyExtractedField(parseTawtheeqContract(""))).toBe(false);
  });
});

describe("parseTenancyContract", () => {
  it("dispatches Abu Dhabi to Tawtheeq and everything else to Ejari", () => {
    expect(parseTenancyContract(TAWTHEEQ, "abu_dhabi").tenancy_start_date).toBe("2026-04-28");
    expect(parseTenancyContract(TAWTHEEQ, "dubai").tenancy_start_date).toBeNull();
    expect(parseTenancyContract(EJARI, "dubai").tenancy_start_date).toBe("2025-11-21");
    expect(parseTenancyContract(EJARI, "abu_dhabi").tenancy_start_date).toBeNull();
  });
});

describe("hasAnyExtractedField", () => {
  const nulls = {
    tenant_name: null,
    tenancy_start_date: null,
    tenancy_end_date: null,
    tenancy_contract_value: null,
    annual_rent: null,
  };

  it("is false when everything is null or blank", () => {
    expect(hasAnyExtractedField(nulls)).toBe(false);
    expect(hasAnyExtractedField({ ...nulls, tenant_name: "" })).toBe(false);
  });

  it("is true when any single field was extracted, including a zero amount", () => {
    expect(hasAnyExtractedField({ ...nulls, tenant_name: "A" })).toBe(true);
    expect(hasAnyExtractedField({ ...nulls, annual_rent: 0 })).toBe(true);
  });
});
