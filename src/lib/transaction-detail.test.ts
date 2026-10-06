import { describe, expect, it } from "vitest";
import type { TransactionFingerprint } from "@/lib/parsers/bank-pdf/types";
import {
  accountTail,
  amountDirection,
  detailFromFingerprint,
  detailFromNormalized,
  detailFromRow,
  shortFingerprint,
  sourceKind,
} from "@/lib/transaction-detail";

const fp: TransactionFingerprint = {
  bank: "wio",
  accountRef: "AE07 0860 0000 1234 5678",
  currency: "AED",
  date: "2026-03-02",
  valueDate: "2026-03-03",
  description: "Carrefour",
  rawDescription: "POS CARREFOUR MOE DUBAI AE 0302",
  amount: -45.5,
  debit: 45.5,
  credit: null,
  balance: 1000,
  reference: "P180166769",
  index: 3,
};

describe("transaction-detail", () => {
  it("builds a view-model from a stored row, coercing the numeric amount", () => {
    const d = detailFromRow({
      booked_date: "2026-03-02",
      amount: "-12.30",
      currency: "EUR",
      description: null,
      source: "csv_import",
      fingerprint: "abcdef0123456789",
      created_at: "2026-03-05T10:00:00Z",
    });
    expect(d).toMatchObject({ date: "2026-03-02", amount: -12.3, currency: "EUR", description: "", source: "csv_import", importedAt: "2026-03-05T10:00:00Z" });
  });

  it("keeps every PDF metadata field and prefers the supplied bank name", () => {
    const d = detailFromFingerprint(fp, { bankName: "Wio Bank" });
    expect(d).toMatchObject({
      valueDate: "2026-03-03",
      originalLabel: "POS CARREFOUR MOE DUBAI AE 0302",
      balance: 1000,
      reference: "P180166769",
      bank: "Wio Bank",
      source: "pdf_import",
      index: 3,
    });
    expect(detailFromFingerprint(fp).bank).toBe("wio");
  });

  it("builds a CSV view-model with only what a CSV row has", () => {
    const d = detailFromNormalized(
      { date: "2026-03-02", description: "Salary", amount: 100, balance: null },
      { currency: "EUR", bankName: "BNP", accountRef: "" },
    );
    expect(d).toMatchObject({ currency: "EUR", bank: "BNP", accountRef: null, source: "csv_import", balance: null });
    expect(d.originalLabel).toBeUndefined();
  });

  it("shortens a fingerprint", () => {
    expect(shortFingerprint("abcdef0123456789")).toBe("abcdef01");
    expect(shortFingerprint("abcdef0123456789", 4)).toBe("abcd");
    expect(shortFingerprint("abc")).toBe("abc");
    expect(shortFingerprint(null)).toBe("");
  });

  it("extracts the account tail, source kind and amount direction", () => {
    expect(accountTail("AE07 0860 0000 1234 5678")).toBe("5678");
    expect(accountTail("12")).toBe("12");
    expect(accountTail("")).toBe("");
    expect(sourceKind("csv_import")).toBe("csv");
    expect(sourceKind("pdf_import")).toBe("pdf");
    expect(sourceKind("manual")).toBe("other");
    expect(amountDirection(5)).toBe("in");
    expect(amountDirection(-5)).toBe("out");
    expect(amountDirection(0)).toBe("zero");
  });
});
