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

import { createIncomeStream, deleteIncomeStream, updateIncomeStream } from "@/app/dashboard/income-stream-actions";
import { DEMO_USER_ID } from "@/lib/demo-mode";

const valid = {
  kind: "salary",
  label: "Main job",
  source_name: "Acme",
  amount: 4200,
  currency: "EUR",
  frequency: "monthly",
  pay_day: 28,
  pay_month: null,
  start_date: "2026-01-01",
  end_date: null,
  notes: "",
};

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  mocks.needsMfa.mockResolvedValue(false);
  // insert(row).select("id").single()
  mocks.single.mockResolvedValue({ data: { id: "new1" }, error: null });
  mocks.insertSelect.mockReturnValue({ single: mocks.single });
  mocks.insert.mockReturnValue({ select: mocks.insertSelect });
  // update(row)/delete().eq("id").eq("profile_id").select("id")
  mocks.select.mockResolvedValue({ data: [{ id: "s1" }], error: null });
  mocks.eq2.mockReturnValue({ select: mocks.select });
  mocks.eq1.mockReturnValue({ eq: mocks.eq2 });
  mocks.update.mockReturnValue({ eq: mocks.eq1 });
  mocks.del.mockReturnValue({ eq: mocks.eq1 });
  mocks.from.mockReturnValue({ insert: mocks.insert, update: mocks.update, delete: mocks.del });
});

describe("createIncomeStream", () => {
  it("inserts the cleaned row for the signed-in user only", async () => {
    const r = await createIncomeStream({ ...valid, profile_id: "someone-else", label: "  Main job " });
    expect(r).toEqual({ ok: true, id: "new1" });
    expect(mocks.from).toHaveBeenCalledWith("income_streams");
    const row = mocks.insert.mock.calls[0][0];
    expect(row.profile_id).toBe("u1");
    expect(row.label).toBe("Main job");
    expect(mocks.revalidate).toHaveBeenCalled();
  });

  it("requires a session and MFA", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await createIncomeStream(valid)).toEqual({ ok: false, error: "cf_err_signed_out" });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mocks.needsMfa.mockResolvedValue(true);
    expect(await createIncomeStream(valid)).toEqual({ ok: false, error: "cf_err_mfa" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("refuses the demo user without touching the database", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: DEMO_USER_ID } } });
    expect(await createIncomeStream(valid)).toEqual({ ok: false, error: "cf_err_demo" });
    expect(await updateIncomeStream("s1", valid)).toEqual({ ok: false, error: "cf_err_demo" });
    expect(await deleteIncomeStream("s1")).toEqual({ ok: false, error: "cf_err_demo" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns the validation code and writes nothing", async () => {
    expect(await createIncomeStream({ ...valid, amount: -5 })).toEqual({ ok: false, error: "cf_err_amount" });
    expect(await createIncomeStream({ ...valid, frequency: "annual", pay_month: null })).toEqual({
      ok: false,
      error: "cf_err_pay_month",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("maps a missing table and other database errors", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: "42P01", message: "relation does not exist" } });
    expect(await createIncomeStream(valid)).toEqual({ ok: false, error: "cf_err_unavailable" });
    mocks.single.mockResolvedValue({ data: null, error: { code: "23514", message: "check" } });
    expect(await createIncomeStream(valid)).toEqual({ ok: false, error: "cf_err_save_failed" });
  });
});

describe("updateIncomeStream", () => {
  it("updates only the caller's own row", async () => {
    expect(await updateIncomeStream("s1", valid)).toEqual({ ok: true, id: "s1" });
    expect(mocks.eq1).toHaveBeenCalledWith("id", "s1");
    expect(mocks.eq2).toHaveBeenCalledWith("profile_id", "u1");
    expect(mocks.update.mock.calls[0][0].updated_at).toEqual(expect.any(String));
  });

  it("reports not found when no row matched (someone else's row)", async () => {
    mocks.select.mockResolvedValue({ data: [], error: null });
    expect(await updateIncomeStream("s1", valid)).toEqual({ ok: false, error: "cf_err_not_found" });
  });

  it("validates before writing", async () => {
    expect(await updateIncomeStream("s1", { ...valid, currency: "eur1" })).toEqual({ ok: false, error: "cf_err_currency" });
    expect(await updateIncomeStream("", valid)).toEqual({ ok: false, error: "cf_err_not_found" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("deleteIncomeStream", () => {
  it("deletes scoped to the owner", async () => {
    expect(await deleteIncomeStream("s1")).toEqual({ ok: true, id: "s1" });
    expect(mocks.eq2).toHaveBeenCalledWith("profile_id", "u1");
  });

  it("reports not found", async () => {
    mocks.select.mockResolvedValue({ data: [], error: null });
    expect(await deleteIncomeStream("s1")).toEqual({ ok: false, error: "cf_err_not_found" });
  });
});
