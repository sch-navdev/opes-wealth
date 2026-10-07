import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectBankPdf, parseBankStatementPdfText } from "@/lib/parsers/bank-pdf";

/**
 * Synthetic HSBC UAE credit card statement in the layout of a real one (page-1 header, the
 * "Total Outstanding on Statement Date explained" labels then seven figures, per-transaction
 * blocks closed by a lone "-", foreign rows with rate and fee lines, "CR" credits, a supplementary
 * card, page breaks with repeated headers, Arabic labels). All names, numbers and amounts are
 * invented; the arithmetic is consistent so reconciliation is exact.
 */
const COLS = `تفاصيل معاملاتك لهذا الشهر
Details of your transactions this month
تاريخ المعاملة
Transaction Date Posting Date Transaction Details Original Amount VAT Total Amount (AED) `;

const PAGE_BREAK = `
Credit Card Statement
Page 5 of 9
كشف حساب البطاقة الائتمانية
${COLS}`;

function head(opts: { prev: string; pay: string; purch: string; interest?: string; fees: string; vat: string; closing: string; openingLine?: string }): string {
  return `Together we thrive
To protect yourself from fraud when using your HSBC cards online, check the PIN message.
Credit Card Statement
MR EXAMPLE PERSON
1 Sample Street
Dubai
Credit Card Number
4000-1234-0000-9999
Statement DatePayment Due Date
Total Outstanding on Statement Date*Total Amount payable for this statement**
10 March 2027 4 April 2027
Page 1 of 9

Credit Card Statement
Total Outstanding on Statement Date explained
Total Outstanding (Previous Statement)
(-)  Payment/Reversals/Other Credits
(+) New Purchases/Cash Advances/Other Debits
(+) Finance Charges/Interest
(+) Fees
(+) VAT
Total Outstanding (Current Statement)
${opts.prev}
${opts.pay}
${opts.purch}
${opts.interest ?? "0.00"}
${opts.fees}
${opts.vat}
${opts.closing}
Page 2 of 9
${COLS}
Opening Balance
${opts.openingLine ?? opts.prev}
`;
}

const ROWS = `02-Feb-27 03-Feb-27
PAY BY 001-000000-001
1,000.00 CR               1,000.00 CR
-
4000 0000 0000 9999
JANE EXAMPLE
05-Feb-27 06-Feb-27
EXAMPLE MARKET
DUBAI         ARE
120.50               120.50
-
07-Feb-27 08-Feb-27
ACME SOFTWARE INC     SAN JOSE      CA
USD/AED         .272200000
USD 100.00 367.38
FOREIGN CURRENCY PROCESSING FEE 7.35 0.37
STND PROC. FEE (AS PER SCHEMES) 5.00 0.25 380.35
-
${PAGE_BREAK}
4000 1234 0000 8888
JOHN EXAMPLE
10-Feb-27 11-Feb-27
EXAMPLE CAFE
35.00                35.00
-
12-Feb-27 13-Feb-27
EXAMPLE STORE         DUBAI         UAE
40.00 CR              40.00 CR
-
14-Feb-27 14-Feb-27
OTHER SOFTWARE LTD    LONDON        GBR
USD/AED         .272200000
USD 10.00 CR 36.74 CR
REVRSL. OF FOREIGN CURRENCY PROC.  FEE 0.73 CR 0.04 CR
REVRSL OF STND PROC. FEE(AS PER SCHEMES) 0.50 CR 0.03 CR 38.04 CR
-
20-Feb-27 20-Feb-27
TO 4000 1234 0000 9999
500.00 CR            500.00 CR
-
${PAGE_BREAK}
03-Sept-27 03-Sept-27
LATE CHARGE ASSESSMENT
250.00 12.50 262.50
-
Dear Customer, we hope you are enjoying your card. 12.00 is not a transaction.
Glossary / Definitions:
1. Annual Fees – Annual maintenance fees applicable to HSBC credit cards.
Page 9 of 9
`;

const SAMPLE =
  head({ prev: "1,000.00", pay: "1,576.74", purch: "522.88", fees: "261.12", vat: "13.05", closing: "220.31" }) + ROWS;

