import { describe, expect, it } from "vitest";
import { ocrDocumentToText, parseBankStatementOcr } from "./index";
import type { OcrDocument } from "./ocr-types";

const hsbcDoc: OcrDocument = {
  pages: [
    {
      lines: ["HSBC Bank Middle East Limited", "Statement of Account", "01 Feb 2026 to 28 Feb 2026"],
      tables: [
        {
          rows: [
            ["Date", "Transaction details", "Withdrawals", "Deposits", "Balance"],
            ["", "B/F", "", "", "100.00"],
            ["02 Feb", "FAKE SHOP", "40.00", "", "60.00"],
            ["", "Closing balance", "", "", "60.00"],
          ],
        },
      ],
    },
  ],
};

describe("parseBankStatementOcr", () => {
  it("routes an HSBC OCR document to the HSBC profile", () => {
    const out = parseBankStatementOcr(hsbcDoc);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.statement.bank).toBe("hsbc_uae");
      expect(out.statement.source).toBe("ocr");
      expect(out.statement.accounts[0].reconciliation.status).toBe("ok");
    }
  });

  it("routes a CBI OCR document to the CBI profile", () => {
    const out = parseBankStatementOcr({
      pages: [
        {
          lines: ["Commercial Bank International", "Account Statement"],
          tables: [
            {
              rows: [
                ["Date", "Description", "Debit", "Credit", "Balance"],
                ["", "Opening Balance", "", "", "10.00"],
                ["01/03/2026", "FAKE", "", "5.00", "15.00"],
                ["", "Closing Balance", "", "", "15.00"],
              ],
            },
          ],
        },
      ],
    });
    expect(out.ok && out.statement.bank).toBe("cbi");
  });

  it("returns unsupported when nothing matches", () => {
    const out = parseBankStatementOcr({ pages: [{ lines: ["Grocery receipt", "Total 12.00"], tables: [] }] });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.code).toBe("unsupported");
  });

  it("returns no_transactions for a recognised statement without rows", () => {
    const out = parseBankStatementOcr({ pages: [{ lines: ["HSBC", "Statement of Account"], tables: [] }] });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.code).toBe("no_transactions");
  });

  it("returns unsupported for a forced unknown bank", () => {
    const out = parseBankStatementOcr(hsbcDoc, { bank: "nope" as never });
    expect(out.ok).toBe(false);
  });

  it("joins OCR lines for text profiles", () => {
    expect(ocrDocumentToText({ pages: [{ lines: ["a", "b"], tables: [] }, { lines: ["c"], tables: [] }] })).toBe("a\nb\nc");
  });
});
