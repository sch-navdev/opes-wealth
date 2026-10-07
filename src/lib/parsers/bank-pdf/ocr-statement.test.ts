/**
 * SYNTHETIC OCR documents only (fake names / IBANs / amounts). They exercise the generic parser;
 * they do NOT prove anything about real HSBC / CBI OCR output.
 */
import { describe, expect, it } from "vitest";
import { cbiProfile, CBI_OCR_SPEC } from "./cbi";
import { HSBC_UAE_OCR_SPEC, hsbcProfile } from "./hsbc";
import { parseOcrTableStatement, type OcrStatementSpec } from "./ocr-statement";
import type { OcrDocument } from "./ocr-types";

const HSBC_LINES = [
  "HSBC Bank Middle East Limited",
  "Statement of Account",
  "IBAN AE070331234567890123456",
  "CCY AED",
  "01 Feb 2026 to 28 Feb 2026",
];

const HEADER = ["Date", "Transaction details", "Withdrawals", "Deposits", "Balance"];

function hsbcDoc(opts: { header?: string[]; withdrawal?: string } = {}): OcrDocument {
  return {
    pages: [
      {
        lines: HSBC_LINES,
        tables: [
          {
            rows: [
              opts.header ?? HEADER,
              ["", "Balance brought forward", "", "", "10,000.00"],
              ["01 Feb", "TRANSFER TO FAKE PERSON", "500.00", "", "9,500.00"],
              ["", "REF 12345 FAKE", "", "", ""],
              ["03 Feb", "SALARY FAKE CO", "", "2,000.00", "11,500.00"],
              ["05 Feb", "ATM WITHDRAWAL", opts.withdrawal ?? "1,200.50", "", "10,299.50"],
              ["", "Total", "1,700.50", "2,000.00", ""],
              ["", "Closing balance", "", "", "10,299.50"],
            ],
          },
        ],
      },
    ],
  };
}

