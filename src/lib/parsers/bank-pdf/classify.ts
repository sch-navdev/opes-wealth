/**
 * Classifies extracted PDF text before any bank profile runs.
 *
 *  - "empty":   no characters at all and no page count (nothing was extracted; blank/unreadable).
 *  - "scanned": the text layer is absent or negligible: the PDF is raster-only and would need
 *               OCR. Fewer than MIN_CHARS_PER_PAGE non-space characters per page on average
 *               (per page when `numPages` is known, else MIN_CHARS_TOTAL in total) AND no
 *               date/amount-looking token.
 *  - "ok":      there is enough text to try the bank profiles.
 *
 * NOTE: a bank-recognised PDF that only carries legal boilerplate (e.g. the HSBC UAE
 * statements: ~7k chars over 5 pages, zero dates/amounts) is NOT "scanned" here; it is
 * long enough to be "ok" and is handled by the profile as `image_only`.
 */
export type PdfTextKind = "ok" | "scanned" | "empty";

export const MIN_CHARS_PER_PAGE = 40;
export const MIN_CHARS_TOTAL = 25;

const DATE_OR_AMOUNT =
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b|\d[\d,. ]*[.,]\d{2}\b/;

export function classifyPdfText(text: string, numPages?: number): PdfTextKind {
  const chars = text.replace(/\s+/g, "").length;
  const pages = numPages && numPages > 0 ? numPages : 0;

  if (chars === 0) return pages > 0 ? "scanned" : "empty";
  if (DATE_OR_AMOUNT.test(text)) return "ok";

  const tooLittle = pages > 0 ? chars / pages < MIN_CHARS_PER_PAGE : chars < MIN_CHARS_TOTAL;
  return tooLittle ? "scanned" : "ok";
}
