import { describe, expect, it, vi } from "vitest";
import {
  buildQuoteUpdate,
  lastPricedDate,
  parseQuoteResponse,
  persistQuoteWith,
  runPriceRefresh,
  selectAndOrder,
  upsertHistoryRowsWithFallback,
  type CronAsset,
  type CronDeps,
  type LiveQuote,
} from "./cron-refresh";
import { DEMO_USER_ID } from "@/lib/demo-mode";

const TODAY = "2026-10-09";

function asset(over: Partial<CronAsset> & { id: string }): CronAsset {
  return {
    profile_id: "user-1",
    quantity: 10,
    currency: "USD",
    metadata: {},
    kind: "equity",
    ticker: "AAA",
    coingeckoId: null,
    ...over,
  };
}

const quote = (over: Partial<LiveQuote> = {}): LiveQuote => ({
  unitPrice: 5,
  currency: "USD",
  asOf: `${TODAY}T05:00:00.000Z`,
  source: "finnhub",
  ...over,
});

function deps(over: Partial<CronDeps> = {}): CronDeps {
  let t = 0;
  return {
    fetchQuote: async () => ({ ok: true, quote: quote() }),
    persist: async () => ({}),
    getRates: async () => ({ USD: 1, EUR: 0.5 }),
    sleep: async () => {
      t += 1;
    },
    now: () => t,
    ...over,
  };
}

describe("selectAndOrder", () => {
  it("skips priced-today, demo, zero-quantity and ticker-less assets, oldest first", () => {
    const out = selectAndOrder(
      [
        asset({ id: "today", metadata: { last_priced_at: `${TODAY}T01:00:00Z` } }),
        asset({ id: "demo", profile_id: DEMO_USER_ID }),
        asset({ id: "zero", quantity: 0 }),
        asset({ id: "noticker", ticker: " " }),
        asset({ id: "nocg", kind: "crypto", ticker: null, coingeckoId: null }),
        asset({ id: "recent", metadata: { last_priced_at: "2026-10-08T00:00:00Z" } }),
        asset({ id: "never", metadata: {} }),
        asset({ id: "old", kind: "crypto", ticker: null, coingeckoId: "bitcoin", metadata: { last_priced_at: "2026-09-30T00:00:00Z" } }),
      ],
      TODAY,
    );
    expect(out.map((a) => a.id)).toEqual(["never", "old", "recent"]);
  });

  it("reads last_priced_at defensively", () => {
    expect(lastPricedDate(null)).toBe("");
    expect(lastPricedDate([] as never)).toBe("");
    expect(lastPricedDate({ last_priced_at: 5 } as never)).toBe("");
  });
});

describe("buildQuoteUpdate", () => {
  it("converts to the asset currency and writes the metadata the buttons write", () => {
    const u = buildQuoteUpdate(
      { id: "a", quantity: 4, currency: "EUR", metadata: { keep: "me" } },
      quote({ unitPrice: 10, openPrice: 8, previousClose: 9, dayChangePct: 1.5, exchange: "NASDAQ NMS - GLOBAL MARKET" }),
      { USD: 1, EUR: 0.5 },
    );
    expect(u.unitPrice).toBe(5);
    expect(u.totalValue).toBe(20);
    expect(u.nextMetadata).toMatchObject({
      keep: "me",
      last_unit_price: 5,
      open_price: 4,
      previous_close: 4.5,
      day_change_pct: 1.5,
      last_price_source: "finnhub",
      exchange: "NASDAQ",
    });
    expect(u.historyRow).toEqual({
      asset_id: "a",
      recorded_date: TODAY,
      value: 20,
      net_equity: 20,
      source: "finnhub",
    });
  });
});

describe("parseQuoteResponse", () => {
  it("maps in-body errors, transport errors and bad payloads", async () => {
    expect(await parseQuoteResponse({ data: { error: { code: "no_data", message: "x" } }, error: null }, "USD", "finnhub")).toEqual({
      ok: false,
      code: "no_data",
      error: "x",
    });
    const ctx = { context: { json: async () => ({ error: { code: "invalid_api_key", message: "bad" } }) }, message: "m" };
    expect(await parseQuoteResponse({ data: null, error: ctx }, "USD", "finnhub")).toMatchObject({ code: "invalid_api_key" });
    expect(await parseQuoteResponse({ data: { unitPrice: 0 }, error: null }, "USD", "finnhub")).toMatchObject({ code: "invalid_response" });
    const ok = await parseQuoteResponse({ data: { unitPrice: 2, currency: "eur" }, error: null }, "USD", "coingecko");
    expect(ok).toMatchObject({ ok: true, quote: { unitPrice: 2, currency: "EUR", source: "coingecko" } });
  });
});

