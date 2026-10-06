import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fabProfile } from "./fab";
import type { PdfAccountStatement } from "./types";

const fixture = readFileSync(join(__dirname, "fixtures", "fab-statement.txt"), "utf8");

function parseOk(text: string): { account: PdfAccountStatement; warnings: string[] } {
  const out = fabProfile.parse(text);
  if (!out.ok) throw new Error(`parse failed: ${out.failure.code}`);
  return { account: out.statement.accounts[0], warnings: out.statement.warnings };
}

describe("fabProfile.detect", () => {
  it("recognises a FAB statement", () => {
    expect(fabProfile.detect(fixture)).toBe(true);
  });
  it("rejects other text", () => {
    expect(fabProfile.detect("Some other bank statement\nAccount Statement FROM 01 JAN 2026")).toBe(false);
    expect(fabProfile.detect("First Abu Dhabi Bank brochure with no statement layout")).toBe(false);
    expect(fabProfile.detect("")).toBe(false);
  });
});

describe("fabProfile.parse header", () => {
  const { account, warnings } = parseOk(fixture);
  it("normalises the IBAN without dashes", () => {
    expect(account.accountRef).toBe("AE" + "0".repeat(21));
    expect(account.currency).toBe("AED");
  });
  it("reads the period", () => {
    expect(account.periodStart).toBe("2026-07-01");
    expect(account.periodEnd).toBe("2026-07-31");
  });
  it("reads opening and closing balances", () => {
    expect(account.openingBalance).toBe(10000);
    expect(account.closingBalance).toBe(6500);
  });
  it("has no warnings and reconciles to the cent", () => {
    expect(warnings).toEqual([]);
    expect(account.reconciliation.status).toBe("ok");
    expect(account.reconciliation.difference).toBe(0);
    expect(account.reconciliation.brokenBalanceRows).toEqual([]);
  });
});

describe("fabProfile.parse transactions", () => {
  const { account } = parseOk(fixture);
  const expected: [string, string, number, number][] = [
    ["2026-07-01", "2026-07-01", -250, 9750],
    ["2026-07-02", "2026-07-02", 1500, 11250],
    ["2026-07-03", "2026-07-03", -4000, 7250],
    ["2026-07-05", "2026-07-05", -0.49, 7249.51],
    ["2026-07-05", "2026-07-05", -5000, 2249.51],
    ["2026-07-10", "2026-07-10", 3000, 5249.51],
    ["2026-07-12", "2026-07-12", -1249.51, 4000],
    ["2026-07-15", "2026-07-15", -3500, 500],
    ["2026-07-20", "2026-07-20", 6000, 6500],
  ];

  it("parses exactly the nine rows with exact dates, signed amounts and balances", () => {
    expect(account.transactions).toHaveLength(expected.length);
    expected.forEach(([date, valueDate, amount, balance], i) => {
      const t = account.transactions[i];
      expect(t.index).toBe(i);
      expect(t.bank).toBe("fab");
      expect(t.currency).toBe("AED");
      expect(t.date).toBe(date);
      expect(t.valueDate).toBe(valueDate);
      expect(t.amount).toBe(amount);
      expect(t.balance).toBe(balance);
      expect(t.debit).toBe(amount < 0 ? -amount : null);
      expect(t.credit).toBe(amount > 0 ? amount : null);
    });
  });

  it("infers both signs from the running balance", () => {
    expect(account.transactions[0].amount).toBeLessThan(0); // balance fell
    expect(account.transactions[1].amount).toBeGreaterThan(0); // balance rose
    expect(account.transactions[3].debit).toBe(0.49);
  });

  it("handles a date pair alone on its line with the description on the next", () => {
    expect(account.transactions[2].description).toBe("Transfer");
    expect(account.transactions[3].description).toBe("IPP Charges Instant Payment");
  });

  it("builds labels and joins wrapped descriptions", () => {
    expect(account.transactions[0].description).toBe("UADDS Cr Trf");
    expect(account.transactions[0].rawDescription).toBe("UADDS Cr Trf 501PY-000000000000000000000EXMPL 5000000000000001");
    expect(account.transactions[1].description).toBe("Inward IPP Payment Inward Instant Payment");
    expect(account.transactions[1].rawDescription).toContain("Inward Instant Payment,IPP Ref: INSTX0aa11111f00,Remitter Info");
    expect(account.transactions[3].rawDescription).toContain("Pay Dtls: WidgInvoice 1001");
  });

  it("extracts references", () => {
    expect(account.transactions[0].reference).toBeNull();
    expect(account.transactions[1].reference).toBe("INSTX0aa11111f00");
    expect(account.transactions[3].reference).toBe("I00" + "0A0A0000000000000000000000AA");
  });

  it("appends the continuation fragment after 'Balance brought forward' to the last row of the previous sheet", () => {
    const t = account.transactions[4];
    expect(t.description).toBe("IPP Transfer Instant Payment");
    expect(t.reference).toBe("I9" + "B0B0000000000000000000000BB");
    expect(t.rawDescription).toContain("Pay Dtls: Rent July 2026");
    // not a transaction and not leaked into the next row
    expect(account.transactions[5].rawDescription.startsWith("Inward IPP Payment")).toBe(true);
    expect(account.transactions.some((x) => /Balance (carried|brought) forward/i.test(x.rawDescription))).toBe(false);
  });

  it("does not turn page headers into transactions", () => {
    expect(account.transactions.some((x) => /DATEVALUE|ACCOUNT STATEMENT|Sheet no/i.test(x.rawDescription))).toBe(false);
  });
});

describe("fabProfile.parse failure and verification paths", () => {
  it("flags a tampered balance as a mismatch", () => {
    const tampered = fixture.replace("7,249.51", "7,248.51");
    const { account, warnings } = parseOk(tampered);
    expect(account.reconciliation.status).toBe("mismatch");
    expect(account.reconciliation.brokenBalanceRows.length).toBeGreaterThan(0);
    expect(warnings.some((w) => /does not equal the printed amount/.test(w))).toBe(true);
    expect(warnings.some((w) => /Reconciliation mismatch/.test(w))).toBe(true);
  });

  it("warns when the printed totals disagree with the parsed rows", () => {
    const wrongTotals = fixture.replaceAll("Tot. Debit Amnt.     :14,000.00", "Tot. Debit Amnt.     :13,000.00");
    const { account, warnings } = parseOk(wrongTotals);
    expect(account.reconciliation.status).toBe("ok");
    expect(warnings).toContain("Printed debit total does not match the parsed rows.");
    const wrongCount = fixture.replaceAll("Total Credit Txns   :3", "Total Credit Txns   :4");
    expect(parseOk(wrongCount).warnings).toContain("Printed credit count does not match the parsed rows.");
  });

  it("returns no_transactions when a recognised statement has no rows", () => {
    const head = fixture.split("\n").slice(0, 29).join("\n");
    const out = fabProfile.parse(head);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure.code).toBe("no_transactions");
      expect(out.failure.bank).toBe("fab");
    }
  });
});