describe("HSBC UAE credit card PDF profile", () => {
  it("is detected, and neither claims current-account or other-bank text nor is claimed by them", () => {
    expect(detectBankPdf(SAMPLE)?.id).toBe("hsbc_uae_card");
    const current = readFileSync(join(__dirname, "fixtures", "hsbc-image-only.txt"), "utf8");
    expect(detectBankPdf(current)?.id).toBe("hsbc_uae");
    expect(detectBankPdf("Statement of Account only")).toBeNull();
    // Card-looking text from no HSBC statement is not claimed.
    expect(detectBankPdf(SAMPLE.replace(/HSBC/gi, "XXXX"))).toBeNull();
    // HSBC text without the card layout is not claimed.
    expect(detectBankPdf("HSBC Bank Middle East Limited. Credit Card Number only")).toBeNull();
  });

  it("parses rows with signs, foreign and fee lines, supplementary card and page breaks; reconciles to the cent", () => {
    const out = parseBankStatementPdfText(SAMPLE, { numPages: 9 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.statement.bank).toBe("hsbc_uae_card");
    expect(out.statement.warnings).toEqual([]);
    const acc = out.statement.accounts[0];
    expect(out.statement.accounts).toHaveLength(1);
    expect(acc.currency).toBe("AED");
    expect(acc.accountRef).toBe("400012******9999");
    expect(acc.periodEnd).toBe("2027-03-10");
    // Owed balances are negative in the repo's signed convention.
    expect(acc.openingBalance).toBe(-1000);
    expect(acc.closingBalance).toBe(-220.31);
    expect(acc.reconciliation).toMatchObject({ status: "ok", difference: 0, brokenBalanceRows: [] });
    expect(acc.transactions.map((t) => [t.date, t.valueDate, t.amount])).toEqual([
      ["2027-02-02", "2027-02-03", 1000],
      ["2027-02-05", "2027-02-06", -120.5],
      ["2027-02-07", "2027-02-08", -380.35],
      ["2027-02-10", "2027-02-11", -35],
      ["2027-02-12", "2027-02-13", 40],
      ["2027-02-14", "2027-02-14", 38.04],
      ["2027-02-20", "2027-02-20", 500],
      ["2027-09-03", "2027-09-03", -262.5],
    ]);
    const [pay, market, fx, , refund, reversal, transfer, late] = acc.transactions;
    expect(pay).toMatchObject({ credit: 1000, debit: null, balance: null, bank: "hsbc_uae_card" });
    expect(market.description).toBe("EXAMPLE MARKET DUBAI ARE");
    expect(market.debit).toBe(120.5);
    expect(fx.description).toBe("ACME SOFTWARE INC SAN JOSE CA (USD 100.00)");
    expect(fx.rawDescription).toContain("USD/AED");
    expect(refund.credit).toBe(40);
    expect(reversal.credit).toBe(38.04);
    expect(late.description).toBe("LATE CHARGE ASSESSMENT");
    // Card numbers inside descriptions are masked.
    expect(transfer.description).toBe("TO •••• •••• •••• 9999");
    expect(JSON.stringify(out)).not.toContain("1234 0000");
    // The trailing marketing text and glossary are not read as rows.
    expect(acc.transactions).toHaveLength(8);
  });

  it("keeps a credit balance positive (CR on the opening line and in the summary)", () => {
    const text =
      head({ prev: "50.00 CR", pay: "0.00", purch: "40.00", fees: "0.00", vat: "0.00", closing: "10.00 CR", openingLine: "50.00\nCR" }) +
      `05-Feb-27 06-Feb-27
EXAMPLE MARKET
40.00                40.00
-
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

  it("accepts the new-layout period line", () => {
    const text = SAMPLE.replace("Statement DatePayment Due Date", "Statement Period Payment Due Date").replace(
      "10 March 2027 4 April 2027",
      "From 03 February 27 to 02 March 27\n27 March 2027",
    );
    const out = parseBankStatementPdfText(text, { numPages: 9 });
    expect(out.ok && out.statement.accounts[0].periodStart).toBe("2027-02-03");
    expect(out.ok && out.statement.accounts[0].periodEnd).toBe("2027-03-02");
  });

  it("returns ok with a warning for a statement without transactions that carries the balance over", () => {
    const text = head({ prev: "100.00", pay: "0.00", purch: "0.00", fees: "0.00", vat: "0.00", closing: "100.00" });
    const out = parseBankStatementPdfText(text, { numPages: 3 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.statement.warnings.join(" ")).toMatch(/no transactions/i);
    expect(out.statement.accounts[0].transactions).toEqual([]);
    expect(out.statement.accounts[0].reconciliation.status).toBe("ok");
  });

  it("fails with no_transactions when rows are missing but the balance moved", () => {
    const text = head({ prev: "100.00", pay: "0.00", purch: "50.00", fees: "0.00", vat: "0.00", closing: "150.00" });
    const out = parseBankStatementPdfText(text, { numPages: 3 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure).toMatchObject({ code: "no_transactions", bank: "hsbc_uae_card" });
  });

  it("surfaces a mismatch instead of correcting numbers", () => {
    const out = parseBankStatementPdfText(SAMPLE.replace("120.50               120.50", "121.50               121.50"), { numPages: 9 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const acc = out.statement.accounts[0];
    expect(acc.transactions[1].amount).toBe(-121.5);
    expect(acc.reconciliation).toMatchObject({ status: "mismatch", difference: -1 });
    expect(out.statement.warnings.join(" ")).toMatch(/printed total of purchases/);
  });

  it("flags fee lines that do not add up to the printed row total, and a missing summary", () => {
    const badFee = parseBankStatementPdfText(SAMPLE.replace("0.25 380.35", "0.25 380.36"), { numPages: 9 });
    expect(badFee.ok && badFee.statement.warnings.join(" ")).toMatch(/fee lines do not add up/);
    const noSummary = parseBankStatementPdfText(SAMPLE.replace("Total Outstanding on Statement Date explained", "Explained"), { numPages: 9 });
    expect(noSummary.ok).toBe(true);
    if (!noSummary.ok) return;
    expect(noSummary.statement.warnings.join(" ")).toMatch(/summary/);
    expect(noSummary.statement.accounts[0].reconciliation.status).toBe("unverified");
  });
});
