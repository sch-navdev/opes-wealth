import { describe, expect, it } from "vitest";
import { fingerprintTransactions } from "./transactions";
import { identicalWithinList, occurrenceIndexes, transactionBaseKey } from "./transaction-keys";

const A = { date: "2026-02-02", amount: -4, description: "Coffee" };

describe("transactionBaseKey", () => {
  it("ignores case, accents, spacing and amount precision, like the fingerprint", () => {
    expect(transactionBaseKey({ date: "2026-02-02", amount: -4, description: "  CAFÉ   shop" })).toBe(
      transactionBaseKey({ date: "2026-02-02", amount: -4.0, description: "cafe shop" }),
    );
  });

  it("differs by date, amount and description", () => {
    const base = transactionBaseKey(A);
    expect(transactionBaseKey({ ...A, date: "2026-02-03" })).not.toBe(base);
    expect(transactionBaseKey({ ...A, amount: -5 })).not.toBe(base);
    expect(transactionBaseKey({ ...A, description: "Tea" })).not.toBe(base);
  });
});

describe("occurrenceIndexes", () => {
  it("numbers identical rows in input order and leaves others at 0", () => {
    const rows = [A, { ...A, date: "2026-02-03" }, { ...A, description: "COFFEE" }, A];
    expect(occurrenceIndexes(rows)).toEqual([0, 0, 1, 2]);
  });

  it("matches the counter fingerprintTransactions uses", () => {
    const rows = [A, A, { ...A, amount: -9 }, A];
    const viaOverride = fingerprintTransactions(
      rows.map((r, i) => ({ ...r, occurrence: occurrenceIndexes(rows)[i] })),
      "AED",
    ).map((t) => t.fingerprint);
    const viaCounter = fingerprintTransactions(rows, "AED").map((t) => t.fingerprint);
    expect(viaOverride).toEqual(viaCounter);
  });
});

describe("identicalWithinList", () => {
  it("flags every member of an identical group, and only those", () => {
    expect(identicalWithinList([A, { ...A, amount: -9 }, A])).toEqual([true, false, true]);
    expect(identicalWithinList([])).toEqual([]);
  });
});
