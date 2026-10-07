import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectBankPdf, parseBankStatementPdfText } from "@/lib/parsers/bank-pdf";
import { fabProfile } from "./fab";
import { fabCardProfile } from "./fab-card";

/**
 * Synthetic FAB credit card statement in the layout of a real one (page-1 label block with
 * font-encoded Arabic gibberish, then the values: header line, card line, six-figure summary;
 * transaction rows with original and AED figures, credits with a wide gap, foreign and VAT rows,
 * a payment continuation line, a principal and a supplementary card section each closed by a
 * Total line, repeated page headers). Names, numbers and amounts are invented; the arithmetic is
 * consistent so reconciliation is exact.
 */
function row(d1: string, d2: string, desc: string, ccy: string, orig: string, total: string, credit = false): string {
  const gap = credit ? " ".repeat(22) : " ".repeat(8);
  return `${d1}  ${d2}  ${desc.padEnd(38)}  ${ccy}  ${orig.padStart(12)}${gap}${total}`;
}

function summaryBlock(opts: { prev: string; purch: string; cash?: string; fin: string; pay: string; total: string; current?: string }): string {
  return `Main Card Product
Main Card Number
Current Balance
Summary Details	*+,-
Previous Balance
+ Purchases/Debits
+ Cash Advances
+ Finance Charges
- Payments/Credits
Total Payment Due
Total Credit Limit
Available Credit Limit
See reverse side for important information..
FAB Rewards
Page 1 of 3
UAE Dirham Amount
D'(3	/9	2-E	F/	@,3
MR EXAMPLE PERSON
1 SAMPLE STREET
EXAMPLE CARD            10-03-2027 04-04-2027
10/03 / 2027
|1000000001
4000 12** **** 9999          ${opts.current ?? opts.total}               50.00
         ${opts.prev}       ${opts.purch}             ${opts.cash ?? "0.00"}            ${opts.fin}       ${opts.pay}       ${opts.total}
        50,000.00        40,000.00
`;
}

const MAIN_SECTION = `Main Card : 4000 12** **** 9999 EXAMPLE CARD
MR EXAMPLE PERSON
${row("01-02-2027", "01-02-2027", "PAYMENT RECEIVED - THANK YOU", "AED", "1,000.00", "1,000.00", true)}
                    Payment of AED 1000.00 received on
                    01-02-2027 towards Principle AED 1000;
${row("03-02-2027", "04-02-2027", "EXAMPLE MARKET         DUBAI         ARE", "AED", "120.50", "120.50")}
${row("05-02-2027", "06-02-2027", "ACME SOFTWARE INC     SAN JOSE      CA", "USD", "100.00", "367.38")}
${row("05-02-2027", "06-02-2027", "VAT ON SERVICE CHARGES", "USD", "100.00", "0.37")}
${row("09-02-2027", "09-02-2027", "FINANCE CHARGES", "AED", "15.25", "15.25")}
Total      503.50      1,000.00
`;

const PAGE_BREAK = `
Main Card Product
Main Card Number
Page 2 of 3
UAE Dirham Amount
D'(3	/9	2-E	F/	@,3
EXAMPLE CARD            10-03-2027 04-04-2027
4000 12** **** 9999       476.27             50.00
`;

const SUPP_SECTION = `Supplementary Card : 4000 12** **** 8888 EXAMPLE CARD
JANE EXAMPLE
${row("10-02-2027", "11-02-2027", "EXAMPLE CAFE           DUBAI         AE", "AED", "35.00", "35.00")}
${row("12-02-2027", "13-02-2027", "TO 4000 1234 0000 9999", "AED", "40.00", "40.00", true)}
${PAGE_BREAK}
${row("14-02-2027", "14-02-2027", "FAB REWARDS REDEMPTION - CASHBACK", "AED", "25.00", "25.00", true)}
${row("15-02-2027", "16-02-2027", "MARINE SHOP           LONDON N2 3N  GB", "EUR", ",67", "2.77")}
Total      37.77      65.00
تب علᘭك ᡨ ة عندئذ
0 FAB Rewards will expire by 20270410
Important Information-F	2-,9-
`;

const SAMPLE =
  summaryBlock({ prev: "1,000.00", purch: "526.02", fin: "15.25", pay: "1,040.00", total: "476.27" }) + MAIN_SECTION + SUPP_SECTION;

