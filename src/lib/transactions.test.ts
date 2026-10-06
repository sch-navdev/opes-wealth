import { describe, expect, it } from "vitest";
import {
  fingerprintTransactions,
  normalizeDescription,
  transactionFingerprint,
} from "./transactions";

describe("normalizeDescription", () => {
  it("lower-cases, strips accents and collapses whitespace", () => {
    expect(normalizeDescription("  CAFÉ   de   Flore\t")).toBe("cafe de flore");
  });

  it("handles undefined and empty input", () => {
    expect(normalizeDescription(undefined)).toBe("");
    expect(normalizeDescription("   ")).toBe("");
  });
});

describe("transactionFingerprint", () => {
  const tx = { date: "2026-01-05", amount: -12.5, description: "Coffee Shop" };

  it("is a 64 char hex SHA-256", () => {
    expect(transactionFingerprint(tx, "AED")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same input", () => {
    expect(transactionFingerprint(tx, "AED")).toBe(transactionFingerprint({ ...tx }, "AED"));
  });

  it("changes with date, amount, currency, description and occurrence", () => {
    const base = transactionFingerprint(tx, "AED");
    expect(transactionFingerprint({ ...tx, date: "2026-01-06" }, "AED")).not.toBe(base);
    expect(transactionFingerprint({ ...tx, amount: -12.6 }, "AED")).not.toBe(base);
    expect(transactionFingerprint(tx, "EUR")).not.toBe(base);
    expect(transactionFingerprint({ ...tx, description: "Tea Shop" }, "AED")).not.toBe(base);
    expect(transactionFingerprint(tx, "AED", 1)).not.toBe(base);
  });

  it("ignores cosmetic differences in description, currency case and amount precision", () => {
    const a = transactionFingerprint({ date: "2026-01-05", amount: 12.5, description: "Café  Shop" }, "aed");
    const b = transactionFingerprint({ date: "2026-01-05", amount: 12.5, description: "cafe shop" }, " AED ");
    const c = transactionFingerprint({ date: "2026-01-05", amount: 12.50, description: "cafe shop" }, "AED");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("distinguishes credit from debit of the same size", () => {
    expect(transactionFingerprint({ ...tx, amount: 12.5 }, "AED")).not.toBe(
      transactionFingerprint({ ...tx, amount: -12.5 }, "AED"),
    );
  });

  it("treats -0 and 0 alike", () => {
    expect(transactionFingerprint({ date: "2026-01-05", amount: -0 }, "AED")).toBe(
      transactionFingerprint({ date: "2026-01-05", amount: 0 }, "AED"),
    );
  });

  it("rounds sub-cent noise away", () => {
    expect(transactionFingerprint({ ...tx, amount: -12.5000001 }, "AED")).toBe(
      transactionFingerprint(tx, "AED"),
    );
  });
});

describe("fingerprintTransactions", () => {
  it("returns an empty array for empty input", () => {
    expect(fingerprintTransactions([], "AED")).toEqual([]);
  });

  it("keeps identical same-day payments distinct inside one batch", () => {
    const row = { date: "2026-02-01", amount: -3, description: "Metro" };
    const out = fingerprintTransactions([row, row, row], "AED");
    expect(new Set(out.map((o) => o.fingerprint)).size).toBe(3);
  });

  it("reproduces the same fingerprints when the same file is imported again", () => {
    const rows = [
      { date: "2026-02-01", amount: -3, description: "Metro" },
      { date: "2026-02-01", amount: -3, description: "Metro" },
      { date: "2026-02-02", amount: 100, description: "Salary" },
    ];
    const first = fingerprintTransactions(rows, "AED").map((r) => r.fingerprint);
    const second = fingerprintTransactions(rows, "AED").map((r) => r.fingerprint);
    expect(second).toEqual(first);
  });

  it("first occurrence matches the single-transaction fingerprint", () => {
    const row = { date: "2026-02-01", amount: -3, description: "Metro" };
    const [first, second] = fingerprintTransactions([row, row], "AED");
    expect(first.fingerprint).toBe(transactionFingerprint(row, "AED", 0));
    expect(second.fingerprint).toBe(transactionFingerprint(row, "AED", 1));
  });

  it("normalises currency and trims the description on the output", () => {
    const [out] = fingerprintTransactions([{ date: "2026-02-01", amount: 1, description: "  Hi  " }], " aed ");
    expect(out.currency).toBe("AED");
    expect(out.description).toBe("Hi");
  });

  it("defaults a missing description to an empty string", () => {
    const [out] = fingerprintTransactions([{ date: "2026-02-01", amount: 1 }], "AED");
    expect(out.description).toBe("");
  });

  it("gives different fingerprints to different dates/amounts", () => {
    const out = fingerprintTransactions(
      [
        { date: "2026-02-01", amount: -3, description: "Metro" },
        { date: "2026-02-02", amount: -3, description: "Metro" },
        { date: "2026-02-01", amount: -4, description: "Metro" },
      ],
      "AED",
    );
    expect(new Set(out.map((o) => o.fingerprint)).size).toBe(3);
  });
});
