/**
 * Regression tests for FAB account-statement variants (all fixtures are invented):
 *  - a FAB statement whose free text mentions Wio must never be claimed by the Wio profile,
 *  - a quiet month (no transactions, opening = closing) is a valid statement,
 *  - the pre-2019 layout (compact two-digit-year dates, no AC-NUM header),
 *  - the transitional "Account Statement  FROM" header with two spaces.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fabProfile } from "./fab";
import { detectBankPdf, parseBankStatementPdfText } from "./index";
import { wioProfile } from "./wio";

const fixture = readFileSync(join(__dirname, "fixtures", "fab-statement.txt"), "utf8");

/** Same statement, but one transfer description names Wio Bank and the standard Wio words appear. */
const withWio = fixture.replace("Consulting Fe", "Wio Bank PJSC Fe");

const LEGACY = [
  "Page",
  "Date",
  "Customer Number",
  "Statement Period!\t",
  "\"#$%&'",
  "Legend:,3H.NO",
  "DR = Debit or overdrawn balance= DR\"00",
  "1 of 1",
  "30-Aug-2026",
  "EXAMPLE ROAD                                      ",
  "0000000000",
  "   MS. JANE EXAMPLE                                                             ",
  "   1 EXAMPLE STREET                        ",
  "                              000000",
  "0000000000                    ",
  "AE00 0000 0000 0000 0000 000 ",
  "CURRENT ACCOUNTS RETAIL            ",
  "UAE Dirham                    ",
  "01-Aug-2026 to 30-Aug-2026",
  "          01Aug26 BALANCE BROUGHT FORWARD                                                                        1,000.00",
  " 01Aug26  01Aug26 SAL - txn.ref.no:                                  500.00                                   1,500.00",
  "                  99OTT00000000000, from bank:",
  "                  EXAMPLEXXX, sender: ACME LLC",
  " 02Aug26  02Aug26 FROM AED 0000000000 TO AED                                               300.00             1,200.00",
  "                  AE000000000000000000000",
  " 03Aug26  03Aug26 Debit                                                                         2.00             1,198.00",
  " 19Aug26  19Aug26 EXAMPLE SHOP DUBAI ARE                                            2,000.00              DR 802.00",
  "                  TXN 18.08.2026 AED 2,000.00",
  " 25Aug26  25Aug26 SAL - txn.ref.no:                                  1,000.00                                   198.00",
  "                 30Aug26 CLOSING BALANCE                                                                                   198.00",
  " ",
  "Summary/PQ::             1,500.00            2,302.00 ",
  "Count/,-.S0#:                     2                    3 ",
].join("\n");

describe("FAB statement mentioning Wio", () => {
  it("is detected as FAB, not Wio, by both profiles and by the registry", () => {
    expect(wioProfile.detect(withWio)).toBe(false);
    expect(fabProfile.detect(withWio)).toBe(true);
    expect(detectBankPdf(withWio)?.id).toBe("fab");
  });
  it("parses and reconciles through the public entry point", () => {
    const out = parseBankStatementPdfText(withWio);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.statement.bank).toBe("fab");
      expect(out.statement.accounts[0].reconciliation.status).toBe("ok");
    }
  });
  it("still lets a genuine Wio statement through Wio", () => {
    expect(wioProfile.detect("Wio Bank PJSC\nACCOUNT STATEMENT\nFROM 01/01/2026 TO 31/01/2026")).toBe(true);
  });
});

describe("FAB quiet month", () => {
  const head = fixture.split("\n").slice(0, 29);
  const quiet = head.join("\n").replace("6,500.00", "10,000.00");
  it("returns ok with a warning when opening and closing agree", () => {
    const out = fabProfile.parse(quiet);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const a = out.statement.accounts[0];
    expect(a.transactions).toEqual([]);
    expect(a.reconciliation.status).toBe("ok");
    expect(out.statement.warnings).toContain("This statement has no transactions.");
  });
  it("is still a failure when the balances differ (rows went missing)", () => {
    const out = fabProfile.parse(head.join("\n"));
    expect(out.ok).toBe(false);
  });
});

