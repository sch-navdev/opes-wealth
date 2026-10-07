import { describe, expect, it } from "vitest";
import {
  accountTail,
  BANK_PROFILES,
  detectDelimiter,
  detectProfile,
  getBankProfile,
  normalizeHeader,
  parseBankAmount,
  parseBankDate,
  parseStatement,
  routeGroup,
  type StatementParseResult,
} from "./csv-profiles";

function ok(result: StatementParseResult | { error: string }): StatementParseResult {
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("profile registry", () => {
  it("has unique ids and findable profiles", () => {
    const ids = BANK_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of BANK_PROFILES) expect(getBankProfile(p.id)).toBe(p);
    expect(getBankProfile("nope")).toBeUndefined();
  });

  it("PDF-only profiles (OCR banks) have no aliases and can never match a CSV", () => {
    const pdfOnly = BANK_PROFILES.filter((p) => p.pdfOnly);
    expect(pdfOnly.map((p) => p.id).sort()).toEqual(["cbd", "cbi", "fab_card", "hsbc_uae", "hsbc_uae_card"]);
    for (const p of pdfOnly) {
      expect(Object.values(p.columns).flat()).toEqual([]);
      expect(p.signature).toEqual([]);
      const csv = "Date,Description,Debit,Credit,Balance\n2026-01-05,Coffee,10.00,,90.00\n";
      expect(parseStatement(csv, p.id)).toHaveProperty("error");
    }
    // Detection of a generic CSV never picks a PDF-only profile.
    const detected = detectProfile("Date,Description,Debit,Credit,Balance\n2026-01-05,Coffee,10.00,,90.00\n");
    expect(detected && BANK_PROFILES.find((p) => p.id === detected.profile.id)?.pdfOnly).toBeFalsy();
  });

  it("has normalised aliases and a date plus an amount or debit/credit column for every CSV profile", () => {
    for (const p of BANK_PROFILES.filter((p) => !p.pdfOnly)) {
      const all = Object.values(p.columns).flat() as string[];
      for (const alias of all) expect(alias).toBe(normalizeHeader(alias));
      expect(p.columns.date.length).toBeGreaterThan(0);
      const hasAmount = !!p.columns.amount?.length || (!!p.columns.debit?.length && !!p.columns.credit?.length);
      expect(hasAmount).toBe(true);
    }
  });
});

describe("normalizeHeader", () => {
  it("lower-cases, strips accents and punctuation", () => {
    expect(normalizeHeader("Libellé de l'opération")).toBe("libelledeloperation");
    expect(normalizeHeader(" Date_Op ")).toBe("dateop");
    expect(normalizeHeader("Débit (EUR)")).toBe("debiteur");
  });
});

describe("parseBankDate", () => {
  it.each([
    ["2026-01-05", "2026-01-05"],
    ["2026-1-5", "2026-01-05"],
    ["05/01/2026", "2026-01-05"],
    ["5-1-2026", "2026-01-05"],
    ["05.01.2026", "2026-01-05"],
    ["05 Jan 2026", "2026-01-05"],
    ["5 janv. 2026", "2026-01-05"],
    ["14 février 2026", "2026-02-14"],
    ["2026-01-05 13:45:00", "2026-01-05"],
    ["05/01/2026 09:30", "2026-01-05"],
    ["2026-01-05T10:00:00Z", "2026-01-05"],
  ])("reads %s", (input, expected) => {
    expect(parseBankDate(input)).toBe(expected);
  });

  it("treats slash dates as day-first (03/04 is 3 April)", () => {
    expect(parseBankDate("03/04/2026")).toBe("2026-04-03");
  });

  it.each(["", "garbage", "31/02/2026", "13/25/2026", "2026-13-01", "05 Foo 2026", "1/1/26"])(
    "rejects %j",
    (input) => {
      expect(parseBankDate(input)).toBeNull();
    },
  );

  it("accepts a leap day only in leap years", () => {
    expect(parseBankDate("29/02/2024")).toBe("2024-02-29");
    expect(parseBankDate("29/02/2025")).toBeNull();
  });
});

describe("parseBankAmount", () => {
  it.each([
    ["1,234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["1 234,56", 1234.56],
    ["1 234,56", 1234.56],
    ["-12,50", -12.5],
    ["-12.50", -12.5],
    ["(12.50)", -12.5],
    ["12.50-", -12.5],
    ["−12.50", -12.5],
    ["€ -45,00", -45],
    ["-AED 45", -45],
    ["AED 1,000", 1000],
    ["1,5", 1.5],
    ["12,345", 12345],
    ["1.234.567", 1234567],
    ["1,234,567.89", 1234567.89],
    ["0.00", 0],
    ["1234,5", 1234.5],
    ["100", 100],
  ])("reads %j as %d", (input, expected) => {
    expect(parseBankAmount(input)).toBe(expected);
  });

  it.each(["", "   ", "abc", "AED", "-"])("returns null for %j", (input) => {
    expect(parseBankAmount(input)).toBeNull();
  });
});

describe("detectDelimiter", () => {
  it("picks the most frequent of ; tab and comma", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
  });

  it("defaults to comma when there is no delimiter", () => {
    expect(detectDelimiter("abc")).toBe(",");
    expect(detectDelimiter("")).toBe(",");
  });

  it("is not fooled by decimal commas in a semicolon file", () => {
    expect(detectDelimiter("Date;Montant;Solde\n01/01/2026;-1,5;10,0\n02/01/2026;2,5;12,5")).toBe(";");
  });
});

