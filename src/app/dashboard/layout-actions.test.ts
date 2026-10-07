import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  selectAfterUpdate: vi.fn(),
  update: vi.fn(),
  eqUpdate: vi.fn(),
  eqSelect: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
}));

import { getDashboardLayout, saveDashboardLayout } from "@/app/dashboard/layout-actions";
import { defaultLayout, withTierLayout, moveBlock, emptyLayouts } from "@/lib/dashboard-layout";

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  // select(...).eq(...).maybeSingle()
  mocks.eqSelect.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  // update(...).eq(...).select(...)
  mocks.eqUpdate.mockReturnValue({ select: mocks.selectAfterUpdate });
  mocks.update.mockReturnValue({ eq: mocks.eqUpdate });
  mocks.from.mockReturnValue({ select: () => ({ eq: mocks.eqSelect }), update: mocks.update });
});

describe("getDashboardLayout", () => {
  it("requires a signed-in user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await getDashboardLayout()).toEqual({ ok: false, error: "You must be signed in." });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns the stored layouts, normalised", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { dashboard_layout: { tiers: { expert: { order: ["export", "bogus"] } } } },
      error: null,
    });
    const r = await getDashboardLayout();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.layouts?.tiers.expert?.order[0]).toBe("export");
      expect(r.layouts?.tiers.expert?.order).not.toContain("bogus");
    }
    expect(mocks.eqSelect).toHaveBeenCalledWith("id", "u1");
  });

  it("returns null when nothing is saved or the column is missing", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { dashboard_layout: null }, error: null });
    expect(await getDashboardLayout()).toEqual({ ok: true, layouts: null });
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "42703", message: "column profiles.dashboard_layout does not exist" },
    });
    expect(await getDashboardLayout()).toEqual({ ok: true, layouts: null });
  });
});

describe("saveDashboardLayout", () => {
  const layouts = withTierLayout(emptyLayouts(), "expert", moveBlock(defaultLayout("expert"), "export", 0));

  it("requires a signed-in user and never touches the database without one", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await saveDashboardLayout(layouts)).toEqual({ ok: false, error: "You must be signed in." });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("writes the normalised layouts to the caller's own row only", async () => {
    mocks.selectAfterUpdate.mockResolvedValue({ data: [{ id: "u1" }], error: null });
    const hostile = {
      version: 99,
      evil: "x",
      tiers: { expert: { order: ["export", "nope"], hidden: ["nope"], sizes: { export: "s" } }, gold: {} },
    };
    const r = await saveDashboardLayout(hostile);
    expect(r.ok).toBe(true);
    expect(mocks.eqUpdate).toHaveBeenCalledWith("id", "u1");
    const written = mocks.update.mock.calls[0][0].dashboard_layout;
    expect(written.evil).toBeUndefined();
    expect(Object.keys(written.tiers)).toEqual(["expert"]);
    expect(written.tiers.expert.order[0]).toBe("export");
    expect(written.tiers.expert.order).not.toContain("nope");
    expect(written.tiers.expert.sizes.export).toBe("full"); // "s" is not allowed for export, so the default
  });

  it("rejects non-object input", async () => {
    for (const bad of [null, "x", 4, [1]]) {
      expect(await saveDashboardLayout(bad)).toEqual({ ok: false, error: "Invalid layout." });
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reports unavailable while migration 0035 is not applied", async () => {
    mocks.selectAfterUpdate.mockResolvedValue({
      data: null,
      error: { code: "42703", message: 'column "dashboard_layout" of relation "profiles" does not exist' },
    });
    expect(await saveDashboardLayout(layouts)).toMatchObject({ ok: false, unavailable: true });
  });

  it("reports other database errors without the unavailable flag, and a missing row", async () => {
    mocks.selectAfterUpdate.mockResolvedValue({ data: null, error: { code: "23514", message: "check violation" } });
    const r = await saveDashboardLayout(layouts);
    expect(r).toMatchObject({ ok: false, error: "check violation" });
    expect((r as { unavailable?: boolean }).unavailable).toBeFalsy();
    mocks.selectAfterUpdate.mockResolvedValue({ data: [], error: null });
    expect(await saveDashboardLayout(layouts)).toEqual({ ok: false, error: "Profile not found." });
  });
});
