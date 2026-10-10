import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { wioProfile } from "./wio";
import type { PdfAccountStatement } from "./types";

const TEXT = readFileSync(join(__dirname, "fixtures", "wio-statement.txt"), "utf8");

function parseOk() {
  const out = wioProfile.parse(TEXT);
  if (!out.ok) throw new Error(`expected ok, got ${out.failure.code}`);
  return out.statement;
}

const rows = (a: PdfAccountStatement) =>
  a.transactions.map((t) => [t.date, t.reference, t.amount, t.balance] as const);

describe("wioProfile.detect", () => {
  it("recognises a Wio statement", () => {
    expect(wioProfile.detect(TEXT)).toBe(true);
    expect(wioProfile.id).toBe("wio");
    expect(wioProfile.name).toBe("Wio Bank");
  });

  it("rejects other text", () => {
    expect(wioProfile.detect("FIRST ABU DHABI BANK statement of account")).toBe(false);
    expect(wioProfile.detect("Wio Bank marketing leaflet")).toBe(false);
  });
});

describe("wioProfile.parse (synthetic multi-account fixture)", () => {
  it("returns one account per account with transactions, in order", () => {
    const s = parseOk();
    expect(s.bank).toBe("wio");
    expect(s.bankName).toBe("Wio Bank");
    expect(s.accounts.map((a) => [a.accountRef, a.currency])).toEqual([
      ["AE000000000000123456789", "AED"],
      ["AE000000000000987654321", "USD"],
      ["0000000003", "AED"],
    ]);
    expect(s.warnings).toEqual([]);
  });

  it("reads period, opening and closing balances per account", () => {
    const [aed, usd, saving] = parseOk().accounts;
    for (const a of [aed, usd, saving]) {
      expect(a.periodStart).toBe("2026-02-01");
      expect(a.periodEnd).toBe("2026-02-26");
    }
    expect([aed.openingBalance, aed.closingBalance]).toEqual([500, 800]);
    expect([usd.openingBalance, usd.closingBalance]).toEqual([300, 125.5]);
    expect([saving.openingBalance, saving.closingBalance]).toEqual([1000, 1005.25]);
  });

  it("parses every AED current-account row exactly, across the page break", () => {
    const [aed] = parseOk().accounts;
    expect(rows(aed)).toEqual([
      ["2026-02-02", "P100000001", 1498.34, 1998.34],
      ["2026-02-05", "P100000002", -1000, 998.34],
      ["2026-02-09", "P100000003", 6400, 7398.34],
      ["2026-02-09", "P100000004", -6500, 898.34],
      ["2026-02-12", "P100000005", 101491.4, 102389.74],
      ["2026-02-12", "P100000006", -101491.4, 898.34],
      ["2026-02-20", "P100000007", -98.34, 800],
    ]);
    expect(aed.transactions.map((t) => t.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("splits the glued amount and balance using balance continuity", () => {
    const [aed, usd] = parseOk().accounts;
    // "-1,000998.34" is -1,000 followed by 998.34, not -1,000998 / .34
    const ambiguous = aed.transactions[1];
    expect(ambiguous.amount).toBe(-1000);
    expect(ambiguous.balance).toBe(998.34);
    expect(ambiguous.debit).toBe(1000);
    expect(ambiguous.credit).toBeNull();
    // "-101,491.4898.34" and "-98.34800"
    expect(aed.transactions[5].amount).toBe(-101491.4);
    expect(aed.transactions[6].amount).toBe(-98.34);
    // "25.5325.5": 25.5 then 325.5, not 25.53 then 25.5
    expect(usd.transactions[0].amount).toBe(25.5);
    expect(usd.transactions[0].balance).toBe(325.5);
  });

  it("separates the reference and description, with no value date", () => {
    const [aed] = parseOk().accounts;
    const t = aed.transactions[1];
    expect(t.reference).toBe("P100000002");
    expect(t.description).toBe("To Jane Sample (rate: 1.0000)");
    expect(t.rawDescription).toBe("To Jane Sample (rate: 1.0000)");
    expect(t.valueDate).toBeNull();
    expect(t.bank).toBe("wio");
    expect(t.accountRef).toBe("AE000000000000123456789");
    expect(t.currency).toBe("AED");
    expect(aed.transactions[0].description).toBe("From Acme Payroll Services");
    expect(aed.transactions[0].credit).toBe(1498.34);
    expect(aed.transactions[0].debit).toBeNull();
  });

  it("parses the USD account and the savings account (no IBAN)", () => {
    const [, usd, saving] = parseOk().accounts;
    expect(usd.currency).toBe("USD");
    expect(rows(usd)).toEqual([
      ["2026-02-02", "P200000001", 25.5, 325.5],
      ["2026-02-03", "P200000002", -200, 125.5],
    ]);
    expect(rows(saving)).toEqual([["2026-02-01", "P300000001", 5.25, 1005.25]]);
    expect(saving.accountRef).toBe("0000000003");
  });

  it("reconciles every account to the cent", () => {
    for (const a of parseOk().accounts) {
      expect(a.reconciliation.status).toBe("ok");
      expect(a.reconciliation.difference).toBe(0);
      expect(a.reconciliation.brokenBalanceRows).toEqual([]);
    }
  });

  it("reports a mismatch when a printed balance is tampered with", () => {
    const tampered = TEXT.replace("P100000003Savings Pot to Jane Example6,4007,398.34", "P100000003Savings Pot to Jane Example6,4007,399.34");
    expect(tampered).not.toBe(TEXT);
    const out = wioProfile.parse(tampered);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.statement.accounts[0].reconciliation.status).toBe("mismatch");
    expect(out.statement.warnings.length).toBeGreaterThan(0);
  });

  it("returns no_transactions when no table has rows", () => {
    const empty = TEXT.split("\n")
      .filter((l) => !/^\d{2}\/\d{2}\/\d{4}P\d{9}/.test(l))
      .join("\n");
    const out = wioProfile.parse(empty);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure.code).toBe("no_transactions");
    expect(out.failure.bank).toBe("wio");
  });
});

describe("wioProfile account closure", () => {
  it("reads the printed ACCOUNT CLOSURE date of a closed account and leaves open accounts unmarked", () => {
    const lf = TEXT.split("\r").join("");
    const closed = lf.replace(
      "ACCOUNT OPENED\n27/11/2023\nIBAN\nAE000000000000123456789",
      "ACCOUNT OPENED\n27/11/2023\nACCOUNT CLOSURE\n23/09/2026\nIBAN\nAE000000000000123456789",
    );
    expect(closed).not.toBe(lf);
    const out = wioProfile.parse(closed);
    if (!out.ok) throw new Error("parse failed");
    expect(out.statement.accounts.some((a) => a.closedOn === "2026-09-23")).toBe(true);
    expect(out.statement.accounts.some((a) => !a.closedOn)).toBe(true);
    expect(parseOk().accounts.every((a) => !a.closedOn)).toBe(true);
  });
});