describe("parseOcrTableStatement (HSBC-style synthetic table)", () => {
  it("reads rows and reconciles to ok", () => {
    const out = parseOcrTableStatement(hsbcDoc(), HSBC_UAE_OCR_SPEC);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.statement.source).toBe("ocr");
    expect(out.statement.warnings[0]).toMatch(/verify every row/);
    const acc = out.statement.accounts[0];
    expect(acc.currency).toBe("AED");
    expect(acc.accountRef).toBe("AE070331234567890123456");
    expect(acc.periodStart).toBe("2026-02-01");
    expect(acc.openingBalance).toBe(10000);
    expect(acc.closingBalance).toBe(10299.5);
    expect(acc.transactions.map((t) => [t.date, t.amount, t.balance])).toEqual([
      ["2026-02-01", -500, 9500],
      ["2026-02-03", 2000, 11500],
      ["2026-02-05", -1200.5, 10299.5],
    ]);
    expect(acc.transactions[0].description).toBe("TRANSFER TO FAKE PERSON REF 12345 FAKE");
    expect(acc.reconciliation.status).toBe("ok");
  });

  it("tolerates OCR noise in header words", () => {
    const out = parseOcrTableStatement(
      hsbcDoc({ header: ["Date", "Transaction detalls", "Withdrawais", "Depos1ts", "Balance"] }),
      HSBC_UAE_OCR_SPEC,
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.statement.accounts[0].reconciliation.status).toBe("ok");
  });

  it("flags a misread digit as mismatch and does not auto-fix it", () => {
    const out = parseOcrTableStatement(hsbcDoc({ withdrawal: "1,280.50" }), HSBC_UAE_OCR_SPEC);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const acc = out.statement.accounts[0];
    expect(acc.transactions[2].amount).toBe(-1280.5);
    expect(acc.reconciliation.status).toBe("mismatch");
    expect(acc.reconciliation.brokenBalanceRows).toEqual([2]);
    expect(out.statement.warnings.join(" ")).toMatch(/Reconciliation mismatch/);
  });

  it("is unverified (not ok) when opening and closing balances are missing", () => {
    const doc = hsbcDoc();
    doc.pages[0].tables[0].rows = doc.pages[0].tables[0].rows.filter(
      (r) => !/brought forward|Closing/.test(r[1]),
    );
    const out = parseOcrTableStatement(doc, HSBC_UAE_OCR_SPEC);
    expect(out.ok && out.statement.accounts[0].reconciliation.status).toBe("unverified");
  });

  it("reuses the header on a later page's headerless table and ignores repeated B/F rows", () => {
    const doc = hsbcDoc();
    // move the last two data rows to a second page without a header, behind a B/F row
    const rows = doc.pages[0].tables[0].rows;
    const page2 = [
      ["", "Balance brought forward", "", "", "11,500.00"],
      ["05 Feb", "ATM WITHDRAWAL", "1,200.50", "", "10,299.50"],
      ["", "Closing balance", "", "", "10,299.50"],
    ];
    doc.pages[0].tables[0].rows = rows.slice(0, 5); // header, b/f, two txns + continuation
    doc.pages.push({ lines: [], tables: [{ rows: page2 }] });
    const out = parseOcrTableStatement(doc, HSBC_UAE_OCR_SPEC);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const acc = out.statement.accounts[0];
    expect(acc.transactions).toHaveLength(3);
    expect(acc.reconciliation.status).toBe("ok");
    expect(out.statement.warnings.join(" ")).toMatch(/no header row/);
  });

  it("reads a single Amount column with sign from the balance delta and Dr/Cr balances", () => {
    const spec: OcrStatementSpec = {
      ...HSBC_UAE_OCR_SPEC,
      headerAliases: { ...HSBC_UAE_OCR_SPEC.headerAliases, amount: ["amount"] },
    };
    const doc: OcrDocument = {
      pages: [
        {
          lines: ["HSBC", "Statement of Account"],
          tables: [
            {
              rows: [
                ["Date", "Details", "Amount", "Balance"],
                ["", "B/F", "", "100.00 CR"],
                ["01/02/2026", "SHOP", "30.00", "70.00 CR"],
                ["02/02/2026", "REFUND", "50.00", "120.00 CR"],
                ["03/02/2026", "BIG PURCHASE", "200.00 DR", "80.00 DR"],
                ["", "Closing balance", "", "80.00 DR"],
              ],
            },
          ],
        },
      ],
    };
    const out = parseOcrTableStatement(doc, spec);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const acc = out.statement.accounts[0];
    expect(acc.transactions.map((t) => t.amount)).toEqual([-30, 50, -200]);
    expect(acc.transactions[2].balance).toBe(-80);
    expect(acc.reconciliation.status).toBe("ok");
  });

  it("falls back to text lines when OCR found no table, with a warning", () => {
    const doc: OcrDocument = {
      pages: [
        {
          lines: [
            "HSBC",
            "Statement of Account",
            "Opening Balance 1,000.00",
            "01/02/2026 FAKE SHOP 100.00 900.00",
            "02/02/2026 SALARY FAKE CO 500.00 1,400.00",
            "Closing Balance 1,400.00",
          ],
          tables: [],
        },
      ],
    };
    const out = parseOcrTableStatement(doc, HSBC_UAE_OCR_SPEC);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.statement.warnings.join(" ")).toMatch(/plain text lines/);
    const acc = out.statement.accounts[0];
    expect(acc.transactions.map((t) => t.amount)).toEqual([-100, 500]);
    expect(acc.reconciliation.status).toBe("ok");
  });

  it("fails with no_transactions when nothing parses", () => {
    const out = parseOcrTableStatement({ pages: [{ lines: ["HSBC", "Statement of Account"], tables: [] }] }, HSBC_UAE_OCR_SPEC);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.code).toBe("no_transactions");
  });
});

describe("profiles (OCR)", () => {
  it("hsbc detects OCR statements and keeps text behaviour", () => {
    expect(hsbcProfile.detectOcr?.(hsbcDoc())).toBe(true);
    expect(hsbcProfile.detectOcr?.({ pages: [{ lines: ["Statement of Account"], tables: [] }] })).toBe(false);
    expect(hsbcProfile.parseOcr?.(hsbcDoc())).toMatchObject({ ok: true });
  });

  it("cbi parses a generic Debit/Credit table; text detect is always false", () => {
    const doc: OcrDocument = {
      pages: [
        {
          lines: ["Commercial Bank International", "Account Statement", "Currency USD"],
          tables: [
            {
              rows: [
                ["Date", "Description", "Debit", "Credit", "Balance"],
                ["", "Opening Balance", "", "", "500.00"],
                ["10/03/2026", "FAKE PAYMENT", "50.00", "", "450.00"],
                ["11/03/2026", "FAKE DEPOSIT", "", "25.00", "475.00"],
                ["", "Closing Balance", "", "", "475.00"],
              ],
            },
          ],
        },
      ],
    };
    expect(cbiProfile.detect("Commercial Bank International statement")).toBe(false);
    expect(cbiProfile.detectOcr?.(doc)).toBe(true);
    const out = parseOcrTableStatement(doc, CBI_OCR_SPEC);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.statement.bank).toBe("cbi");
    expect(out.statement.accounts[0].currency).toBe("USD");
    expect(out.statement.accounts[0].reconciliation.status).toBe("ok");
  });
});
