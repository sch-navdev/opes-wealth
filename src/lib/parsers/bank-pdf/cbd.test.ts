import { describe, expect, it } from "vitest";
import { detectBankPdf, parseBankStatementPdfText } from "@/lib/parsers/bank-pdf";

/**
 * Synthetic CBD statement in the layout of a real one (value date, amount and balance glued
 * together, multi-line descriptions, Arabic labels and repeated page footers). All names,
 * numbers and amounts are invented; the arithmetic is consistent so reconciliation is exact.
 */
const FOOTER = `For fees & charges and terms & conditions, please visit www.cbd.ae. Please inform us of any changes to your
details registered with the Bank.
Commercial Bank of Dubai PSC, Dubai, UAE, licensed by the Central Bank of the UAE.
customercare@cbd.ae
على تغییرات بأي إبلاغنا يرجى
Page 1 of 2`;

const SAMPLE = `
Statement of Account : 1010001234الحساب كشف
Period :01/11/2025 - 30/11/2025الفترة
Acct. No.1010001234الحساب رقمDate02/12/2025التاریخ
IBANAE070230000001010001234المصرفیة للحسابات الدولي الرمزAcct. TypeCIAالحساب نوع
CurrencyArab Emirates Dirham - AEDالعملة
Date
التاریخ
Description
Value Date
Debit
Credit
Balance
Balance Brought FWD10,000.00
01/11/2025_99OTT00000000001_IPI_JANE DOE -HOF01/11/20252,000.008,000.00
03/11/2025
VILLA TEST_VO25110300000001_JOHN
ROE_DOMESTIC O/W REMITTANCE -HOF
03/11/2025600.007,400.00
03/11/2025
VO25110300000001_DOMESTIC OUTWARD REMITTANCE
CHARGES
03/11/20251.057,398.95
${FOOTER}
05/11/2025
ELECTRON 440885******0000 SOME SHOP
DUBAI
05/11/20251,000.006,398.95
28/11/2025
SAL_[/REF/SALARY NOVEMBER
2025]_ACME LTD -HOF
28/11/20253,500.009,898.95
ITEM COUNT:5
TURN OVER :3,601.053,500.00
********END OF STATEMENT*******
${FOOTER}
`;

describe("CBD statement PDF profile", () => {
  it("is detected from the text", () => {
    expect(detectBankPdf(SAMPLE)?.id).toBe("cbd");
    expect(detectBankPdf("Statement of Account only")).toBeNull();
  });

  it("parses one-line and multi-line rows, signs from the running balance, and reconciles", () => {
    const out = parseBankStatementPdfText(SAMPLE, { numPages: 2 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const [account] = out.statement.accounts;
    expect(out.statement.bank).toBe("cbd");
    expect(out.statement.warnings).toEqual([]);
    expect(account).toMatchObject({
      accountRef: "AE070230000001010001234",
      currency: "AED",
      periodStart: "2025-11-01",
      periodEnd: "2025-11-30",
      openingBalance: 10000,
      closingBalance: 9898.95,
    });
    expect(account.transactions.map((t) => [t.date, t.amount, t.balance])).toEqual([
      ["2025-11-01", -2000, 8000],
      ["2025-11-03", -600, 7400],
      ["2025-11-03", -1.05, 7398.95],
      ["2025-11-05", -1000, 6398.95],
      ["2025-11-28", 3500, 9898.95],
    ]);
    expect(account.transactions[1].description).toBe("VILLA TEST_VO25110300000001_JOHN ROE_DOMESTIC O/W REMITTANCE -HOF");
    expect(account.transactions[0].valueDate).toBe("2025-11-01");
    expect(account.reconciliation.status).toBe("ok");
  });

  it("does not leak page footers or Arabic lines into descriptions", () => {
    const out = parseBankStatementPdfText(SAMPLE, { numPages: 2 });
    if (!out.ok) throw new Error("expected ok");
    for (const t of out.statement.accounts[0].transactions) {
      expect(t.description).not.toMatch(/cbd\.ae|Page \d|Commercial Bank|[؀-ۿ]/);
    }
  });

  it("flags a mismatch instead of correcting a row whose amount disagrees with the balance", () => {
    const broken = SAMPLE.replace("03/11/2025600.007,400.00", "03/11/2025500.007,400.00");
    const out = parseBankStatementPdfText(broken, { numPages: 2 });
    if (!out.ok) throw new Error("expected ok");
    expect(out.statement.accounts[0].reconciliation.status).toBe("mismatch");
    expect(out.statement.warnings.join(" ")).toMatch(/turn over/i);
  });

  it("reads overdrawn balances printed with a trailing minus (and an overdrawn opening balance)", () => {
    const text = `Commercial Bank of Dubai
Statement of Account : 1010001234
Currency Arab Emirates Dirham - AED
Balance Brought FWD500.00-
02/11/2025
SOME SHOP
ABC
02/11/2025300.00800.00-
05/11/2025_99OTT00000000002_IPI_JANE DOE -HOF05/11/20254,000.003,200.00
TURN OVER :300.004,000.00
`;
    const out = parseBankStatementPdfText(text, { numPages: 1 });
    if (!out.ok) throw new Error("expected ok");
    const a = out.statement.accounts[0];
    expect(a.openingBalance).toBe(-500);
    expect(a.transactions.map((t) => [t.amount, t.balance])).toEqual([[-300, -800], [4000, 3200]]);
    expect(a.reconciliation.status).toBe("ok");
    expect(out.statement.warnings).toEqual([]);
  });

  it("reports no_transactions when the layout matches but no rows exist", () => {
    const out = parseBankStatementPdfText("Commercial Bank of Dubai\nStatement of Account : 1\nBalance Brought FWD1.00\n", { numPages: 1 });
    expect(out).toMatchObject({ ok: false, failure: { code: "no_transactions", bank: "cbd" } });
  });

  it("can be forced with opts.bank", () => {
    const out = parseBankStatementPdfText(SAMPLE.replace("Commercial Bank of Dubai", "CBD"), { numPages: 2, bank: "cbd" });
    expect(out.ok).toBe(true);
  });
});
