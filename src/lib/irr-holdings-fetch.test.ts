import { beforeEach, describe, expect, it, vi } from "vitest";

const batch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/fx-history-client", () => ({ getHistoricalRatesBatch: batch }));

import { fetchHoldingFx } from "./irr-holdings-fetch";

beforeEach(() => {
  batch.mockReset();
});

describe("fetchHoldingFx", () => {
  it("keeps the ok rates per currency and drops the failed dates", async () => {
    batch.mockResolvedValue({
      "2022-03-01": { ok: true, rate: 1.1, asOf: "2022-03-01", source: "ecb" },
      "2022-03-02": { ok: false, reason: "x" },
    });
    const r = await fetchHoldingFx({ EUR: ["2022-03-01", "2022-03-02"] }, "USD");
    expect(r).toEqual({ EUR: { "2022-03-01": 1.1 } });
    expect(batch).toHaveBeenCalledWith(["2022-03-01", "2022-03-02"], "EUR", "USD");
  });

  it("never throws: a rejected currency becomes empty", async () => {
    batch.mockRejectedValue(new Error("down"));
    expect(await fetchHoldingFx({ EUR: ["2022-03-01"] }, "USD")).toEqual({ EUR: {} });
  });

  it("gives up after the time budget and returns what it has", async () => {
    batch.mockImplementation(() => new Promise(() => undefined));
    expect(await fetchHoldingFx({ EUR: ["2022-03-01"] }, "USD", 20)).toEqual({});
  });
});
