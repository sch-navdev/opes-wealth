import { describe, expect, it } from "vitest";
import {
  detectPropertyDocumentType,
  hasAnyExtractedField,
  parseAbuDhabiOffplanSpa,
  parseAbuDhabiTitleDeed,
  parseDubaiDldReceipt,
  parseDubaiFormF,
  parseDubaiOqood,
  parseDubaiTitleDeed,
  parsePropertyDocument,
  toRealEstateMetadataPatch,
} from "./property-document-parser";

const SPA = [
  "Off-Plan Unit Sale and Purchase Agreement",
  "اسم المشروع * منارة ليفنج 3 Manarat Living III Project Name *",
  "104",
  "Unit No.  *",
  "142.88 (Sq.m)",
  "Unit Total Area  *",
  "(Sq.m)69.50",
  "Unit Internal Area  *",
  "73.38",
  "Balcony  *",
  "سعر الوحدة بالأرقام (درهم) * 3,980,915.00 Unit Price in Numbers",
  "* P-12 Plot No. *",
  "* 20250000424792 Project No. *",
  "31/12/2027 Estimated Completion",
].join("\n");

const AD_DEED = [
  "Abu Dhabi Real Estate Centre Title Deed",
  "Unit No.303توقيع",
  "Unit Area.124.10 m²/1,335.80 ft²مساحة",
  "Project Name Al Bandar مشروع",
  "Plot No.PLT-77رقم",
  "Application Date: 2024/05/17",
  "OWNER DETAILS AND SHARES",
  "محمد",
  "STEVE CHRISTOPHER",
  "HARO",
  "100%",
  "This Property and ownership is registered",
].join("\n");

const DUBAI_DEED = [
  "Title Deed",
  "Owners numbers 2",
  "(5167151) STEVE CHRISTOPHER HARO",
  "(5167152) JANE DOE",
  "Area (Sq Meter)",
  "60.5",
  "60.5",
  "Purchased from X",
  "107.62",
  "Suite Area :",
  "13.38",
  "Balcony Area :",
  "713",
  "Common Area:",
  "712132/2025",
  "ELLINGTON HOUSE 1مبنى",
  "for the amount 3,400,000 Dirham",
  "15/03/2025",
  "Issue Date",
].join("\n");

const FORM_F = [
  "Unified Sell Contract (F)",
  "Sell PriceAED 1,550,000.00 Deposit AmountAED 155,000.00",
  "Contract NumberCF202405131694 StatusSigned",
  "Title Deed #63560/2016",
  "Start Date 01/06/2024",
  "Seller Name",
  "اسم",
  "SHOLEEN TARIQ CARRIMJEEاسم البائع",
  "Buyer Name",
  "اسم",
  "STEVE CHRISTOPHER HARO",
  "Selling Details",
  "Seller Name",
  "SHOLEEN  TARIQ CARRIMJEE",
].join("\n");

const OQOOD = [
  "INITIAL CONTRACT OF SALE",
  "ELTIERA HEIGHTS/807",
  "76.75 Sq.M.",
  "2029828 AED",
  "Contract No.755314/2025",
  "This contract is made on 12/03/2025",
  "VOUCHERS LIST",
  "40617 AED",
].join("\n");

const DLD = [
  "dubailand.gov.ae",
  "Fees Details",
  "Registration fees for the purchase 40,617.00 رسوم",
  "Knowledge fee 10.00 رسوم",
  "Innovation fee 10.00 رسوم",
  "Procedure Date",
  "Procedure Type",
  "Sell - Pre registration",
  "15-3-2025",
  "NameELLINGTON PCFC DEVELOPERS",
  "L.L.C",
  "ELT 807",
  "Unit Number",
  "ELTIERA HEIGHTS",
  "Building Name",
  "Total Fees:",
  "40,637.00",
  "Print Date:",
  "Knowledge fee 99.00 second receipt",
  "Total Fees:",
  "99.00",
].join("\n");

describe("parseAbuDhabiOffplanSpa", () => {
  it("reads project, unit, areas, price, plot, project number and completion date", () => {
    expect(parseAbuDhabiOffplanSpa(SPA)).toEqual({
      type: "abu_dhabi_offplan_spa",
      project_name: "Manarat Living III",
      unit_number: "104",
      area_sqm: 142.88,
      internal_area_sqm: 69.5,
      balcony_area_sqm: 73.38,
      price: 3980915,
      plot_number: "P-12",
      project_number: "20250000424792",
      estimated_completion_date: "2027-12-31",
    });
  });

  it("returns nulls for text that has none of the labels", () => {
    expect(hasAnyExtractedField(parseAbuDhabiOffplanSpa("nothing"))).toBe(false);
    expect(hasAnyExtractedField(parseAbuDhabiOffplanSpa(""))).toBe(false);
  });
});

