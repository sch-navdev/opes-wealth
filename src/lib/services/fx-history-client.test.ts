import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFxHistoryCache,
  getHistoricalRate,
  getHistoricalRatesBatch,
} from "./fx-history-client";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

describe("fx-history-client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearFxHistoryCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.FX_MOCK_MODE;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("identity needs no fetch", async () => {
    const r = await getHistoricalRate("2026-10-02", "USD", "USD");
    expect(r).toEqual({ ok: true, rate: 1, asOf: "2026-10-02", source: "identity" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("EUR -> USD uses ECB rate and URL scheme", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ base: "EUR", date: "2026-10-02", rates: { USD: 1.1225 } }),
    );
    const r = await getHistoricalRate("2026-10-02", "EUR", "USD");
    expect(r).toEqual({ ok: true, rate: 1.1225, asOf: "2026-10-02", source: "ecb" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.frankfurter.dev/v1/2026-10-02?base=EUR&symbols=USD",
    );
  });

  it("derives pegged AED via USD x peg", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ base: "EUR", date: "2026-10-02", rates: { USD: 1.1225 } }),
    );
    const eurAed = await getHistoricalRate("2026-10-02", "EUR", "AED");
    expect(eurAed.ok && eurAed.rate).toBeCloseTo(1.1225 * 3.6725, 9);
    expect(eurAed.ok && eurAed.source).toBe("peg");
    const usdAed = await getHistoricalRate("2026-10-02", "USD", "AED");
    expect(usdAed.ok && usdAed.rate).toBeCloseTo(3.6725, 9);
    const aedUsd = await getHistoricalRate("2026-10-02", "AED", "USD");
    expect(aedUsd.ok && aedUsd.rate).toBeCloseTo(1 / 3.6725, 9);
  });

  it("EUR holding in AED base cross (GBP -> AED)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ base: "EUR", date: "2026-10-02", rates: { USD: 1.1, GBP: 0.5 } }),
    );
    const r = await getHistoricalRate("2026-10-02", "GBP", "AED");
    // GBP->EUR = 2, EUR->AED = 1.1*3.6725
    expect(r.ok && r.rate).toBeCloseTo(2 * 1.1 * 3.6725, 9);
  });

  it("weekend returns the previous fixing date", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ base: "EUR", date: "2026-10-02", rates: { USD: 1.1225 } }),
    );
    const r = await getHistoricalRate("2026-10-04", "EUR", "USD");
    expect(r.ok && r.asOf).toBe("2026-10-02");
  });

  it("provider failure -> ok:false, never throws", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    const r = await getHistoricalRate("2026-10-02", "EUR", "USD");
    expect(r.ok).toBe(false);
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    clearFxHistoryCache();
    expect((await getHistoricalRate("2026-10-02", "EUR", "USD")).ok).toBe(false);
  });

  it("rejects malformed date", async () => {
    const r = await getHistoricalRate("nope", "EUR", "USD");
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches: second call does not fetch", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ base: "EUR", date: "2026-10-02", rates: { USD: 1.1225 } }),
    );
    await getHistoricalRate("2026-10-02", "EUR", "USD");
    await getHistoricalRate("2026-10-02", "EUR", "USD");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("batch de-dups dates and uses one range request with fallback fixings", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        rates: {
          "2026-09-28": { USD: 1.1378 },
          "2026-10-01": { USD: 1.1298 },
          "2026-10-02": { USD: 1.1225 },
        },
      }),
    );
    const out = await getHistoricalRatesBatch(
      ["2026-10-04", "2026-09-28", "2026-10-04", "2026-10-01"],
      "EUR",
      "USD",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("..2026-10-04");
    expect(Object.keys(out).sort()).toEqual(["2026-09-28", "2026-10-01", "2026-10-04"]);
    const w = out["2026-10-04"];
    expect(w.ok && w.rate).toBe(1.1225);
    expect(w.ok && w.asOf).toBe("2026-10-02");
    const m = out["2026-09-28"];
    expect(m.ok && m.rate).toBe(1.1378);
  });

  it("mock mode serves static rates without fetch", async () => {
    process.env.FX_MOCK_MODE = "true";
    const r = await getHistoricalRate("2026-10-02", "EUR", "USD");
    expect(r.ok && r.rate).toBe(1.09);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