describe("FAB header with two spaces between words", () => {
  const spaced = fixture.replace("Account Statement FROM", "Account Statement  FROM");
  it("is still recognised and parsed", () => {
    expect(fabProfile.detect(spaced)).toBe(true);
    const out = fabProfile.parse(spaced);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.statement.accounts[0].reconciliation.status).toBe("ok");
  });
  it("is recognised without any bank name (anonymous older print)", () => {
    const anon = spaced.replace(/^.*First {2}Abu.*$/m, "");
    expect(fabProfile.detect(anon)).toBe(true);
  });
});

describe("FAB pre-2019 layout", () => {
  it("is detected as FAB through the registry", () => {
    expect(detectBankPdf(LEGACY)?.id).toBe("fab");
    expect(wioProfile.detect(LEGACY)).toBe(false);
    expect(wioProfile.detect(`${LEGACY}\nWio Bank\nACCOUNT STATEMENT`)).toBe(false);
  });

  const out = fabProfile.parse(LEGACY);
  it("parses header, balances and period", () => {
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const a = out.statement.accounts[0];
    expect(a.accountRef).toBe("AE000000000000000000000");
    expect(a.currency).toBe("AED");
    expect(a.periodStart).toBe("2026-08-01");
    expect(a.periodEnd).toBe("2026-08-30");
    expect(a.openingBalance).toBe(1000);
    expect(a.closingBalance).toBe(198);
  });
  it("infers signs from the running balance, handles DR balances and reconciles to the cent", () => {
    if (!out.ok) throw new Error("parse failed");
    const a = out.statement.accounts[0];
    expect(a.transactions.map((t) => [t.date, t.amount, t.balance])).toEqual([
      ["2026-08-01", 500, 1500],
      ["2026-08-02", -300, 1200],
      ["2026-08-03", -2, 1198],
      ["2026-08-19", -2000, -802],
      ["2026-08-25", 1000, 198],
    ]);
    expect(a.reconciliation.status).toBe("ok");
    expect(a.reconciliation.brokenBalanceRows).toEqual([]);
    expect(out.statement.warnings).toEqual([]);
  });
  it("reads a DR marker printed after the balance as well", () => {
    const after = fabProfile.parse(LEGACY.replace("DR 802.00", "802.00 DR"));
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.statement.accounts[0].transactions[3].balance).toBe(-802);
      expect(after.statement.accounts[0].reconciliation.status).toBe("ok");
    }
  });
  it("joins continuation lines", () => {
    if (!out.ok) throw new Error("parse failed");
    const t = out.statement.accounts[0].transactions;
    expect(t[0].rawDescription).toContain("sender: ACME LLC");
    expect(t[1].rawDescription).toContain("AE000000000000000000000");
    expect(t[0].bank).toBe("fab");
  });
  it("flags a tampered balance", () => {
    const bad = parseBankStatementPdfText(LEGACY.replace("1,198.00", "1,197.00"));
    expect(bad.ok).toBe(true);
    if (bad.ok) expect(bad.statement.accounts[0].reconciliation.status).toBe("mismatch");
  });
  it("accepts a quiet legacy month and rejects a legacy statement that lost its rows", () => {
    const lines = LEGACY.split("\n");
    const bf = lines.findIndex((l) => l.includes("BROUGHT FORWARD"));
    const cb = lines.findIndex((l) => l.includes("CLOSING BALANCE"));
    const body = (closing: string) =>
      [...lines.slice(0, bf + 1), lines[cb].replace("198.00", closing), ...lines.slice(cb + 1)].join("\n");
    const quiet = fabProfile.parse(body("1,000.00"));
    expect(quiet.ok).toBe(true);
    if (quiet.ok) {
      expect(quiet.statement.accounts[0].reconciliation.status).toBe("ok");
      expect(quiet.statement.warnings).toContain("This statement has no transactions.");
    }
    const lost = fabProfile.parse(body("198.00"));
    expect(lost.ok).toBe(false);
    if (!lost.ok) expect(lost.failure.code).toBe("no_transactions");
  });
});