describe("parseAbuDhabiTitleDeed", () => {
  it("reads unit, area, project, plot, date and the wrapped owner name", () => {
    expect(parseAbuDhabiTitleDeed(AD_DEED)).toEqual({
      type: "abu_dhabi_title_deed",
      unit_number: "303",
      area_sqm: 124.1,
      owner_names: ["STEVE CHRISTOPHER HARO"],
      project_name: "Al Bandar",
      plot_number: "PLT-77",
      application_date: "2024-05-17",
    });
  });

  it("separates several owners and de-duplicates repeated ones", () => {
    const text = [
      "OWNER DETAILS AND SHARES",
      "محمد",
      "JOHN SMITH",
      "50%",
      "علي",
      "JANE DOE",
      "50%",
      "جون",
      "john   smith".toUpperCase(),
      "This Property and ownership",
    ].join("\n");
    expect(parseAbuDhabiTitleDeed(text).owner_names).toEqual(["JOHN SMITH", "JANE DOE"]);
  });

  it("returns all-null/empty for a scanned deed with no text layer", () => {
    expect(hasAnyExtractedField(parseAbuDhabiTitleDeed(""))).toBe(false);
  });
});

describe("parseDubaiTitleDeed", () => {
  it("reads the full set of fields and sums owner shares into the total area", () => {
    expect(parseDubaiTitleDeed(DUBAI_DEED)).toEqual({
      type: "dubai_title_deed",
      property_number: "713",
      area_sqm: 121,
      suite_area_sqm: 107.62,
      balcony_area_sqm: 13.38,
      owner_names: ["STEVE CHRISTOPHER HARO", "JANE DOE"],
      building_name: "Ellington House 1",
      title_deed_number: "712132/2025",
      purchase_price: 3400000,
      issue_date: "2025-03-15",
    });
  });

  it("uses the first area figure when it does not line up one-to-one with owners", () => {
    const text = ["(1) JOHN SMITH", "Area (Sq Meter)", "121", "Purchased from X"].join("\n");
    expect(parseDubaiTitleDeed(text).area_sqm).toBe(121);
  });

  it("gives null property_number when the line above Common Area is not numeric", () => {
    expect(parseDubaiTitleDeed("abc\nCommon Area:").property_number).toBeNull();
  });

  it("returns nulls for empty text", () => {
    expect(hasAnyExtractedField(parseDubaiTitleDeed(""))).toBe(false);
  });
});

describe("parseDubaiFormF", () => {
  it("reads prices, identifiers, date and de-duplicated seller/buyer names", () => {
    expect(parseDubaiFormF(FORM_F)).toEqual({
      type: "dubai_form_f",
      sell_price: 1550000,
      deposit_amount: 155000,
      seller_names: ["SHOLEEN TARIQ CARRIMJEE"],
      buyer_names: ["STEVE CHRISTOPHER HARO"],
      contract_number: "CF202405131694",
      title_deed_number: "63560/2016",
      start_date: "2024-06-01",
    });
  });

  it("repairs the shifted-glyph export variant", () => {
    const shift = (s: string) => s.replace(/[^\n]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 29));
    const original = ["Seller Name", "JOHN DOE", "Buyer Name", "Sell PriceAED 1,000.00"].join("\n");
    const parsed = parseDubaiFormF(shift(original));
    expect(parsed.sell_price).toBe(1000);
    expect(parsed.seller_names).toEqual(["JOHN DOE"]);
  });

  it("yields nulls for a cover sheet with no price block", () => {
    const parsed = parseDubaiFormF("Unified Sell Contract (F)\nTerms and Conditions");
    expect(parsed.sell_price).toBeNull();
    expect(parsed.seller_names).toEqual([]);
  });
});

describe("parseDubaiOqood", () => {
  it("reads project, unit, area, value (before the voucher list), contract number and date", () => {
    expect(parseDubaiOqood(OQOOD)).toEqual({
      type: "dubai_oqood",
      project_name: "Eltiera Heights",
      unit_number: "807",
      area_sqm: 76.75,
      value: 2029828,
      contract_number: "755314/2025",
      contract_date: "2025-03-12",
    });
  });

  it("does not take the value from the unrelated voucher amounts", () => {
    const text = ["ELTIERA HEIGHTS/807", "VOUCHERS LIST", "40617 AED"].join("\n");
    expect(parseDubaiOqood(text).value).toBeNull();
  });
});

describe("parseDubaiDldReceipt", () => {
  it("reads fees, procedure, payer, unit and building from the first receipt only", () => {
    expect(parseDubaiDldReceipt(DLD)).toEqual({
      type: "dubai_dld_receipt",
      payment_amount: 40637,
      procedure_type: "Sell - Pre registration",
      procedure_date: "2025-03-15",
      payer_name: "ELLINGTON PCFC DEVELOPERS L.L.C",
      unit_number: "807",
      building_name: "Eltiera Heights",
      registration_fee: 40617,
      knowledge_fee: 10,
      innovation_fee: 10,
      title_deed_fee: null,
      map_fee: null,
    });
  });

  it("returns nulls for empty text", () => {
    expect(hasAnyExtractedField(parseDubaiDldReceipt(""))).toBe(false);
  });
});

