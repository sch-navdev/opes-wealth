/**
 * Public API of the bank-statement PDF parsers. Input is the extracted TEXT of the PDF
 * (extraction is server-side); output is a `PdfParseOutcome`.
 */
import { banquePopulaireProfile } from "./banque-populaire";
import { banquePopulaireCardProfile } from "./banque-populaire-card";
import type { TranslationKey } from "@/lib/i18n";
import { cbdProfile } from "./cbd";
import { cbiProfile } from "./cbi";
import { classifyPdfText } from "./classify";
import { fabProfile } from "./fab";
import { fabCardProfile } from "./fab-card";
import type { OcrDocument } from "./ocr-types";
import { hsbcProfile } from "./hsbc";
import { hsbcCardProfile } from "./hsbc-card";
import type { BankPdfProfile, PdfBankId, PdfFailureCode, PdfParseOutcome } from "./types";
import { wioProfile } from "./wio";
import { wioCardProfile } from "./wio-card";

export * from "./types";
export { classifyPdfText } from "./classify";
export type { PdfTextKind } from "./classify";

/** Detection order matters: the first profile whose `detect` is true wins. */
export const PDF_BANK_PROFILES: BankPdfProfile[] = [wioCardProfile, wioProfile, fabCardProfile, fabProfile, banquePopulaireCardProfile, banquePopulaireProfile, hsbcCardProfile, hsbcProfile, cbiProfile, cbdProfile];

export const PDF_FAILURE_MESSAGE_KEYS = {
  encrypted: "bank_pdf_error_encrypted",
  password_incorrect: "bank_pdf_password_incorrect",
  scanned: "bank_pdf_error_scanned",
  image_only: "bank_pdf_error_image_only",
  unsupported: "bank_pdf_error_unsupported",
  not_account_statement: "bank_pdf_error_not_account_statement",
  no_transactions: "bank_pdf_error_no_transactions",
  unreadable: "bank_pdf_error_unreadable",
  too_large: "bank_pdf_error_too_large",
  ocr_unavailable: "bank_pdf_ocr_unavailable",
} as const satisfies Record<PdfFailureCode, TranslationKey>;

export function detectBankPdf(text: string): BankPdfProfile | null {
  for (const profile of PDF_BANK_PROFILES) {
    if (profile.detect(text)) return profile;
  }
  return null;
}

export function parseBankStatementPdfText(
  text: string,
  opts?: { numPages?: number; bank?: PdfBankId },
): PdfParseOutcome {
  const kind = classifyPdfText(text, opts?.numPages);
  if (kind === "scanned") {
    return {
      ok: false,
      failure: { code: "scanned", message: "The PDF has no text layer (scanned/raster); OCR would be needed." },
    };
  }
  if (kind === "empty") {
    return { ok: false, failure: { code: "unreadable", message: "No text could be extracted from the PDF." } };
  }

  const profile = opts?.bank ? PDF_BANK_PROFILES.find((p) => p.id === opts.bank) : detectBankPdf(text);
  if (!profile) {
    if (/banque populaire/i.test(text)) {
      return {
        ok: false,
        failure: {
          code: "not_account_statement",
          bank: "banque_populaire",
          message: "This Banque Populaire document is not an account or card statement (transfer notice, fee summary...).",
        },
      };
    }
    return {
      ok: false,
      failure: { code: "unsupported", message: "No supported bank statement layout was recognised in this PDF." },
    };
  }
  return profile.parse(text);
}

export type { OcrDocument, OcrPage, OcrTable } from "./ocr-types";

/** All OCR lines of a document joined with newlines (lets the text profiles run on OCR output). */
export function ocrDocumentToText(doc: OcrDocument): string {
  return doc.pages.map((p) => p.lines.join("\n")).join("\n");
}

/**
 * Parses an OCR'd (image-only) statement. Profiles with `detectOcr` are tried first (hsbc, cbi);
 * otherwise the text profiles are tried on the OCR text and the result is marked `source: "ocr"`.
 * UNVERIFIED against real OCR output; reconciliation is the safety net (see `ocr-statement.ts`).
 */
export function parseBankStatementOcr(doc: OcrDocument, opts?: { bank?: PdfBankId }): PdfParseOutcome {
  const unsupported: PdfParseOutcome = {
    ok: false,
    failure: { code: "unsupported", message: "No supported bank statement layout was recognised in the OCR text." },
  };
  const forced = opts?.bank ? PDF_BANK_PROFILES.find((p) => p.id === opts.bank) : undefined;
  if (opts?.bank && !forced) return unsupported;
  const ocrProfile = forced?.parseOcr ? forced : PDF_BANK_PROFILES.find((p) => p.parseOcr && p.detectOcr?.(doc));
  if (ocrProfile?.parseOcr) return ocrProfile.parseOcr(doc);

  const text = ocrDocumentToText(doc);
  const textProfile = forced ?? PDF_BANK_PROFILES.find((p) => !p.detectOcr && p.detect(text));
  if (!textProfile) return unsupported;
  const out = textProfile.parse(text);
  if (!out.ok) return out;
  return {
    ok: true,
    statement: {
      ...out.statement,
      source: "ocr",
      warnings: ["OCR read: verify every row against the original statement.", ...out.statement.warnings],
    },
  };
}
