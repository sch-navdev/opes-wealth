/**
 * HSBC UAE profile.
 *
 * HONEST SCOPE: there is NO verified HSBC UAE text layout for transaction rows. The HSBC UAE
 * "Statement of Account" PDFs we have seen carry only the legal boilerplate as text (terms,
 * abbreviations: zero dates, zero amounts); the transaction pages are images. So the only case
 * handled is `image_only`. If a different HSBC export does contain dated rows with amounts we
 * return `unsupported` rather than invent a layout. For TEXT input this profile never returns `ok: true`.
 *
 * OCR path (`detectOcr`/`parseOcr`): UNVERIFIED AGAINST REAL OCR OUTPUT. Nobody has seen Textract's
 * reading of an HSBC UAE transaction page. `HSBC_UAE_OCR_SPEC` is a GENERIC header-driven spec
 * (Date / Transaction details / Withdrawals / Deposits / Balance, plus generic synonyms); the only
 * vocabulary taken from the real HSBC UAE terms page is the abbreviations `B/F` (balance brought
 * forward), `CR`, `DR`, `CCY`. Correctness rests on reconciliation (`status: "mismatch"` when OCR
 * misreads a figure), not on any assumed layout.
 */
import { parseOcrTableStatement, type OcrStatementSpec } from "./ocr-statement";
import type { OcrDocument } from "./ocr-types";
import type { BankPdfProfile, PdfParseOutcome } from "./types";

export const HSBC_UAE_OCR_SPEC: OcrStatementSpec = {
  bank: "hsbc_uae",
  bankName: "HSBC UAE",
  currencyDefault: "AED",
  dateFormats: ["DD/MM/YYYY", "DD-MM-YYYY", "DD MMM YYYY", "DD MMM"],
  headerAliases: {
    date: ["date", "transaction date", "posting date"],
    valueDate: ["value date"],
    description: ["transaction details", "details", "description", "particulars", "narrative"],
    debit: ["withdrawals", "withdrawal", "debit", "debits", "paid out"],
    credit: ["deposits", "deposit", "credit", "credits", "paid in"],
    balance: ["balance", "running balance"],
  },
  openingLabels: ["balance brought forward", "opening balance", "b/f"],
  closingLabels: ["closing balance", "balance carried forward", "c/f"],
};

const OCR_STATEMENT_MARKERS = ["statement of account", "account statement", "opening balance", "balance brought forward", "b/f"];

const MARKERS = [
  "following services are included in this statement of account",
  "information about your statement of accounts",
  "amanah current accounts",
];

// Dated line with a decimal amount: "12 Feb 2026 ... 1,234.56" or "12/02/2026 ... 99.00".
const TX_ROW =
  /(?:\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4}\b)[^\n]*\d[\d,]*\.\d{2}\b/;

export const hsbcProfile: BankPdfProfile = {
  id: "hsbc_uae",
  name: "HSBC UAE",
  detect(text) {
    const t = text.replace(/\s+/g, " ").toLowerCase();
    if (!t.includes("hsbc") && !t.includes("amanah")) return false;
    return MARKERS.some((m) => t.includes(m));
  },
  parse(text): PdfParseOutcome {
    if (!TX_ROW.test(text)) {
      return {
        ok: false,
        failure: {
          code: "image_only",
          bank: "hsbc_uae",
          message:
            "HSBC UAE statement recognised but its transaction pages are images; the text layer holds only boilerplate. Export a CSV or use OCR.",
        },
      };
    }
    return {
      ok: false,
      failure: {
        code: "unsupported",
        bank: "hsbc_uae",
        message:
          "HSBC UAE statement contains transaction-like text, but no verified text layout exists for it; refusing to guess.",
      },
    };
  },
  detectOcr(doc: OcrDocument) {
    const t = doc.pages.flatMap((p) => p.lines).join(" ").replace(/\s+/g, " ").toLowerCase();
    return t.includes("hsbc") && OCR_STATEMENT_MARKERS.some((m) => t.includes(m));
  },
  parseOcr(doc: OcrDocument) {
    return parseOcrTableStatement(doc, HSBC_UAE_OCR_SPEC);
  },
};
