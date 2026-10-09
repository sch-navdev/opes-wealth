import { describe, expect, it } from "vitest";
import { BANK_STALE_DAYS, balanceAgeDays, countStaleBalances, isBalanceStale, pickBalanceDate } from "./bank-staleness";

describe("pickBalanceDate", () => {
  it("prefers the newest history date, then the transaction date, then the updated date", () => {
    expect(pickBalanceDate({ historyDate: "2026-09-30", transactionDate: "2026-10-02", updatedAt: "2026-10-05T10:00:00Z" })).toBe("2026-09-30");
    expect(pickBalanceDate({ historyDate: null, transactionDate: "2026-10-02", updatedAt: "2026-10-05T10:00:00Z" })).toBe("2026-10-02");
    expect(pickBalanceDate({ updatedAt: "2026-10-05T10:00:00.000Z" })).toBe("2026-10-05");
  });

  it("skips invalid dates and returns null when nothing is usable", () => {
    expect(pickBalanceDate({ historyDate: "2026-02-30", transactionDate: "garbage", updatedAt: "2026-01-15" })).toBe("2026-01-15");
    expect(pickBalanceDate({ historyDate: "nope" })).toBeNull();
    expect(pickBalanceDate({})).toBeNull();
  });
});

describe("balanceAgeDays / isBalanceStale", () => {
  const today = "2026-10-09";

  it("uses a 31-day threshold", () => {
    expect(BANK_STALE_DAYS).toBe(31);
  });

  it("counts whole days", () => {
    expect(balanceAgeDays("2026-10-09", today)).toBe(0);
    expect(balanceAgeDays("2026-09-09", today)).toBe(30);
    expect(balanceAgeDays("bad", today)).toBeNull();
  });

  it("is stale only when MORE than 31 days old", () => {
    expect(isBalanceStale("2026-09-08", today)).toBe(false); // exactly 31 days
    expect(isBalanceStale("2026-09-07", today)).toBe(true); // 32 days
    expect(isBalanceStale("2026-10-08", today)).toBe(false);
  });

  it("never flags future or unknown dates", () => {
    expect(isBalanceStale("2026-12-01", today)).toBe(false);
    expect(isBalanceStale(null, today)).toBe(false);
    expect(isBalanceStale("bad", today)).toBe(false);
  });

  it("accepts a custom threshold", () => {
    expect(isBalanceStale("2026-10-01", today, 7)).toBe(true);
  });
});

describe("countStaleBalances", () => {
  it("counts the stale rows", () => {
    const rows = [{ balanceAsOf: "2026-01-01" }, { balanceAsOf: "2026-10-08" }, { balanceAsOf: null }, {}];
    expect(countStaleBalances(rows, "2026-10-09")).toBe(1);
  });
});
