/**
 * HSBC UAE profile.
 *
 * HONEST SCOPE: there is NO verified HSBC UAE text layout for transaction rows. The HSBC UAE
 * "Statement of Account" PDFs we have seen carry only the legal boilerplate as text (terms,
 * abbreviations: zero dates, zero amounts); the transaction pages are images. So the only case
 * handled is `image_only`. If a different HSBC export does contain dated rows with amounts we
 * return `unsupported` rather than invent a layout. For TEXT input this profile never returns `ok: true`.
 *
 * OCR path (`detectOcr`/`parseOcr`): the real "Composite Statement" layout (one block per account, undated
 * repeated B/F lines, multi-line transactions closed by a REF line, dates only on the first transaction of a
 * day) is read by `hsbc-ocr.ts` from geometry (`OcrPage.boxes`) or, without boxes, from lines. It was built
 * from the printed pages seen visually: NO real Textract output has been seen yet. When no account block is
 * recognised the generic header-driven table parser (`HSBC_UAE_OCR_SPEC`, UNVERIFIED) runs as a fallback.
 * Correctness rests on reconciliation (`status: "mismatch"` when OCR misreads a figure) and on the printed
 * Transaction Summary / Count cross-checks, never on silent corrections.
 */
import { hsbcCompositeOutcome } from "./hsbc-ocr";
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

const OCR_STATEMENT_MARKERS = [
  "statement of account",
  "account statement",
  "opening balance",
  "balance brought forward",
  "b/f",
  "composite statement",
  "transaction details",
];

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
    const t = doc.pages
      .flatMap((p) => (p.lines.length > 0 ? p.lines : (p.boxes ?? []).map((b) => b.text)))
      .join(" ")
      .replace(/\s+/g, " ")
      .toLowerCase();
    if (t.includes("hsbc") && OCR_STATEMENT_MARKERS.some((m) => t.includes(m))) return true;
    // The logo is an image: the word HSBC may not be read, but the composite layout with an AE IBAN is distinctive.
    return t.includes("composite statement") && /iban\s*-?\s*ae/.test(t) && t.includes("transaction details");
  },
  parseOcr(doc: OcrDocument) {
    return hsbcCompositeOutcome(doc) ?? parseOcrTableStatement(doc, HSBC_UAE_OCR_SPEC);
  },
};