describe("detectPropertyDocumentType", () => {
  it("classifies each supported document", () => {
    expect(detectPropertyDocumentType(SPA)).toBe("abu_dhabi_offplan_spa");
    expect(detectPropertyDocumentType(OQOOD)).toBe("dubai_oqood");
    expect(detectPropertyDocumentType(FORM_F)).toBe("dubai_form_f");
    expect(detectPropertyDocumentType(DLD)).toBe("dubai_dld_receipt");
    expect(detectPropertyDocumentType(AD_DEED)).toBe("abu_dhabi_title_deed");
    expect(detectPropertyDocumentType(DUBAI_DEED)).toBe("dubai_title_deed");
  });

  it("returns null for unrelated or empty text", () => {
    expect(detectPropertyDocumentType("")).toBeNull();
    expect(detectPropertyDocumentType("Grocery list")).toBeNull();
  });
});

describe("parsePropertyDocument", () => {
  it("auto-detects the type when none is given", () => {
    expect(parsePropertyDocument(OQOOD)?.type).toBe("dubai_oqood");
  });

  it("honours an explicit type over detection", () => {
    expect(parsePropertyDocument(OQOOD, "dubai_form_f")?.type).toBe("dubai_form_f");
  });

  it("returns null only when nothing can be detected", () => {
    expect(parsePropertyDocument("Grocery list")).toBeNull();
  });
});

describe("hasAnyExtractedField", () => {
  it("ignores the type discriminator and treats empty arrays as nothing", () => {
    expect(hasAnyExtractedField(parseDubaiFormF(""))).toBe(false);
  });

  it("is true when any field has a value", () => {
    expect(hasAnyExtractedField(parseDubaiFormF(FORM_F))).toBe(true);
  });
});

describe("toRealEstateMetadataPatch", () => {
  it("maps an off-plan SPA and omits unextracted fields", () => {
    const patch = toRealEstateMetadataPatch(parseAbuDhabiOffplanSpa(SPA));
    expect(patch).toMatchObject({
      emirate: "abu_dhabi",
      is_offplan: true,
      contract_price: 3980915,
      purchasePrice: 3980915,
      surfaceArea: 142.88,
      internal_area: 69.5,
      terrace_area: 73.38,
      adrec_plot_number: "P-12",
      adrec_project_id: "20250000424792",
      address: "Manarat Living III - Unit 104",
    });
    expect(Object.values(patch).every((v) => v !== null && v !== undefined)).toBe(true);
  });

  it("omits the address when either project or unit is missing", () => {
    const patch = toRealEstateMetadataPatch({ ...parseAbuDhabiOffplanSpa(SPA), unit_number: null });
    expect(patch).not.toHaveProperty("address");
  });

  it("splits ownership equally across owners", () => {
    const two = toRealEstateMetadataPatch(parseDubaiTitleDeed(DUBAI_DEED));
    expect(two.ownership).toEqual([
      { name: "STEVE CHRISTOPHER HARO", percentage: 50 },
      { name: "JANE DOE", percentage: 50 },
    ]);
    const three = toRealEstateMetadataPatch({ ...parseDubaiTitleDeed(DUBAI_DEED), owner_names: ["A", "B", "C"] });
    expect(three.ownership?.map((o) => o.percentage)).toEqual([33.33, 33.33, 33.33]);
  });

  it("does not set ownership when no owners were found", () => {
    const patch = toRealEstateMetadataPatch(parseAbuDhabiTitleDeed(AD_DEED.replace("STEVE CHRISTOPHER", "x").replace("HARO", "y")));
    expect(patch).not.toHaveProperty("ownership");
  });

  it("maps Dubai documents to the Dubai emirate", () => {
    expect(toRealEstateMetadataPatch(parseDubaiTitleDeed(DUBAI_DEED))).toMatchObject({
      emirate: "dubai",
      surfaceArea: 121,
      internal_area: 107.62,
      terrace_area: 13.38,
      purchasePrice: 3400000,
      title_deed_number: "712132/2025",
      address: "Ellington House 1 - Unit 713",
    });
    expect(toRealEstateMetadataPatch(parseDubaiFormF(FORM_F))).toMatchObject({
      emirate: "dubai",
      purchasePrice: 1550000,
      title_deed_number: "63560/2016",
    });
    expect(toRealEstateMetadataPatch(parseDubaiOqood(OQOOD))).toMatchObject({
      emirate: "dubai",
      is_offplan: true,
      contract_price: 2029828,
      oqood_number: "755314/2025",
    });
  });

  it("maps a DLD receipt to RERA fees, falling back to the receipt total", () => {
    expect(toRealEstateMetadataPatch(parseDubaiDldReceipt(DLD))).toMatchObject({
      registration_fee_type: "RERA",
      registration_fee_amount: 40617,
      rera_knowledge_fee: 10,
    });
    const fallback = toRealEstateMetadataPatch({ ...parseDubaiDldReceipt(DLD), registration_fee: null });
    expect(fallback.registration_fee_amount).toBe(40637);
    const none = toRealEstateMetadataPatch(parseDubaiDldReceipt(""));
    expect(none).toEqual({ emirate: "dubai" });
  });
});
