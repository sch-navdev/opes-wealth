/**
 * Commercial Bank International (CBI) profile — OCR path only.
 *
 * UNVERIFIED AGAINST REAL OCR OUTPUT: no real CBI statement sample was available (the only "CBI"
 * file in the archive turned out to be a driving licence). Nothing here describes a real CBI
 * layout. `CBI_OCR_SPEC` is a GENERIC English statement spec (Date / Description / Debit / Credit
 * / Balance with common synonyms); the generic parser finds the table by its header row, and
 * reconciliation (`status: "mismatch"`) is the safety net when the OCR misreads a figure.
 *
 * `detect` (text input) is always false: there is no text-layer sample to fingerprint.
 */
import { parseOcrTableStatement, type OcrStatementSpec } from "./ocr-statement";
import type { OcrDocument } from "./ocr-types";
import type { BankPdfProfile } from "./types";

export const CBI_OCR_SPEC: OcrStatementSpec = {
  bank: "cbi",
  bankName: "Commercial Bank International (CBI)",
  currencyDefault: "AED",
  dateFormats: ["DD/MM/YYYY", "DD-MM-YYYY", "DD MMM YYYY", "DD MMM"],
  headerAliases: {
    date: ["date", "transaction date", "posting date"],
    valueDate: ["value date"],
    description: ["description", "details", "transaction details", "narration", "narrative", "particulars"],
    debit: ["debit", "debits", "withdrawals", "withdrawal", "dr"],
    credit: ["credit", "credits", "deposits", "deposit", "cr"],
    balance: ["balance", "running balance"],
  },
  openingLabels: ["opening balance", "balance brought forward", "b/f"],
  closingLabels: ["closing balance", "balance carried forward", "c/f"],
};

const MARKERS = ["statement of account", "account statement", "opening balance", "balance brought forward", "closing balance"];

export const cbiProfile: BankPdfProfile = {
  id: "cbi",
  name: "Commercial Bank International (CBI)",
  detect: () => false,
  parse: () => ({
    ok: false,
    failure: { code: "unsupported", bank: "cbi", message: "CBI statements are only supported through OCR." },
  }),
  detectOcr(doc: OcrDocument) {
    const t = doc.pages.flatMap((p) => p.lines).join(" ").replace(/\s+/g, " ").toLowerCase();
    const named = t.includes("commercial bank international") || /\bcbi\b/.test(t);
    return named && MARKERS.some((m) => t.includes(m));
  },
  parseOcr(doc: OcrDocument) {
    return parseOcrTableStatement(doc, CBI_OCR_SPEC);
  },
};
