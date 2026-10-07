import { describe, expect, it } from "vitest";
import { statementAccountToCsvFile, statementToParseResult, toImportTransactions } from "./bridge";
import type { PdfStatement, TransactionFingerprint } from "./types";

function tx(p: Partial<TransactionFingerprint> & Pick<TransactionFingerprint, "date" | "amount" | "index">): TransactionFingerprint {
  return {
    bank: "wio",
    accountRef: "AE000000000000000000001",
    currency: "AED",
    valueDate: null,
    description: "Coffee",
    rawDescription: "Coffee",
    debit: p.amount < 0 ? -p.amount : null,
    credit: p.amount > 0 ? p.amount : null,
    balance: null,
    reference: null,
    ...p,
  };
}

const statement: PdfStatement = {
  bank: "wio",
  bankName: "Wio",
  warnings: ["Skipped 1 line"],
  accounts: [
    {
      accountRef: "AE000000000000000000001",
      currency: "AED",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      openingBalance: 100,
      closingBalance: 1075.65,
      transactions: [
        tx({ date: "2026-01-05", amount: -24.35, index: 0, description: "Coffee shop", balance: 75.65 }),
        tx({ date: "2026-01-20", amount: 1000, index: 1, description: "Salary", balance: 1075.65 }),
        tx({ date: "2026-01-21", amount: -0.5, index: 2, description: "Fee", balance: null }),
      ],
      reconciliation: {
        status: "ok",
        openingBalance: 100,
        closingBalance: 1075.65,
        computedClosing: 1075.65,
        difference: 0,
        brokenBalanceRows: [],
      },
    },
  ],
};

describe("statementToParseResult", () => {
  it("maps accounts to groups and warnings to errors", () => {
    const r = statementToParseResult(statement);
    expect(r.profile.id).toBe("wio");
    expect(r.delimiter).toBe("");
    expect(r.skipped).toBe(0);
    expect(r.errors).toEqual([{ line: 0, message: "Skipped 1 line" }]);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].accountRef).toBe("AE000000000000000000001");
    expect(r.groups[0].currency).toBe("AED");
    expect(r.groups[0].rows).toEqual([
      { date: "2026-01-05", description: "Coffee shop", amount: -24.35, balance: 75.65 },
      { date: "2026-01-20", description: "Salary", amount: 1000, balance: 1075.65 },
      { date: "2026-01-21", description: "Fee", amount: -0.5, balance: null },
    ]);
  });

  it.each([
    ["hsbc_uae", "HSBC UAE"],
    ["hsbc_uae_card", "HSBC UAE credit card"],
    ["fab_card", "First Abu Dhabi Bank credit card"],
    ["cbi", "Commercial Bank International (CBI)"],
  ] as const)("maps the OCR-only bank %s to its PDF-only profile", (bank, name) => {
    const r = statementToParseResult({ ...statement, bank, source: "ocr" });
    expect(r.profile.id).toBe(bank);
    expect(r.profile.name).toBe(name);
    expect(r.profile.pdfOnly).toBe(true);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].rows).toHaveLength(3);
  });
});

describe("statementAccountToCsvFile", () => {
  it("emits ISO dates and plain dot decimals", () => {
    const f = statementAccountToCsvFile(statement, 0, "wio-jan.pdf");
    expect(f.fileName).toBe("wio-jan.pdf");
    expect(f.headers).toEqual(["Date", "Description", "Debit", "Credit", "Balance"]);
    expect(f.rows).toEqual([
      { Date: "2026-01-05", Description: "Coffee shop", Debit: "24.35", Credit: "", Balance: "75.65" },
      { Date: "2026-01-20", Description: "Salary", Debit: "", Credit: "1000.00", Balance: "1075.65" },
      { Date: "2026-01-21", Description: "Fee", Debit: "0.50", Credit: "", Balance: "" },
    ]);
  });

  it("throws on a bad account index", () => {
    expect(() => statementAccountToCsvFile(statement, 3, "x.pdf")).toThrow();
  });
});

describe("toImportTransactions", () => {
  it("returns date/amount/description", () => {
    expect(toImportTransactions(statement.accounts[0])).toEqual([
      { date: "2026-01-05", amount: -24.35, description: "Coffee shop" },
      { date: "2026-01-20", amount: 1000, description: "Salary" },
      { date: "2026-01-21", amount: -0.5, description: "Fee" },
    ]);
  });
});
