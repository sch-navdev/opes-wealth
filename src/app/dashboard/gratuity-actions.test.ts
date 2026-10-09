import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  needsMfa: vi.fn(),
  revalidate: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  insertSelect: vi.fn(),
  single: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  eq1: vi.fn(),
  eq2: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
}));
vi.mock("@/utils/supabase/mfa", () => ({ needsMfaStepUp: mocks.needsMfa }));
vi.mock("@/utils/supabase/mock-auth", () => ({
  isMockAuthEnabled: () => false,
  getMockUserId: () => null,
  createMockAdminClient: () => {
    throw new Error("not used");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { createGratuityPlan, deleteGratuityPlan, updateGratuityPlan } from "@/app/dashboard/gratuity-actions";
import { DEMO_USER_ID } from "@/lib/demo-mode";

const valid = {
  employer: "Invented Co",
  start_date: "2010-01-01",
  end_date: null,
  contract_type: "unlimited",
  unpaid_leave_days: 0,
  wage_history: [{ from: "2010-01-01", basicMonthly: 12000 }],
  payments: [{ date: "2020-01-01", amount: 1000, note: "" }],
  employer_stated_balance: null,
  currency: "AED",
  notes: "",
};

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  mocks.needsMfa.mockResolvedValue(false);
  mocks.single.mockResolvedValue({ data: { id: "new1" }, error: null });
  mocks.insertSelect.mockReturnValue({ single: mocks.single });
  mocks.insert.mockReturnValue({ select: mocks.insertSelect });
  mocks.select.mockResolvedValue({ data: [{ id: "p1" }], error: null });
  mocks.eq2.mockReturnValue({ select: mocks.select });
  mocks.eq1.mockReturnValue({ eq: mocks.eq2 });
  mocks.update.mockReturnValue({ eq: mocks.eq1 });
  mocks.del.mockReturnValue({ eq: mocks.eq1 });
  mocks.from.mockReturnValue({ insert: mocks.insert, update: mocks.update, delete: mocks.del });
});

describe("createGratuityPlan", () => {
  it("inserts for the signed-in user only", async () => {
    const r = await createGratuityPlan({ ...valid, profile_id: "someone-else", employer: "  Invented Co " });
    expect(r).toEqual({ ok: true, id: "new1" });
    expect(mocks.from).toHaveBeenCalledWith("end_of_service_plans");
    const row = mocks.insert.mock.calls[0][0];
    expect(row.profile_id).toBe("u1");
    expect(row.employer).toBe("Invented Co");
    expect(mocks.revalidate).toHaveBeenCalled();
  });

  it("requires a session and MFA", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await createGratuityPlan(valid)).toEqual({ ok: false, error: "grat_err_signed_out" });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mocks.needsMfa.mockResolvedValue(true);
    expect(await createGratuityPlan(valid)).toEqual({ ok: false, error: "grat_err_mfa" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("refuses the demo user without touching the database", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: DEMO_USER_ID } } });
    expect(await createGratuityPlan(valid)).toEqual({ ok: false, error: "grat_err_demo" });
    expect(await updateGratuityPlan("p1", valid)).toEqual({ ok: false, error: "grat_err_demo" });
    expect(await deleteGratuityPlan("p1")).toEqual({ ok: false, error: "grat_err_demo" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns the validation code and writes nothing", async () => {
    expect(await createGratuityPlan({ ...valid, wage_history: [] })).toEqual({ ok: false, error: "grat_err_wage" });
    expect(await createGratuityPlan({ ...valid, currency: "x" })).toEqual({ ok: false, error: "grat_err_currency" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("maps a missing table and other database errors", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: "42P01", message: "relation does not exist" } });
    expect(await createGratuityPlan(valid)).toEqual({ ok: false, error: "grat_err_unavailable" });
    mocks.single.mockResolvedValue({ data: null, error: { code: "23514", message: "check" } });
    expect(await createGratuityPlan(valid)).toEqual({ ok: false, error: "grat_err_save_failed" });
  });
});

describe("updateGratuityPlan", () => {
  it("updates only the caller row", async () => {
    expect(await updateGratuityPlan("p1", valid)).toEqual({ ok: true, id: "p1" });
    expect(mocks.eq1).toHaveBeenCalledWith("id", "p1");
    expect(mocks.eq2).toHaveBeenCalledWith("profile_id", "u1");
  });

  it("not found for another user row or blank id; validates first", async () => {
    mocks.select.mockResolvedValue({ data: [], error: null });
    expect(await updateGratuityPlan("p1", valid)).toEqual({ ok: false, error: "grat_err_not_found" });
    expect(await updateGratuityPlan("", valid)).toEqual({ ok: false, error: "grat_err_not_found" });
    expect(await updateGratuityPlan("p1", { ...valid, employer: "" })).toEqual({ ok: false, error: "grat_err_employer" });
  });
});

describe("deleteGratuityPlan", () => {
  it("deletes scoped to the owner", async () => {
    expect(await deleteGratuityPlan("p1")).toEqual({ ok: true, id: "p1" });
    expect(mocks.eq2).toHaveBeenCalledWith("profile_id", "u1");
  });

  it("reports not found", async () => {
    mocks.select.mockResolvedValue({ data: [], error: null });
    expect(await deleteGratuityPlan("p1")).toEqual({ ok: false, error: "grat_err_not_found" });
  });
});
