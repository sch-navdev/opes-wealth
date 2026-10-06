/**
 * Public API of the bank-statement PDF parsers. Input is the extracted TEXT of the PDF
 * (extraction is server-side); output is a `PdfParseOutcome`.
 */
import { banquePopulaireProfile } from "./banque-populaire";
import type { TranslationKey } from "@/lib/i18n";
import { classifyPdfText } from "./classify";
import { fabProfile } from "./fab";
import { hsbcProfile } from "./hsbc";
import type { BankPdfProfile, PdfBankId, PdfFailureCode, PdfParseOutcome } from "./types";
import { wioProfile } from "./wio";

export * from "./types";
export { classifyPdfText } from "./classify";
export type { PdfTextKind } from "./classify";

/** Detection order matters: the first profile whose `detect` is true wins. */
export const PDF_BANK_PROFILES: BankPdfProfile[] = [wioProfile, fabProfile, banquePopulaireProfile, hsbcProfile];

export const PDF_FAILURE_MESSAGE_KEYS = {
  encrypted: "bank_pdf_error_encrypted",
  scanned: "bank_pdf_error_scanned",
  image_only: "bank_pdf_error_image_only",
  unsupported: "bank_pdf_error_unsupported",
  no_transactions: "bank_pdf_error_no_transactions",
  unreadable: "bank_pdf_error_unreadable",
  too_large: "bank_pdf_error_too_large",
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
    return {
      ok: false,
      failure: { code: "unsupported", message: "No supported bank statement layout was recognised in this PDF." },
    };
  }
  return profile.parse(text);
}
