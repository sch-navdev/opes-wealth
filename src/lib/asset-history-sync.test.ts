import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncAssetHistory } from "@/lib/asset-history-sync";
import { estimateOffplanValueAt } from "@/lib/real-estate-analytics";
import type { Json } from "@/types/supabase";

type Row = { asset_id: string; recorded_date: string; value: number; net_equity: number; source: string };
type UpsertCall = { table: string; rows: Row[]; options: unknown };

function fakeSupabase() {
  const calls: UpsertCall[] = [];
  const client = {
    from: (table: string) => ({
      upsert: (rows: Row[], options: unknown) => {
        calls.push({ table, rows, options });
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

const run = async (
  currentValue: number,
  category: string | null | undefined,
  metadata: unknown,
  explicitDate?: string,
) => {
  const { client, calls } = fakeSupabase();
  await syncAssetHistory(client, "asset-1", currentValue, category, metadata as Json, explicitDate);
  return calls;
};

const byDate = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.recorded_date, r]));

describe("syncAssetHistory — generic categories", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-03-15T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("writes one snapshot row, upserting on (asset_id, recorded_date)", async () => {
    const calls = await run(500, "Cash", {});
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("asset_history");
    expect(calls[0].options).toEqual({ onConflict: "asset_id,recorded_date" });
    expect(calls[0].rows).toEqual([
      { asset_id: "asset-1", recorded_date: "2025-03-15", value: 500, net_equity: 500, source: "manual" },
    ]);
  });

  it("uses the explicit purchase date for the snapshot when given", async () => {
    const [call] = await run(500, "Vehicles", {}, "2023-02-28");
    expect(call.rows[0].recorded_date).toBe("2023-02-28");
  });

  it("falls back to today for an empty explicit date and a missing category", async () => {
    const [call] = await run(10, undefined, null, "");
    expect(call.rows).toHaveLength(1);
    expect(call.rows[0].recorded_date).toBe("2025-03-15");
    const [call2] = await run(10, null, {});
    expect(call2.rows[0].net_equity).toBe(10);
  });

  it("handles a leap-day snapshot date", async () => {
    const [call] = await run(1, "Cash", {}, "2024-02-29");
    expect(call.rows[0].recorded_date).toBe("2024-02-29");
  });

  it("records a zero-value asset (no divide/skip problems)", async () => {
    const [call] = await run(0, "Cash", {});
    expect(call.rows[0]).toMatchObject({ value: 0, net_equity: 0 });
  });
});

describe("syncAssetHistory — Private Equity", () => {
  it("net equity is NAV minus pending capital calls (paid calls don't reduce it)", async () => {
    const [call] = await run(
      1000,
      "Private Equity",
      {
        capital_calls: [
          { id: "1", due_date: "2025-01-01", amount: 100, percentage: 10, status: "pending" },
          { id: "2", due_date: "2025-02-01", amount: 50, percentage: 5, status: "pending" },
          { id: "3", due_date: "2024-01-01", amount: 400, percentage: 40, status: "paid" },
        ],
      },
      "2025-03-01",
    );
    expect(call.rows).toEqual([
      { asset_id: "asset-1", recorded_date: "2025-03-01", value: 1000, net_equity: 850, source: "manual" },
    ]);
  });

  it("ignores pending calls when the fund opts out of the liability", async () => {
    const [call] = await run(
      1000,
      "Private Equity",
      { count_unfunded_as_liability: false, capital_calls: [{ id: "1", due_date: "2025-01-01", amount: 100, percentage: 10, status: "pending" }] },
      "2025-03-01",
    );
    expect(call.rows[0].net_equity).toBe(1000);
  });

  it("with no metadata, net equity equals NAV", async () => {
    const [call] = await run(1000, "Private Equity", null, "2025-03-01");
    expect(call.rows[0]).toMatchObject({ value: 1000, net_equity: 1000 });
  });
});

describe("syncAssetHistory — Real Estate, ready-built", () => {
  const schedule = [
    { id: "a", milestone: "Down payment", due_date: "2024-01-10", amount: 100_000, percentage: 20, status: "paid" },
    { id: "b", milestone: "Second", due_date: "2024-06-10", amount: 50_000, percentage: 10, status: "paid" },
    { id: "c", milestone: "Third", due_date: "2024-12-10", amount: 25_000, percentage: 5, status: "pending" },
    { id: "d", milestone: "No date", due_date: "", amount: 1, percentage: 0, status: "paid" },
  ];

  it("logs cumulative cash invested (paid milestones + fees) for value and equity, then the snapshot", async () => {
    const [call] = await run(
      700_000,
      "Real Estate",
      { payment_schedule: schedule, agencyFees: 5_000, registration_fee_amount: 1_000, market_valuation: 800_000 },
      "2025-02-01",
    );
    const rows = byDate(call.rows);
    expect(Object.keys(rows).sort()).toEqual(["2024-01-10", "2024-06-10", "2025-02-01"]);
    expect(rows["2024-01-10"]).toMatchObject({ value: 106_000, net_equity: 106_000 });
    expect(rows["2024-06-10"]).toMatchObject({ value: 156_000, net_equity: 156_000 });
    // snapshot: market valuation as value, the passed current value (net of the mortgage) as net equity
    expect(rows["2025-02-01"]).toMatchObject({ value: 800_000, net_equity: 700_000 });
  });

  it("a pending first milestone still anchors the start (value = amount + fees)", async () => {
    const [call] = await run(
      10,
      "Real Estate",
      {
        payment_schedule: [{ id: "a", milestone: "Down", due_date: "2024-01-10", amount: 20_000, percentage: 100, status: "pending" }],
        agencyFees: 500,
      },
      "2025-02-01",
    );
    expect(byDate(call.rows)["2024-01-10"]).toMatchObject({ value: 20_500, net_equity: 20_500 });
  });

  it("without milestones, only the snapshot is written; market value falls back to current value", async () => {
    const [call] = await run(900_000, "Real Estate", { market_valuation: null }, "2025-02-01");
    expect(call.rows).toEqual([
      { asset_id: "asset-1", recorded_date: "2025-02-01", value: 900_000, net_equity: 900_000, source: "manual" },
    ]);
  });

  it("a snapshot on a milestone's date replaces it (one row per date)", async () => {
    const [call] = await run(
      700_000,
      "Real Estate",
      { payment_schedule: [schedule[0]], market_valuation: 800_000 },
      "2024-01-10",
    );
    expect(call.rows).toHaveLength(1);
    expect(call.rows[0]).toMatchObject({ recorded_date: "2024-01-10", value: 800_000, net_equity: 700_000 });
  });

  it("tolerates garbage metadata", async () => {
    const calls = await run(5, "Real Estate", "not-an-object", "2025-02-01");
    expect(calls[0].rows).toHaveLength(1);
    expect(calls[0].rows[0]).toMatchObject({ value: 5, net_equity: 5 });
  });
});

describe("syncAssetHistory — Real Estate, off-plan", () => {
  const offplan = {
    is_offplan: true,
    contract_price: 1_000_000,
    market_valuation: 1_300_000,
    payment_schedule: [
      { id: "a", milestone: "Down payment", due_date: "2024-01-01", amount: 200_000, percentage: 20, status: "paid" },
      { id: "b", milestone: "Mid", due_date: "2024-07-01", amount: 100_000, percentage: 10, status: "paid" },
      { id: "c", milestone: "Handover", due_date: "2025-01-01", amount: 700_000, percentage: 70, status: "pending" },
    ],
  };

  it("logs estimated MARKET value (not cash paid) with equity = value minus the unpaid balance", async () => {
    const [call] = await run(450_000, "Real Estate", offplan, "2025-06-01");
    const rows = byDate(call.rows);

    // start: contract price; owed = 1,000,000 - 200,000
    expect(rows["2024-01-01"]).toMatchObject({ value: 1_000_000, net_equity: 200_000 });

    const midValue = estimateOffplanValueAt({
      contractPrice: 1_000_000,
      startDate: "2024-01-01",
      currentMarketValue: 1_300_000,
      snapshotDate: "2025-06-01",
      date: "2024-07-01",
    });
    expect(rows["2024-07-01"].value).toBeCloseTo(midValue, 6);
    expect(midValue).toBeGreaterThan(1_000_000);
    expect(midValue).toBeLessThan(1_300_000);
    // cumulative paid 300,000 -> still owes 700,000
    expect(rows["2024-07-01"].net_equity).toBeCloseTo(midValue - 700_000, 6);

    // pending milestones (not first) get no row; snapshot is market value / given net equity
    expect(rows["2025-01-01"]).toBeUndefined();
    expect(rows["2025-06-01"]).toMatchObject({ value: 1_300_000, net_equity: 450_000 });
  });

  it("never lets owed go negative when more than the contract price is paid", async () => {
    const [call] = await run(
      1,
      "Real Estate",
      {
        ...offplan,
        contract_price: 100,
        market_valuation: 100,
        payment_schedule: [{ ...offplan.payment_schedule[0], amount: 500 }],
      },
      "2025-06-01",
    );
    // value 100, paid 500 > price: owed clamps to 0, equity = value
    expect(byDate(call.rows)["2024-01-01"]).toMatchObject({ value: 100, net_equity: 100 });
  });

  it("a pending down payment counts as paid for the first point's equity", async () => {
    const [call] = await run(
      1,
      "Real Estate",
      {
        ...offplan,
        payment_schedule: [{ ...offplan.payment_schedule[0], status: "pending" }],
      },
      "2025-06-01",
    );
    expect(byDate(call.rows)["2024-01-01"]).toMatchObject({ value: 1_000_000, net_equity: 200_000 });
  });

  it("uses purchasePrice, then market valuation, when contract_price is absent", async () => {
    const [withPurchase] = await run(
      1,
      "Real Estate",
      { ...offplan, contract_price: null, purchasePrice: 900_000 },
      "2025-06-01",
    );
    expect(byDate(withPurchase.rows)["2024-01-01"].value).toBe(900_000);
    const [none] = await run(1, "Real Estate", { ...offplan, contract_price: null }, "2025-06-01");
    expect(byDate(none.rows)["2024-01-01"].value).toBe(1_300_000);
  });
});
