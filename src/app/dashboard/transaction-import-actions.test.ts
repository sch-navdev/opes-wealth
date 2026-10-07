import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { fingerprint: string };

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  asset: vi.fn(),
  /** What the `transactions` select returns for one chunk: receives the chunk, returns { data, error }. */
  selectTransactions: vi.fn(),
  upsert: vi.fn(),
  inCalls: [] as string[][],
  eqCalls: [] as [string, unknown][],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === "assets") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          single: async () => ({ data: mocks.asset() }),
        };
        return chain;
      }
      return {
        select: () => {
          const chain = {
            eq: (col: string, val: unknown) => {
              mocks.eqCalls.push([col, val]);
              return chain;
            },
            in: async (_col: string, values: string[]) => {
              mocks.inCalls.push(values);
              return mocks.selectTransactions(values);
            },
          };
          return chain;
        },
        upsert: (rows: unknown[], opts: unknown) => ({
          select: async () => mocks.upsert(rows, opts),
        }),
      };
    },
  }),
}));

import { checkExistingTransactions, importBankTransactions } from "@/app/dashboard/transaction-import-actions";
import { fingerprintTransactions } from "@/lib/transactions";

const A = { date: "2026-02-02", amount: -40, description: "CSV SHOP" };
const B = { date: "2026-02-03", amount: 500, description: "CSV SALARY" };
const fp = (txs: { date: string; amount: number; description?: string; occurrence?: number }[], currency = "AED") =>
  fingerprintTransactions(txs, currency).map((t) => t.fingerprint);

beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
  mocks.asset.mockReset().mockReturnValue({ id: "a1", currency: "AED" });
  mocks.selectTransactions.mockReset().mockResolvedValue({ data: [], error: null });
  mocks.upsert.mockReset().mockImplementation(async (rows: unknown[]) => ({ data: rows.map(() => ({ id: "x" })), error: null }));
  mocks.inCalls.length = 0;
  mocks.eqCalls.length = 0;
});

describe("checkExistingTransactions", () => {
  it("requires a signed-in user and touches nothing otherwise", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const r = await checkExistingTransactions("a1", [A]);
    expect(r).toEqual({ error: "You must be signed in to check transactions." });
    expect(mocks.selectTransactions).not.toHaveBeenCalled();
  });

  it("returns an error when the asset is not the user's", async () => {
    mocks.asset.mockReturnValue(null);
    expect(await checkExistingTransactions("other", [A])).toEqual({ error: "Asset not found." });
    expect(mocks.selectTransactions).not.toHaveBeenCalled();
  });

  it("returns an empty result for no input without querying", async () => {
    expect(await checkExistingTransactions("a1", [])).toEqual({ success: true, existing: [] });
    expect(mocks.selectTransactions).not.toHaveBeenCalled();
  });

  it("flags per input index the rows whose fingerprint is stored, scoped to the profile", async () => {
    const [fa] = fp([A]);
    mocks.selectTransactions.mockResolvedValue({ data: [{ fingerprint: fa } as Row], error: null });
    const r = await checkExistingTransactions("a1", [A, B]);
    expect(r).toEqual({ success: true, existing: [true, false] });
    expect(mocks.eqCalls).toContainEqual(["profile_id", "u1"]);
    expect(mocks.inCalls[0]).toEqual(fp([A, B]));
  });

  it("uses the same fingerprints as the import, including the occurrence number of identical rows", async () => {
    const [first, second] = fp([A, A]);
    expect(first).not.toBe(second);
    // Only the second identical row is stored.
    mocks.selectTransactions.mockResolvedValue({ data: [{ fingerprint: second }], error: null });
    const r = await checkExistingTransactions("a1", [A, A]);
    expect(r).toEqual({ success: true, existing: [false, true] });

    // And the import hashes the very same values.
    await importBankTransactions("a1", [A, A]);
    const sentRows = mocks.upsert.mock.calls[0][0] as { fingerprint: string }[];
    expect(sentRows.map((x) => x.fingerprint)).toEqual([first, second]);
  });

  it("uses the asset's currency for the fingerprints", async () => {
    mocks.asset.mockReturnValue({ id: "a1", currency: "EUR" });
    await checkExistingTransactions("a1", [A]);
    expect(mocks.inCalls[0]).toEqual(fp([A], "EUR"));
    expect(mocks.inCalls[0]).not.toEqual(fp([A], "AED"));
  });

  it("reports invalid rows (bad date or amount) as not existing and keeps indexes aligned", async () => {
    const [fb] = fp([B]);
    mocks.selectTransactions.mockResolvedValue({ data: [{ fingerprint: fb }], error: null });
    const bad = { date: "02/02/2026", amount: 1, description: "x" };
    const nan = { date: "2026-02-02", amount: Number.NaN, description: "y" };
    const r = await checkExistingTransactions("a1", [bad, B, nan]);
    expect(r).toEqual({ success: true, existing: [false, true, false] });
  });

  it("queries in chunks and merges the results", async () => {
    const many = Array.from({ length: 320 }, (_v, i) => ({
      date: "2026-03-01",
      amount: i + 1,
      description: `row ${i}`,
    }));
    const all = fp(many);
    mocks.selectTransactions.mockImplementation(async (values: string[]) => ({
      data: values.filter((v) => v === all[0] || v === all[319]).map((fingerprint) => ({ fingerprint })),
      error: null,
    }));
    const r = await checkExistingTransactions("a1", many);
    expect(mocks.inCalls.length).toBeGreaterThan(1);
    expect(mocks.inCalls.every((c) => c.length <= 150)).toBe(true);
    expect(mocks.inCalls.flat()).toHaveLength(320);
    if (!("success" in r)) throw new Error("expected success");
    expect(r.existing).toHaveLength(320);
    expect(r.existing.filter(Boolean)).toHaveLength(2);
    expect(r.existing[0]).toBe(true);
    expect(r.existing[319]).toBe(true);
  });

  it("returns {error} when the query fails (for example the table is missing)", async () => {
    mocks.selectTransactions.mockResolvedValue({ data: null, error: { message: "relation \"transactions\" does not exist" } });
    const r = await checkExistingTransactions("a1", [A]);
    expect(r).toEqual({ error: "relation \"transactions\" does not exist" });
  });

  it("never writes", async () => {
    await checkExistingTransactions("a1", [A, B]);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("importBankTransactions occurrence override", () => {
  it("honours an explicit occurrence so a selected subset keeps its full-file fingerprint", async () => {
    const [, second] = fp([A, A]);
    await importBankTransactions("a1", [{ ...A, occurrence: 1 }]);
    const sentRows = mocks.upsert.mock.calls[0][0] as { fingerprint: string }[];
    expect(sentRows).toHaveLength(1);
    expect(sentRows[0].fingerprint).toBe(second);
  });

  it("still numbers identical rows itself when no occurrence is given", async () => {
    await importBankTransactions("a1", [A, A]);
    const sentRows = mocks.upsert.mock.calls[0][0] as { fingerprint: string }[];
    expect(new Set(sentRows.map((r) => r.fingerprint)).size).toBe(2);
  });

  it("reports inserted and duplicate counts", async () => {
    mocks.upsert.mockResolvedValue({ data: [{ id: "1" }], error: null });
    expect(await importBankTransactions("a1", [A, B])).toEqual({ success: true, inserted: 1, duplicates: 1 });
  });
});
