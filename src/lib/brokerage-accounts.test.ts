import { describe, expect, it } from "vitest";
import { buildBrokerageAccounts, type BrokerageHolding } from "./brokerage-accounts";

const holding = (id: string, account: string | undefined, value: number, extra: Partial<BrokerageHolding> = {}): BrokerageHolding => ({
  id,
  name: id,
  quantity: 10,
  current_value: value,
  currency: "USD",
  ticker_symbol: id,
  purchase_date: "2025-01-01",
  metadata: { ...(account ? { account_name: account } : {}), ...(extra.metadata ?? {}) },
  ...extra,
});

describe("buildBrokerageAccounts", () => {
  const rates = { USD: 1, EUR: 0.5 };

  it("groups holdings by account and totals open positions in the base currency", () => {
    const summary = buildBrokerageAccounts(
      [
        holding("AAA", "Broker Acc. # 1", 100),
        holding("BBB", "Broker Acc. # 1", 50, { currency: "EUR" }),
        holding("CCC", "Another Acc. # 2", 30),
        holding("DDD", undefined, 5),
      ],
      "USD",
      rates,
    );
    expect(summary.accounts.map((a) => a.name)).toEqual(["Another Acc. # 2", "Broker Acc. # 1", null]);
    expect(summary.accounts[1].totalBase).toBeCloseTo(200); // 100 USD + 50 EUR at 0.5 EUR per USD
    expect(summary.totalBase).toBeCloseTo(235);
    expect(summary.holdingCount).toBe(4);
  });

  it("keeps closed positions out of the totals and counts them separately", () => {
    const summary = buildBrokerageAccounts([holding("AAA", "X", 100), holding("OLD", "X", 0, { quantity: 0 })], "USD", rates);
    expect(summary.accounts[0]).toMatchObject({ openCount: 1, closedCount: 1, totalBase: 100 });
  });

  it("reports the newest price date of each account", () => {
    const summary = buildBrokerageAccounts(
      [
        holding("AAA", "X", 1, { metadata: { account_name: "X", last_priced_at: "2026-10-01T08:00:00Z" } }),
        holding("BBB", "X", 1, { metadata: { account_name: "X", last_priced_at: "2026-10-05T08:00:00Z" } }),
        holding("CCC", "Y", 1),
      ],
      "USD",
      rates,
    );
    expect(summary.accounts.find((a) => a.name === "X")?.pricesUpdated).toBe("2026-10-05");
    expect(summary.accounts.find((a) => a.name === "Y")?.pricesUpdated).toBeNull();
  });

  it("returns an empty summary for no holdings", () => {
    expect(buildBrokerageAccounts([], "USD", rates)).toEqual({ accounts: [], totalBase: 0, holdingCount: 0 });
  });
});
