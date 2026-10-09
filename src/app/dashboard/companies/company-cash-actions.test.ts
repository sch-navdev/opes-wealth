/**
 * setBankAccountCompany against the in-memory Supabase fake (src/test/fake-supabase.ts): no RLS, joins
 * ignored, so rows are seeded with their `asset_categories` object attached. Invented fixtures only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "@/test/fake-supabase";
import { DEMO_USER_ID } from "@/lib/demo-mode";

const mocks = vi.hoisted(() => ({
  db: null as unknown as { client: () => Record<string, unknown> },
  getUser: vi.fn(),
  needsMfaStepUp: vi.fn(),
  isMockAuthEnabled: vi.fn(),
  getMockUserId: vi.fn(),
  createMockAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ ...mocks.db.client(), auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/utils/supabase/mfa", () => ({ needsMfaStepUp: mocks.needsMfaStepUp }));
vi.mock("@/utils/supabase/mock-auth", () => ({
  isMockAuthEnabled: mocks.isMockAuthEnabled,
  getMockUserId: mocks.getMockUserId,
  createMockAdminClient: mocks.createMockAdminClient,
}));

import { setBankAccountCompany } from "@/app/dashboard/companies/company-cash-actions";

const ME = "user-me";
const OTHER = "user-other";
let db: FakeDb;

const asset = (id: string, profile_id: string, category: string, over: Record<string, unknown> = {}) => ({
  id,
  profile_id,
  name: `Asset ${id}`,
  status: "active",
  current_value: 100,
  is_liability: false,
  metadata: {},
  asset_categories: { name: category },
  ...over,
});
const stored = (id: string) => db.table("assets").find((r) => r.id === id)!.metadata as Record<string, unknown>;

function seed(owner = ME) {
  db.seed("assets", [
    asset("co", owner, "Companies"),
    asset("co2", owner, "Companies"),
    asset("acc", owner, "Cash", { metadata: { institution_name: "Bank A", account_ref: "1234" } }),
    asset("card", owner, "Liabilities", { is_liability: true }),
    asset("eq", owner, "Equities"),
    asset("theirCo", OTHER, "Companies"),
    asset("sold", owner, "Cash", { status: "sold" }),
  ]);
}

beforeEach(() => {
  for (const m of Object.values(mocks)) if (typeof m === "function" && "mockReset" in m) m.mockReset();
  db = new FakeDb();
  mocks.db = db as unknown as typeof mocks.db;
  mocks.getUser.mockResolvedValue({ data: { user: { id: ME } } });
  mocks.needsMfaStepUp.mockResolvedValue(false);
  mocks.isMockAuthEnabled.mockReturnValue(false);
});

describe("setBankAccountCompany", () => {
  it("requires a signed-in user and a completed MFA step-up", async () => {
    seed();
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await setBankAccountCompany("acc", "co")).toEqual({ ok: false, error: "cco_err_signed_out" });
    mocks.getUser.mockResolvedValue({ data: { user: { id: ME } } });
    mocks.needsMfaStepUp.mockResolvedValue(true);
    expect(await setBankAccountCompany("acc", "co")).toEqual({ ok: false, error: "cco_err_mfa" });
    expect(stored("acc").company_id).toBeUndefined();
  });

  it("links the account to the company, merges the metadata and revalidates", async () => {
    seed();
    expect(await setBankAccountCompany("acc", " co ")).toEqual({ ok: true, companyId: "co" });
    expect(stored("acc")).toEqual({ institution_name: "Bank A", account_ref: "1234", company_id: "co" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
    // nothing else touched: still Cash, same balance
    const row = db.table("assets").find((r) => r.id === "acc")!;
    expect(row.current_value).toBe(100);
    expect((row.asset_categories as { name: string }).name).toBe("Cash");
  });

  it("moves the account to another company", async () => {
    seed();
    await setBankAccountCompany("acc", "co");
    expect(await setBankAccountCompany("acc", "co2")).toEqual({ ok: true, companyId: "co2" });
    expect(stored("acc").company_id).toBe("co2");
  });

  it("null or empty makes it a personal account again, keeping the other keys", async () => {
    seed();
    await setBankAccountCompany("acc", "co");
    expect(await setBankAccountCompany("acc", null)).toEqual({ ok: true, companyId: null });
    expect(stored("acc")).toEqual({ institution_name: "Bank A", account_ref: "1234" });
    await setBankAccountCompany("acc", "co");
    expect(await setBankAccountCompany("acc", "")).toEqual({ ok: true, companyId: null });
    expect(stored("acc").company_id).toBeUndefined();
  });

  it("refuses anything that is not the caller's own active Cash account", async () => {
    seed();
    for (const id of ["card", "eq", "co", "sold", "nope", "theirCo"]) {
      expect(await setBankAccountCompany(id, "co")).toEqual({ ok: false, error: "cco_err_account_not_found" });
    }
    expect(await setBankAccountCompany("", "co")).toEqual({ ok: false, error: "cco_err_invalid" });
  });

  it("refuses a target that is not one of the caller's own Companies", async () => {
    seed();
    for (const target of ["eq", "acc", "theirCo", "nope"]) {
      expect(await setBankAccountCompany("acc", target)).toEqual({ ok: false, error: "cco_err_company_not_found" });
    }
    expect(stored("acc").company_id).toBeUndefined();
  });

  it("refuses an account that is co-owned with somebody else", async () => {
    seed();
    db.seed("asset_owners", [
      { asset_id: "acc", profile_id: ME, ownership_percentage: 50, is_creator: true },
      { asset_id: "acc", profile_id: OTHER, ownership_percentage: 50, is_creator: false },
    ]);
    expect(await setBankAccountCompany("acc", "co")).toEqual({ ok: false, error: "cco_err_co_owned" });
    expect(stored("acc").company_id).toBeUndefined();
  });

  it("fails closed when the co-ownership lookup fails or throws", async () => {
    seed();
    db.throwingTables.add("asset_owners");
    expect(await setBankAccountCompany("acc", "co")).toEqual({ ok: false, error: "cco_err_save_failed" });
    expect(stored("acc").company_id).toBeUndefined();
  });

  it("the demo account is read-only: success is reported, nothing is written", async () => {
    seed(DEMO_USER_ID);
    mocks.getUser.mockResolvedValue({ data: { user: { id: DEMO_USER_ID } } });
    expect(await setBankAccountCompany("acc", "co")).toEqual({ ok: true, companyId: "co" });
    expect(stored("acc").company_id).toBeUndefined();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
