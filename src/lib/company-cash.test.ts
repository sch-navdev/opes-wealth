import { describe, expect, it } from "vitest";
import {
  COMPANY_CASH_CATEGORY,
  companyAccountOwner,
  companyIdOf,
  companyIdSet,
  companyIdsOf,
  displayCategory,
  isCompanyAccount,
  splitCashByCompany,
  sumCompanyCash,
  sumPersonalCash,
  withCompanyId,
} from "@/lib/company-cash";

// Invented fixtures only.
type Row = { id: string; is_liability: boolean; metadata: Record<string, unknown> | null; asset_categories: { name: string } | null; v: number };
const row = (id: string, category: string, v: number, metadata: Record<string, unknown> | null = null, is_liability = false): Row => ({
  id,
  is_liability,
  metadata,
  asset_categories: { name: category },
  v,
});

const company = row("co1", "Companies", 0);
const company2 = row("co2", "Companies", 0);
const personalCash = row("c1", "Cash", 100, { institution_name: "Bank A" });
const companyCash = row("c2", "Cash", 250, { company_id: "co1" });
const companyCash2 = row("c3", "Cash", 50, { company_id: "co2" });
const orphanCash = row("c4", "Cash", 70, { company_id: "gone" });
const all = [company, company2, personalCash, companyCash, companyCash2, orphanCash];
const ids = companyIdSet(all);

describe("companyIdOf", () => {
  it("returns the trimmed id and ignores anything that is not a string", () => {
    expect(companyIdOf({ company_id: "  co1 " })).toBe("co1");
    expect(companyIdOf({ company_id: 5 })).toBe("");
    expect(companyIdOf({})).toBe("");
    expect(companyIdOf(null)).toBe("");
    expect(companyIdOf("x")).toBe("");
  });
});

describe("isCompanyAccount", () => {
  it("is true for a Cash account whose link resolves to a visible company", () => {
    expect(isCompanyAccount(companyCash, ids)).toBe(true);
    expect(isCompanyAccount(personalCash, ids)).toBe(false);
  });

  it("an orphan link (company deleted / not visible) falls back to a personal account", () => {
    expect(isCompanyAccount(orphanCash, ids)).toBe(false);
    // without the id set, any non-empty company_id counts
    expect(isCompanyAccount(orphanCash)).toBe(true);
  });

  it("only Cash assets that are not liabilities can be company accounts", () => {
    expect(isCompanyAccount(row("x", "Equities", 1, { company_id: "co1" }), ids)).toBe(false);
    expect(isCompanyAccount(row("y", "Cash", 1, { company_id: "co1" }, true), ids)).toBe(false);
    expect(isCompanyAccount({ metadata: { company_id: "co1" }, asset_categories: null }, ids)).toBe(false);
  });

  it("companyAccountOwner returns the company id or null", () => {
    expect(companyAccountOwner(companyCash, ids)).toBe("co1");
    expect(companyAccountOwner(personalCash, ids)).toBeNull();
  });
});

describe("companyIdsOf", () => {
  it("is undefined when no row carries an id, else the set of Companies ids", () => {
    expect(companyIdsOf([{ asset_categories: { name: "Cash" } }])).toBeUndefined();
    expect([...(companyIdsOf(all) ?? [])].sort()).toEqual(["co1", "co2"]);
  });
});

describe("displayCategory", () => {
  it("labels company accounts as Company cash and leaves everything else", () => {
    expect(displayCategory(companyCash, ids)).toBe(COMPANY_CASH_CATEGORY);
    expect(displayCategory(personalCash, ids)).toBe("Cash");
    expect(displayCategory(orphanCash, ids)).toBe("Cash");
    expect(displayCategory(company, ids)).toBe("Companies");
    expect(displayCategory({ asset_categories: null })).toBe("—");
  });
});

describe("personal vs company cash split", () => {
  it("splits the cash accounts and keeps every amount exactly once", () => {
    const { personal, byCompany } = splitCashByCompany(all, ids);
    expect(personal.map((a) => a.id)).toEqual(["c1", "c4"]);
    expect([...byCompany.keys()].sort()).toEqual(["co1", "co2"]);
    expect(byCompany.get("co1")?.map((a) => a.id)).toEqual(["c2"]);
    const personalSum = sumPersonalCash(all, (a) => a.v, ids);
    const companySum = sumCompanyCash(all, (a) => a.v, ids);
    expect(personalSum).toBe(170);
    expect(companySum).toBe(300);
    // personal + company = every Cash account: nothing lost, nothing counted twice
    const allCash = all.filter((a) => a.asset_categories?.name === "Cash").reduce((s, a) => s + a.v, 0);
    expect(personalSum + companySum).toBe(allCash);
  });

  it("ignores liabilities and non-cash rows", () => {
    const card = row("card", "Cash", 999, { company_id: "co1" }, true);
    expect(sumCompanyCash([...all, card], (a) => a.v, ids)).toBe(300);
    expect(splitCashByCompany([card, company], ids)).toEqual({ personal: [], byCompany: new Map() });
  });
});

describe("withCompanyId", () => {
  it("sets the link and keeps every other key", () => {
    expect(withCompanyId({ institution_name: "Bank A", account_ref: "1234" }, " co1 ")).toEqual({
      institution_name: "Bank A",
      account_ref: "1234",
      company_id: "co1",
    });
  });

  it("removes the link with null or an empty id, and tolerates missing metadata", () => {
    expect(withCompanyId({ a: 1, company_id: "co1" }, null)).toEqual({ a: 1 });
    expect(withCompanyId({ a: 1, company_id: "co1" }, "  ")).toEqual({ a: 1 });
    expect(withCompanyId(null, "co1")).toEqual({ company_id: "co1" });
    expect(withCompanyId([1, 2], "co1")).toEqual({ company_id: "co1" });
  });

  it("does not mutate its input", () => {
    const input = { company_id: "co1" };
    withCompanyId(input, null);
    expect(input).toEqual({ company_id: "co1" });
  });
});
