import { describe, expect, it, vi } from "vitest";
import { runFxRefresh } from "@/lib/fx-rates-refresh";

function fakeDb(opts: { recent?: { currency: string; rate_per_usd: number }[]; readError?: unknown; writeError?: unknown } = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: opts.writeError ?? null });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const limit = vi.fn().mockResolvedValue({ data: opts.recent ?? [], error: opts.readError ?? null });
  const db = {
    from: (table: string) =>
      table === "fx_rates_daily" ? { select: () => ({ order: () => ({ limit }) }), upsert } : { insert },
  };
  return { db: db as never, upsert, insert };
}

const now = () => new Date("2026-10-08T20:00:05Z"); // midnight GST of 9 Oct

describe("runFxRefresh", () => {
  it("upserts the GST day for all currencies and logs an ok run (counts only)", async () => {
    const { db, upsert, insert } = fakeDb();
    const live = { EUR: 0.9, GBP: 0.79, AED: 3.67, CHF: 0.88, JPY: 150, CAD: 1.36, AUD: 1.5, SGD: 1.3 };
    const r = await runFxRefresh(db, "cron", { fetchLive: async () => live, now });
    expect(r).toMatchObject({ ok: true, date: "2026-10-09", source: "live", missing: 0 });
    const rows = upsert.mock.calls[0][0] as { rate_date: string; currency: string; source: string }[];
    expect(rows.every((x) => x.rate_date === "2026-10-09")).toBe(true);
    expect(rows.find((x) => x.currency === "AED")?.source).toBe("peg");
    expect(rows.find((x) => x.currency === "EUR")?.source).toBe("live");
    expect(rows.some((x) => x.currency === "USD")).toBe(false);
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: "rate_date,currency" });
    expect(insert.mock.calls[0][0]).toMatchObject({ kind: "cron", ok: true, source: "live", error_code: null });
  });

  it("provider down: still writes pegs and carried rows, logs ok=false provider_failed", async () => {
    const { db, upsert, insert } = fakeDb({ recent: [{ currency: "EUR", rate_per_usd: 0.91 }] });
    const r = await runFxRefresh(db, "manual", { fetchLive: async () => null, now });
    expect(r).toMatchObject({ ok: true, source: "fallback" });
    const rows = upsert.mock.calls[0][0] as { currency: string; source: string }[];
    expect(rows.find((x) => x.currency === "EUR")?.source).toBe("carried");
    expect(insert.mock.calls[0][0]).toMatchObject({ kind: "manual", ok: false, error_code: "provider_failed" });
  });

  it("reports a missing table without writing anything", async () => {
    const { db, upsert, insert } = fakeDb({ readError: { code: "42P01", message: "x" } });
    const r = await runFxRefresh(db, "cron", { fetchLive: async () => ({}), now });
    expect(r).toEqual({ ok: false, errorCode: "table_missing", date: "2026-10-09" });
    expect(upsert).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("a failed write is logged and reported", async () => {
    const { db, insert } = fakeDb({ writeError: { code: "XX000", message: "boom" } });
    const r = await runFxRefresh(db, "cron", { fetchLive: async () => ({ EUR: 0.9 }), now });
    expect(r).toMatchObject({ ok: false, errorCode: "write_failed" });
    expect(insert.mock.calls[0][0]).toMatchObject({ ok: false, error_code: "write_failed", currencies: 0 });
  });
});
