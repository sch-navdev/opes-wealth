/**
 * updateAsset keeps stored metadata when the form sends none, and keeps an imported bank account's
 * quantity / value / currency (they come from statements). Invented fixtures; routeAssetEdit and the
 * side effects are mocked, the assets table is the in-memory fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "@/test/fake-supabase";

const mocks = vi.hoisted(() => ({
  db: null as unknown as { client: () => Record<string, unknown> },
  getUser: vi.fn(),
  routeAssetEdit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ ...mocks.db.client(), auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/asset-history-sync", () => ({ syncAssetHistory: vi.fn(async () => undefined) }));
vi.mock("@/lib/asset-photos-server", () => ({ removeAssetPhotos: vi.fn(async () => undefined) }));
vi.mock("@/lib/shared-assets/server", () => ({
  parseOwnersField: () => null,
  replaceOwners: vi.fn(async () => ({ ok: true })),
  routeAssetEdit: mocks.routeAssetEdit,
}));

import { updateAsset } from "@/app/dashboard/actions";

const ME = "user-me";
let db: FakeDb;

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const base = { name: "Main account", category_id: "cat-cash", quantity: "1", current_value: "999", currency: "USD", purchase_date: "2026-01-01" };

beforeEach(() => {
  db = new FakeDb();
  mocks.db = db;
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: ME } } });
  mocks.routeAssetEdit.mockReset().mockResolvedValue({ mode: "direct" });
});

describe("updateAsset metadata and imported bank accounts", () => {
  it("keeps the stored metadata when the form sends none", async () => {
    db.seed("assets", [
      { id: "a1", profile_id: ME, name: "Main account", quantity: 1, current_value: 100, currency: "AED", images: [], metadata: { company_id: "c1", purpose: "emergency_fund" }, asset_categories: { name: "Savings" } },
    ]);
    await updateAsset("a1", form(base));
    const fields = mocks.routeAssetEdit.mock.calls[0][0].fields;
    expect(fields.metadata).toEqual({ company_id: "c1", purpose: "emergency_fund" });
  });

  it("uses the submitted metadata when the form sends some", async () => {
    db.seed("assets", [{ id: "a1", profile_id: ME, name: "X", quantity: 1, current_value: 100, currency: "AED", images: [], metadata: { old: true }, asset_categories: { name: "Equities" } }]);
    await updateAsset("a1", form({ ...base, metadata: JSON.stringify({ exchange: "NASDAQ" }) }));
    expect(mocks.routeAssetEdit.mock.calls[0][0].fields.metadata).toEqual({ exchange: "NASDAQ" });
  });

  it("locks quantity, value and currency of an imported Cash account", async () => {
    db.seed("assets", [
      { id: "a2", profile_id: ME, name: "Imported", quantity: 1, current_value: 392.12, currency: "EUR", images: [], metadata: { bank_profile: "hsbc_uae" }, asset_categories: { name: "Cash" } },
    ]);
    await updateAsset("a2", form({ ...base, quantity: "5", current_value: "1", currency: "USD" }));
    const fields = mocks.routeAssetEdit.mock.calls[0][0].fields;
    expect(fields.quantity).toBe(1);
    expect(fields.current_value).toBe(392.12);
    expect(fields.currency).toBe("EUR");
    expect(fields.metadata).toEqual({ bank_profile: "hsbc_uae" });
  });

  it("lets a manual Cash account (no bank profile) change its value", async () => {
    db.seed("assets", [{ id: "a3", profile_id: ME, name: "Manual", quantity: 1, current_value: 10, currency: "USD", images: [], metadata: {}, asset_categories: { name: "Cash" } }]);
    await updateAsset("a3", form({ ...base, current_value: "250" }));
    expect(mocks.routeAssetEdit.mock.calls[0][0].fields.current_value).toBe(250);
  });
});