describe("accountTail", () => {
  it("returns the last 4 alphanumerics upper-cased, ignoring spaces", () => {
    expect(accountTail("AE07 0331 2345 6789 0123 456")).toBe("3456");
    expect(accountTail("fr76 3000 abcd")).toBe("ABCD");
    expect(accountTail("12")).toBe("12");
    expect(accountTail("")).toBe("");
  });
});

describe("parseStatement", () => {
  it("returns an error for an unknown profile or a file without the bank's columns", () => {
    expect(parseStatement("a,b\n1,2", "nope" as never)).toEqual({ error: "Unknown bank profile." });
    expect(parseStatement("foo,bar\n1,2", "wio")).toHaveProperty("error");
  });

  it("converts Debit/Credit columns to a signed amount and reads balances", () => {
    const csv = [
      "Transaction Date,Description,Debit,Credit,Balance",
      "05/01/2026,Coffee,12.50,,987.50",
      "06/01/2026,Salary,,5000.00,5987.50",
    ].join("\n");
    const r = ok(parseStatement(csv, "wio"));
    expect(r.errors).toEqual([]);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]).toMatchObject({ accountRef: "", currency: "AED" });
    expect(r.groups[0].rows).toEqual([
      { date: "2026-01-05", description: "Coffee", amount: -12.5, balance: 987.5 },
      { date: "2026-01-06", description: "Salary", amount: 5000, balance: 5987.5 },
    ]);
  });

  it("keeps the sign of a single Amount column", () => {
    const csv = ["Date,Description,Amount", "05/01/2026,Shop,-40.00", "06/01/2026,Refund,15.25"].join("\n");
    const r = ok(parseStatement(csv, "adcb"));
    expect(r.groups[0].rows.map((x) => x.amount)).toEqual([-40, 15.25]);
    expect(r.groups[0].rows.every((x) => x.balance === null)).toBe(true);
  });

  it("skips preamble, blank rows and footers; reports malformed rows with line numbers", () => {
    const csv = [
      "Statement of account",
      "Generated,2026-02-01",
      "Transaction Date,Description,Debit,Credit",
      "05/01/2026,Coffee,10,",
      "99/99/2026,Broken,1,",
      "07/01/2026,No amount,,",
      ",,,",
      "Total,,,",
    ].join("\n");
    const r = ok(parseStatement(csv, "wio"));
    expect(r.groups[0].rows).toHaveLength(1);
    // 1-based physical line numbers: header is line 3, so the bad rows are lines 5 and 6.
    expect(r.errors.map((e) => e.line)).toEqual([5, 6]);
    expect(r.skipped).toBe(2); // the all-empty row and the "Total" footer
  });

  // csv-profiles.ts:626-627 — the line number is derived from the index in the
  // table AFTER parseCsvTable has dropped blank lines, so a blank line anywhere
  // above a bad row makes the reported line number too small.
  it("reports physical file line numbers even when blank lines precede the bad row", () => {
    const csv = [
      "Transaction Date,Description,Debit,Credit",
      "05/01/2026,Coffee,10,",
      "",
      "99/99/2026,Broken,1,",
    ].join("\n");
    const r = ok(parseStatement(csv, "wio"));
    expect(r.errors.map((e) => e.line)).toEqual([4]);
  });

  it("handles a UTF-8 BOM, quoted fields and CRLF line endings", () => {
    const csv =
      "﻿Transaction Date,Description,Debit,Credit\r\n" +
      '05/01/2026,"Shop, Inc ""Main""",10.00,\r\n';
    const r = ok(parseStatement(csv, "wio"));
    expect(r.groups[0].rows[0]).toMatchObject({ description: 'Shop, Inc "Main"', amount: -10 });
  });

  it("parses French semicolon files with decimal commas, grouping by account number", () => {
    const csv = [
      "dateOp;dateVal;label;category;categoryParent;supplierFound;amount;comment;accountNum;accountLabel;accountbalance",
      "2026-01-05;2026-01-05;CB CARREFOUR;Alim;Courses;;-45,60;;00040123456;Compte courant;1 234,50",
      "2026-01-06;2026-01-06;VIR SALAIRE;Rev;Revenus;;2 500,00;;00040123456;Compte courant;3 734,50",
      "2026-01-06;2026-01-06;LIVRET;Rev;Revenus;;10,00;;00099999999;Livret;10,00",
    ].join("\n");
    const r = ok(parseStatement(csv, "boursobank"));
    expect(r.delimiter).toBe(";");
    expect(r.groups).toHaveLength(2);
    const main = r.groups.find((g) => g.accountRef === "00040123456")!;
    expect(main.currency).toBe("EUR");
    expect(main.rows.map((x) => x.amount)).toEqual([-45.6, 2500]);
    expect(main.rows.map((x) => x.balance)).toEqual([1234.5, 3734.5]);
  });

  it("uses an IBAN in the preamble to identify the account", () => {
    const csv = [
      "Account Statement",
      "IBAN: AE07 0331 2345 6789 0123 456",
      "Transaction Date,Description,Debit,Credit",
      "05/01/2026,Coffee,10,",
    ].join("\n");
    const r = ok(parseStatement(csv, "wio"));
    expect(r.groups[0].accountRef).toBe("AE07 0331 2345 6789 0123 456");
  });

  it("splits groups by currency column", () => {
    const csv = [
      "Date,Description,Amount,Currency",
      "05/01/2026,A,10,AED",
      "05/01/2026,B,20,usd",
    ].join("\n");
    const r = ok(parseStatement(csv, "adcb"));
    expect(r.groups.map((g) => g.currency).sort()).toEqual(["AED", "USD"]);
  });

  it("returns no groups for a header-only file", () => {
    const r = ok(parseStatement("Date,Description,Amount\n", "adcb"));
    expect(r.groups).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it("treats the same input identically on repeat calls (pure)", () => {
    const csv = "Date,Description,Amount\n05/01/2026,A,10\n";
    expect(parseStatement(csv, "adcb")).toEqual(parseStatement(csv, "adcb"));
  });
});