describe("FAB credit card PDF profile", () => {
  it("is detected, and never claims a FAB account statement nor is claimed by the account profile", () => {
    expect(detectBankPdf(SAMPLE)?.id).toBe("fab_card");
    expect(fabProfile.detect(SAMPLE)).toBe(false);
    const account = readFileSync(join(__dirname, "fixtures", "fab-statement.txt"), "utf8");
    expect(detectBankPdf(account)?.id).toBe("fab");
    expect(fabCardProfile.detect(account)).toBe(false);
    expect(detectBankPdf("Some other bank statement")).toBeNull();
    // Card labels from another bank, or FAB text without the card layout, are not claimed.
    expect(detectBankPdf(SAMPLE.replace(/FAB/g, "XXX"))).toBeNull();
    expect(fabCardProfile.detect("First Abu Dhabi Bank Main Card Number only")).toBe(false);
  });

  it("parses rows with signs, foreign, VAT and fee rows, two card sections and page breaks; reconciles to the cent", () => {
    const out = parseBankStatementPdfText(SAMPLE, { numPages: 3 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.statement.bank).toBe("fab_card");
    expect(out.statement.warnings).toEqual([]);
    expect(out.statement.accounts).toHaveLength(1);
    const acc = out.statement.accounts[0];
    expect(acc.currency).toBe("AED");
    expect(acc.accountRef).toBe("400012******9999");
    expect(acc.periodEnd).toBe("2027-03-10");
    expect(acc.openingBalance).toBe(-1000);
    expect(acc.closingBalance).toBe(-476.27);
    expect(acc.reconciliation).toMatchObject({ status: "ok", difference: 0, brokenBalanceRows: [] });
    expect(acc.transactions.map((t) => [t.date, t.valueDate, t.amount])).toEqual([
      ["2027-02-01", "2027-02-01", 1000],
      ["2027-02-03", "2027-02-04", -120.5],
      ["2027-02-05", "2027-02-06", -367.38],
      ["2027-02-05", "2027-02-06", -0.37],
      ["2027-02-09", "2027-02-09", -15.25],
      ["2027-02-10", "2027-02-11", -35],
      ["2027-02-12", "2027-02-13", 40],
      ["2027-02-14", "2027-02-14", 25],
      ["2027-02-15", "2027-02-16", -2.77],
    ]);
    const [pay, market, fx, vat, fin, , transfer, reward, eur] = acc.transactions;
    expect(pay).toMatchObject({ credit: 1000, debit: null, balance: null, bank: "fab_card", description: "PAYMENT RECEIVED - THANK YOU" });
    expect(pay.rawDescription).toContain("towards Principle");
    expect(market).toMatchObject({ debit: 120.5, description: "EXAMPLE MARKET DUBAI" });
    expect(fx.description).toBe("ACME SOFTWARE INC SAN JOSE (USD 100.00)");
    expect(vat.description).toBe("VAT ON SERVICE CHARGES (USD 100.00)");
    expect(fin.description).toBe("FINANCE CHARGES");
    expect(reward.credit).toBe(25);
    expect(eur.description).toBe("MARINE SHOP LONDON N2 3N (EUR 0,67)");
    expect(transfer.description).toBe("TO •••• •••• •••• 9999");
    expect(JSON.stringify(out)).not.toContain("1234 0000");
    // Page headers, Arabic lines and the closing text are not rows.
    expect(acc.transactions).toHaveLength(9);
  });

  it("keeps a credit balance positive (glued CR in the summary and card line)", () => {
    const text =
      summaryBlock({ prev: "50.00CR", purch: "40.00", fin: "0.00", pay: "0.00", total: "10.00CR" }) +
      `${row("05-02-2027", "06-02-2027", "EXAMPLE MARKET         DUBAI         AE", "AED", "40.00", "40.00")}
Total       40.00       0.00
`;
    const out = parseBankStatementPdfText(text, { numPages: 3 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.statement.warnings).toEqual([]);
    const acc = out.statement.accounts[0];
    expect(acc.openingBalance).toBe(50);
    expect(acc.closingBalance).toBe(10);
    expect(acc.reconciliation.status).toBe("ok");
  });

  it("returns ok with a warning for a statement without transactions that carries the balance over", () => {
    const text = summaryBlock({ prev: "100.00", purch: "0.00", fin: "0.00", pay: "0.00", total: "100.00" }) + "Total        0.00        0.00\n";
    const out = parseBankStatementPdfText(text, { numPages: 3 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.statement.warnings.join(" ")).toMatch(/no transactions/i);
    expect(out.statement.accounts[0].transactions).toEqual([]);
    expect(out.statement.accounts[0].reconciliation.status).toBe("ok");
  });

  it("fails with no_transactions when rows are missing but the balance moved", () => {
    const text = summaryBlock({ prev: "100.00", purch: "50.00", fin: "0.00", pay: "0.00", total: "150.00" });
    const out = parseBankStatementPdfText(text, { numPages: 3 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure).toMatchObject({ code: "no_transactions", bank: "fab_card" });
  });

  it("surfaces a mismatch instead of correcting numbers", () => {
    const out = parseBankStatementPdfText(SAMPLE.replace("120.50        120.50", "121.50        121.50"), { numPages: 3 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const acc = out.statement.accounts[0];
    expect(acc.transactions[1].amount).toBe(-121.5);
    expect(acc.reconciliation).toMatchObject({ status: "mismatch", difference: -1 });
    expect(out.statement.warnings.join(" ")).toMatch(/total of debits/);
  });

  it("warns about a credit read as a debit (total check), an unreadable row and a missing summary", () => {
    const flipped = parseBankStatementPdfText(SAMPLE.replace("40.00" + " ".repeat(22) + "40.00", "40.00" + " ".repeat(8) + "40.00"), { numPages: 3 });
    expect(flipped.ok && flipped.statement.warnings.join(" ")).toMatch(/total of credits/);
    expect(flipped.ok && flipped.statement.accounts[0].reconciliation.status).toBe("mismatch");

    const unreadable = parseBankStatementPdfText(SAMPLE.replace(/(\n10-02-2027  11-02-2027  EXAMPLE CAFE.*?)AED/, "$1"), { numPages: 3 });
    expect(unreadable.ok && unreadable.statement.warnings.join(" ")).toMatch(/could not be read/);

    const noSummary = parseBankStatementPdfText(SAMPLE.replace("Summary Details", "Summary Details").replace(/^ +1,000\.00 .*$/m, ""), { numPages: 3 });
    expect(noSummary.ok).toBe(true);
    if (!noSummary.ok) return;
    expect(noSummary.statement.warnings.join(" ")).toMatch(/summary/);
    expect(noSummary.statement.accounts[0].reconciliation.status).toBe("unverified");
  });
});
