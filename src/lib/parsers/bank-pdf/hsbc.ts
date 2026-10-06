/**
 * HSBC UAE profile.
 *
 * HONEST SCOPE: there is NO verified HSBC UAE text layout for transaction rows. The HSBC UAE
 * "Statement of Account" PDFs we have seen carry only the legal boilerplate as text (terms,
 * abbreviations: zero dates, zero amounts); the transaction pages are images. So the only case
 * handled is `image_only`. If a different HSBC export does contain dated rows with amounts we
 * return `unsupported` rather than invent a layout. This profile never returns `ok: true`.
 */
import type { BankPdfProfile, PdfParseOutcome } from "./types";

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
};