describe("detectProfile", () => {
  it("identifies a bank by its signature headers", () => {
    const d = detectProfile("Txn Date,Narration,Debit,Credit,Balance\n05/01/2026,x,1,,2");
    expect(d?.profile.id).toBe("enbd");
    expect(d?.ambiguous).toBe(false);
  });

  it("identifies Wio by Booking Date / Running Balance", () => {
    const d = detectProfile("Booking Date,Description,Amount,Running Balance\n05/01/2026,x,1,2");
    expect(d?.profile.id).toBe("wio");
  });

  it("reports ambiguity for the generic French vocabulary", () => {
    const d = detectProfile("Date;Libellé;Débit;Crédit;Solde\n05/01/2026;x;1;;2");
    expect(d).not.toBeNull();
    expect(d?.profile.country).toBe("FR");
    expect(d?.ambiguous).toBe(true);
  });

  it("finds the header below a preamble", () => {
    const d = detectProfile("Account statement\nTxn Date,Narration,Debit,Credit\n05/01/2026,x,1,");
    expect(d?.profile.id).toBe("enbd");
  });

  it("returns null when nothing looks like a statement", () => {
    expect(detectProfile("foo,bar\n1,2")).toBeNull();
    expect(detectProfile("")).toBeNull();
  });
});

describe("routeGroup", () => {
  const accounts = [
    { id: "a1", name: "Main", currency: "EUR", bankProfile: "boursobank", accountRef: "FR76 3000 1234" },
    { id: "a2", name: "Other", currency: "EUR", bankProfile: "bnp_paribas" },
    { id: "a3", name: "Dirham", currency: "AED", bankProfile: "wio" },
  ];

  it("matches by the last 4 characters of the account reference first", () => {
    expect(routeGroup({ accountRef: "x 1234", currency: "USD" }, "wio", accounts)).toEqual({
      kind: "matched",
      assetId: "a1",
      reason: "account_ref",
    });
  });

  it("falls back to the single account remembered for this bank and currency (case-insensitive)", () => {
    expect(routeGroup({ accountRef: "", currency: "aed" }, "wio", accounts)).toEqual({
      kind: "matched",
      assetId: "a3",
      reason: "bank_and_currency",
    });
  });

  it("never guesses between several candidates", () => {
    const dup = [...accounts, { id: "a4", name: "Dup", currency: "AED", bankProfile: "wio" }];
    expect(routeGroup({ accountRef: "", currency: "AED" }, "wio", dup)).toEqual({
      kind: "unmatched",
      candidates: ["a3", "a4"],
    });
  });

  it("does not use an ambiguous account ref match and is unmatched when nothing fits", () => {
    const dupRef = [
      { id: "x", name: "X", currency: "EUR", accountRef: "0001234" },
      { id: "y", name: "Y", currency: "EUR", accountRef: "9991234" },
    ];
    expect(routeGroup({ accountRef: "1234", currency: "EUR" }, "lcl", dupRef)).toEqual({
      kind: "unmatched",
      candidates: [],
    });
  });
});
