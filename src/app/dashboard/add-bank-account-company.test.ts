/**
 * addBankAccount with the optional company link (metadata.company_id), against the in-memory Supabase fake.
 * Invented fixtures only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "@/test/fake-supabase";

const mocks = vi.hoisted(() => ({
  db: null as unknown as { client: () => Record<string, unknown> },
  getUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
// The fake has no upsert (history rows): add the one method this action needs.
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => {
    const client = mocks.db.client() as { from: (name: string) => Record<string, unknown> };
    return {
      ...client,
      from: (name: string) => {
        const builder = client.from(name);
        builder.upsert = async (rows: unknown) => {
          (mocks.db as unknown as FakeDb).seed(name, (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[]);
          return { data: null, error: null };
        };
        return builder;
      },
      auth: { getUser: mocks.getUser },
    };
  },
}));

import { addBankAccount } from "@/app/dashboard/actions";

const ME = "user-me";
const OTHER = "user-other";
let db: FakeDb;

function form(fields: Record<string, string>) {
  const f = new FormData();
  f.set("institution_name", "Test Bank");
  f.set("account_type", "checking");
  f.set("name", "Operating account");
  f.set("current_value", "1000");
  f.set("currency", "USD");
  f.set("purchase_date", "2026-10-01");
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const insertedAccounts = () => db.table("assets").filter((r) => r.name === "Operating account");

beforeEach(() => {
  for (const m of Object.values(mocks)) if (typeof m === "function" && "mockReset" in m) m.mockReset();
  db = new FakeDb();
  mocks.db = db as unknown as typeof mocks.db;
  mocks.getUser.mockResolvedValue({ data: { user: { id: ME } } });
  db.seed("asset_categories", [
    { id: "cat-cash", name: "Cash" },
    { id: "cat-liab", name: "Liabilities" },
    { id: "cat-co", name: "Companies" },
  ]);
  db.seed("assets", [
    { id: "co", profile_id: ME, name: "My Co", status: "active", is_liability: false, metadata: {}, asset_categories: { name: "Companies" } },
    { id: "theirs", profile_id: OTHER, name: "Their Co", status: "active", is_liability: false, metadata: {}, asset_categories: { name: "Companies" } },
    { id: "eq", profile_id: ME, name: "Shares", status: "active", is_liability: false, metadata: {}, asset_categories: { name: "Equities" } },
  ]);
});

describe("addBankAccount with a company", () => {
  it("stores company_id on the new Cash account", async () => {
    expect(await addBankAccount(form({ company_id: "co" }))).toBeUndefined();
    const [account] = insertedAccounts();
    expect(account.category_id).toBe("cat-cash");
    expect(account.is_liability).toBe(false);
    expect((account.metadata as Record<string, unknown>).company_id).toBe("co");
    expect((account.metadata as Record<string, unknown>).institution_name).toBe("Test Bank");
  });

  it("without a company the metadata has no company_id (a personal account)", async () => {
    expect(await addBankAccount(form({}))).toBeUndefined();
    expect(insertedAccounts()[0].metadata as Record<string, unknown>).not.toHaveProperty("company_id");
  });

  it("refuses a company that is not the caller's own Company asset and creates nothing", async () => {
    for (const company_id of ["theirs", "eq", "nope"]) {
      expect(await addBankAccount(form({ company_id }))).toEqual({ error: "Choose one of your companies." });
    }
    expect(insertedAccounts()).toHaveLength(0);
  });

  it("a credit card is a liability and never takes a company link", async () => {
    expect(await addBankAccount(form({ account_type: "credit_card", company_id: "co" }))).toBeUndefined();
    const [card] = insertedAccounts();
    expect(card.is_liability).toBe(true);
    expect(card.metadata as Record<string, unknown>).not.toHaveProperty("company_id");
  });
});
