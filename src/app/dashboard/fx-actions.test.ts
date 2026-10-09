import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  needsMfa: vi.fn(),
  revalidate: vi.fn(),
  runRefresh: vi.fn(),
  limit: vi.fn(),
  service: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/utils/supabase/service", () => ({ createServiceClient: mocks.service }));
vi.mock("@/utils/supabase/mfa", () => ({ needsMfaStepUp: mocks.needsMfa }));
vi.mock("@/utils/supabase/mock-auth", () => ({
  isMockAuthEnabled: () => false,
  getMockUserId: () => null,
  createMockAdminClient: () => {
    throw new Error("not used");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/fx-rates-refresh", () => ({ runFxRefresh: mocks.runRefresh }));

import { refreshFxRatesNow } from "@/app/dashboard/fx-actions";
import { DEMO_USER_ID } from "@/lib/demo-mode";

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  mocks.needsMfa.mockResolvedValue(false);
  mocks.limit.mockResolvedValue({ data: [], error: null });
  mocks.service.mockReturnValue({
    from: () => ({ select: () => ({ order: () => ({ limit: mocks.limit }) }) }),
  });
  mocks.runRefresh.mockResolvedValue({ ok: true, date: "2026-10-09", currencies: 12, source: "live", carried: 0, missing: 0 });
});

describe("refreshFxRatesNow", () => {
  it("refuses a signed-out visitor, a pending MFA step-up and the demo account", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    expect(await refreshFxRatesNow()).toEqual({ ok: false, error: "fxr_err_signed_out" });
    mocks.needsMfa.mockResolvedValueOnce(true);
    expect(await refreshFxRatesNow()).toEqual({ ok: false, error: "fxr_err_mfa" });
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: DEMO_USER_ID } } });
    expect(await refreshFxRatesNow()).toEqual({ ok: false, error: "fxr_err_demo" });
    expect(mocks.runRefresh).not.toHaveBeenCalled();
  });

  it("runs a manual refresh and revalidates", async () => {
    const r = await refreshFxRatesNow();
    expect(r).toEqual({ ok: true, currencies: 12, source: "live" });
    expect(mocks.runRefresh).toHaveBeenCalledWith(expect.anything(), "manual");
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("is rate limited to one run per 60 s", async () => {
    mocks.limit.mockResolvedValue({ data: [{ ran_at: new Date(Date.now() - 20_000).toISOString() }], error: null });
    expect(await refreshFxRatesNow()).toEqual({ ok: false, error: "fxr_err_rate_limited" });
    expect(mocks.runRefresh).not.toHaveBeenCalled();
    mocks.limit.mockResolvedValue({ data: [{ ran_at: new Date(Date.now() - 90_000).toISOString() }], error: null });
    expect((await refreshFxRatesNow()).ok).toBe(true);
  });

  it("reports unavailable when the service key is missing or the table does not exist", async () => {
    mocks.service.mockImplementationOnce(() => {
      throw new Error("no key");
    });
    expect(await refreshFxRatesNow()).toEqual({ ok: false, error: "fxr_err_unavailable" });
    mocks.limit.mockResolvedValueOnce({ data: null, error: { code: "42P01", message: "x" } });
    expect(await refreshFxRatesNow()).toEqual({ ok: false, error: "fxr_err_unavailable" });
  });

  it("maps a failed run to a generic error", async () => {
    mocks.runRefresh.mockResolvedValueOnce({ ok: false, errorCode: "write_failed", date: "2026-10-09" });
    expect(await refreshFxRatesNow()).toEqual({ ok: false, error: "fxr_err_failed" });
  });
});