describe("upsertHistoryRowsWithFallback", () => {
  it("retries as manual on a CHECK violation", async () => {
    const calls: string[] = [];
    const supabase = {
      from: () => ({
        upsert: async (rows: { source: string }[]) => {
          calls.push(rows[0].source);
          return { error: rows[0].source === "yahoo" ? { code: "23514", message: "check" } : null };
        },
      }),
    };
    const err = await upsertHistoryRowsWithFallback(supabase as never, [
      { asset_id: "a", recorded_date: TODAY, value: 1, net_equity: 1, source: "yahoo" },
    ]);
    expect(err).toBeNull();
    expect(calls).toEqual(["yahoo", "manual"]);
  });
});

describe("persistQuoteWith", () => {
  it("does not write history when the asset update fails", async () => {
    const upsert = vi.fn();
    const supabase = {
      from: (t: string) =>
        t === "assets"
          ? { update: () => ({ eq: () => ({ eq: async () => ({ error: { message: "boom" } }) }) }) }
          : { upsert },
    };
    const r = await persistQuoteWith(supabase as never, "u", { id: "a", quantity: 1, currency: "USD", metadata: null }, quote(), {});
    expect(r).toEqual({ error: "boom" });
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("runPriceRefresh", () => {
  it("counts refreshed / skipped / failed and never persists a failed quote", async () => {
    const persist = vi.fn(async () => ({}));
    const outcomes: Record<string, "ok" | "no_data" | "timeout"> = { a: "ok", b: "no_data", c: "timeout" };
    const s = await runPriceRefresh(
      [asset({ id: "a" }), asset({ id: "b" }), asset({ id: "c" })],
      { today: TODAY, budgetMs: 1e9 },
      deps({
        persist,
        fetchQuote: async (x) =>
          outcomes[x.id] === "ok"
            ? { ok: true, quote: quote() }
            : { ok: false, code: outcomes[x.id], error: "e" },
      }),
    );
    expect(s).toEqual({ refreshed: 1, skipped: 1, failed: 1, stopped_early: 0 });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("stops calling Finnhub after an invalid key but still prices crypto", async () => {
    const fetchQuote = vi.fn(async (x: CronAsset) =>
      x.kind === "equity"
        ? ({ ok: false, code: "invalid_api_key", error: "e" } as const)
        : ({ ok: true, quote: quote({ source: "coingecko" }) } as const),
    );
    const s = await runPriceRefresh(
      [
        asset({ id: "e1" }),
        asset({ id: "e2" }),
        asset({ id: "c1", kind: "crypto", ticker: null, coingeckoId: "bitcoin" }),
      ],
      { today: TODAY, budgetMs: 1e9 },
      deps({ fetchQuote }),
    );
    expect(fetchQuote).toHaveBeenCalledTimes(2);
    expect(s).toEqual({ refreshed: 1, skipped: 0, failed: 1, stopped_early: 1 });
  });

  it("stops cleanly when the time budget is spent", async () => {
    let t = 0;
    const s = await runPriceRefresh(
      [asset({ id: "a" }), asset({ id: "b" }), asset({ id: "c" })],
      { today: TODAY, budgetMs: 2, equityPauseMs: 1 },
      deps({
        now: () => t,
        sleep: async () => {
          t += 1;
        },
      }),
    );
    expect(s).toEqual({ refreshed: 2, skipped: 0, failed: 0, stopped_early: 1 });
  });

  it("fetches FX rates once and only when needed, and survives a throwing fetch", async () => {
    const getRates = vi.fn(async () => ({ USD: 1, EUR: 0.5 }));
    const s = await runPriceRefresh(
      [asset({ id: "a", currency: "EUR" }), asset({ id: "b", currency: "EUR" }), asset({ id: "c" })],
      { today: TODAY, budgetMs: 1e9 },
      deps({
        getRates,
        fetchQuote: async (x) => {
          if (x.id === "c") throw new Error("net");
          return { ok: true, quote: quote() };
        },
      }),
    );
    expect(getRates).toHaveBeenCalledTimes(1);
    expect(s).toEqual({ refreshed: 2, skipped: 0, failed: 1, stopped_early: 0 });
  });
});
