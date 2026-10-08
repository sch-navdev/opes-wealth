/**
 * setEntityHeldAssets against the in-memory Supabase fake (src/test/fake-supabase.ts). The fake has no
 * RLS and ignores the selected columns / joins, so asset rows are seeded with their `asset_categories`
 * object already attached. Invented fixtures only.
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

import { setEntityHeldAssets } from "@/app/dashboard/companies/actions";

const ME = "user-me";
const OTHER = "user-other";
let db: FakeDb;

const asset = (id: string, profile_id: string, category: string, over: Record<string, unknown> = {}) => ({
  id,
  profile_id,
  name: `Asset ${id}`,
  status: "active",
  current_value: 100,
  metadata: {},
  asset_categories: { name: category },
  ...over,
});

const stored = (id: string) => db.table("assets").find((r) => r.id === id)!.metadata as Record<string, unknown>;

function seedPortfolio(owner = ME) {
  db.seed("assets", [
    asset("trust", owner, "Companies", { metadata: { entity_type: "trust", ownership_percentage: 100, legal_name: "Family Trust", held_asset_ids: ["old"] } }),
    asset("villa", owner, "Real Estate"),
    asset("loan", owner, "Liabilities", { is_liability: true }),
    asset("opco", owner, "Companies"),
    asset("sold", owner, "Cash", { status: "sold" }),
    asset("theirs", OTHER, "Cash"),
    asset("sharedBoat", OTHER, "Exotic Assets"),
  ]);
  db.seed("asset_owners", [
    { asset_id: "sharedBoat", profile_id: OTHER, ownership_percentage: 50, is_creator: true },
    { asset_id: "sharedBoat", profile_id: owner, ownership_percentage: 50, is_creator: false },
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

describe("setEntityHeldAssets", () => {
  it("requires a signed-in user", async () => {
    seedPortfolio();
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await setEntityHeldAssets("trust", ["villa"])).toEqual({ ok: false, error: "ent_err_signed_out" });
    expect(stored("trust").held_asset_ids).toEqual(["old"]);
  });

  it("blocks a session that still needs the MFA step-up", async () => {
    seedPortfolio();
    mocks.needsMfaStepUp.mockResolvedValue(true);
    expect(await setEntityHeldAssets("trust", ["villa"])).toEqual({ ok: false, error: "ent_err_mfa" });
    expect(stored("trust").held_asset_ids).toEqual(["old"]);
  });

  it("stores only visible non-Company assets, keeps every other metadata key and revalidates the page", async () => {
    seedPortfolio();
    const r = await setEntityHeldAssets("trust", [
      "villa",
      "loan",
      "sharedBoat", // co-owned with me: visible
      "villa", // duplicate
      "opco", // a Company: nesting uses holding_company_id
      "trust", // the entity itself
      "theirs", // someone else's, not shared
      "sold", // not active
      "nope", // does not exist
      "  ",
    ]);
    expect(r).toEqual({ ok: true, heldAssetIds: ["villa", "loan", "sharedBoat"], skipped: 5 });
    expect(stored("trust")).toEqual({
      entity_type: "trust",
      ownership_percentage: 100,
      legal_name: "Family Trust",
      held_asset_ids: ["villa", "loan", "sharedBoat"],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/companies");
    // nothing else was touched
    expect(stored("villa")).toEqual({});
    expect(db.table("assets").find((r) => r.id === "trust")!.current_value).toBe(100);
  });

  it("an empty list clears the links", async () => {
    seedPortfolio();
    expect(await setEntityHeldAssets("trust", [])).toEqual({ ok: true, heldAssetIds: [], skipped: 0 });
    expect(stored("trust").held_asset_ids).toEqual([]);
    expect(stored("trust").legal_name).toBe("Family Trust");
  });

  it("starts from an empty object when the stored metadata is missing or not an object", async () => {
    db.seed("assets", [asset("e", ME, "Companies", { metadata: null }), asset("c", ME, "Cash")]);
    expect(await setEntityHeldAssets("e", ["c"])).toMatchObject({ ok: true });
    expect(stored("e")).toEqual({ held_asset_ids: ["c"] });
  });

  it("refuses an entity the caller does not own, even if it is shared with them", async () => {
    seedPortfolio(OTHER);
    db.seed("asset_owners", [
      { asset_id: "trust", profile_id: OTHER, ownership_percentage: 50, is_creator: true },
      { asset_id: "trust", profile_id: ME, ownership_percentage: 50, is_creator: false },
    ]);
    expect(await setEntityHeldAssets("trust", ["villa"])).toEqual({ ok: false, error: "ent_err_not_found" });
    expect(stored("trust").held_asset_ids).toEqual(["old"]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a non-Company asset or an inactive entity as the entity", async () => {
    seedPortfolio();
    db.seed("assets", [asset("oldco", ME, "Companies", { status: "sold" })]);
    expect(await setEntityHeldAssets("villa", ["loan"])).toEqual({ ok: false, error: "ent_err_not_found" });
    expect(await setEntityHeldAssets("oldco", ["loan"])).toEqual({ ok: false, error: "ent_err_not_found" });
    expect(await setEntityHeldAssets("missing", ["loan"])).toEqual({ ok: false, error: "ent_err_not_found" });
    expect(stored("villa")).toEqual({});
  });

  it("v1: refuses a co-owned entity instead of bypassing the approval flow (registered or invited co-owner)", async () => {
    seedPortfolio();
    db.seed("asset_owners", [
      { asset_id: "trust", profile_id: ME, ownership_percentage: 60, is_creator: true },
      { asset_id: "trust", profile_id: OTHER, ownership_percentage: 40, is_creator: false },
    ]);
    expect(await setEntityHeldAssets("trust", ["villa"])).toEqual({ ok: false, error: "ent_err_co_owned" });
    expect(stored("trust").held_asset_ids).toEqual(["old"]);

    db.tables.asset_owners = db.table("asset_owners").filter((r) => r.asset_id !== "trust");
    db.seed("asset_owners", [
      { asset_id: "trust", profile_id: ME, ownership_percentage: 60, is_creator: true },
      { asset_id: "trust", profile_id: null, email: "invitee@example.test", ownership_percentage: 40, is_creator: false },
    ]);
    expect(await setEntityHeldAssets("trust", ["villa"])).toEqual({ ok: false, error: "ent_err_co_owned" });
  });

  it("an owner list holding only the caller is not co-ownership", async () => {
    seedPortfolio();
    db.seed("asset_owners", [{ asset_id: "trust", profile_id: ME, ownership_percentage: 100, is_creator: true }]);
    expect(await setEntityHeldAssets("trust", ["villa"])).toMatchObject({ ok: true, heldAssetIds: ["villa"] });
  });

  it("works before the co-ownership migration (asset_owners missing): own assets only", async () => {
    seedPortfolio();
    db.missingTables.add("asset_owners");
    expect(await setEntityHeldAssets("trust", ["villa", "sharedBoat"])).toEqual({ ok: true, heldAssetIds: ["villa"], skipped: 1 });
  });

  it("demo account: validates but never writes, and reports success", async () => {
    db.seed("assets", [
      asset("trust", DEMO_USER_ID, "Companies", { metadata: { held_asset_ids: ["old"] } }),
      asset("villa", DEMO_USER_ID, "Real Estate"),
    ]);
    mocks.getUser.mockResolvedValue({ data: { user: { id: DEMO_USER_ID } } });
    expect(await setEntityHeldAssets("trust", ["villa"])).toEqual({ ok: true, heldAssetIds: ["villa"], skipped: 0 });
    expect(stored("trust").held_asset_ids).toEqual(["old"]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("dev mock auth: uses the mock admin client, skips the MFA check and scopes to the mock user", async () => {
    seedPortfolio();
    mocks.isMockAuthEnabled.mockReturnValue(true);
    mocks.getMockUserId.mockReturnValue(ME);
    mocks.createMockAdminClient.mockImplementation(() => db.client());
    mocks.needsMfaStepUp.mockResolvedValue(true);
    expect(await setEntityHeldAssets("trust", ["villa"])).toMatchObject({ ok: true, heldAssetIds: ["villa"] });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.needsMfaStepUp).not.toHaveBeenCalled();
    expect(stored("trust").held_asset_ids).toEqual(["villa"]);
  });

  it("rejects malformed input", async () => {
    seedPortfolio();
    expect(await setEntityHeldAssets("", ["villa"])).toEqual({ ok: false, error: "ent_err_invalid" });
    expect(await setEntityHeldAssets("trust", "villa" as unknown as string[])).toEqual({ ok: false, error: "ent_err_invalid" });
    expect(await setEntityHeldAssets(42 as unknown as string, ["villa"])).toEqual({ ok: false, error: "ent_err_invalid" });
    expect(await setEntityHeldAssets("trust", Array.from({ length: 1001 }, (_, i) => `id${i}`))).toEqual({
      ok: false,
      error: "ent_err_invalid",
    });
    // non-string entries are simply dropped
    expect(await setEntityHeldAssets("trust", [7, null, "villa"] as unknown as string[])).toMatchObject({
      ok: true,
      heldAssetIds: ["villa"],
    });
    expect(stored("trust").held_asset_ids).toEqual(["villa"]);
  });

  it("returns an error (never throws) when the database fails", async () => {
    seedPortfolio();
    db.throwingTables.add("assets");
    expect(await setEntityHeldAssets("trust", ["villa"])).toEqual({ ok: false, error: "ent_err_save_failed" });
  });
});
