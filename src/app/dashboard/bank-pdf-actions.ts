"use server";

import { pdfToTextWithPages } from "@/lib/pdf-text";
import { parseBankStatementPdfText, type PdfParseOutcome } from "@/lib/parsers/bank-pdf";
import { createClient } from "@/utils/supabase/server";

/** Statements are a few hundred KB; anything near this is not a statement. */
const MAX_STATEMENT_PDF_BYTES = 10 * 1024 * 1024;

export type ReadBankPdfResult = PdfParseOutcome | { ok: false; failure: { code: "unauthenticated"; message: string } };

/**
 * Reads an uploaded bank-statement PDF and returns the parsed transactions per account
 * (or why it could not be read: encrypted, scanned, image-only, unsupported layout...).
 * Nothing is stored and the file is not kept: the import dialogs show the result for
 * confirmation and then reuse the existing balance/transaction import actions. Text
 * extraction happens on the server because the PDF reader is a Node library.
 */
export async function readBankStatementPdf(formData: FormData): Promise<ReadBankPdfResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, failure: { code: "unauthenticated", message: "You must be signed in." } };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, failure: { code: "unreadable", message: "No file was uploaded." } };
  if (file.size > MAX_STATEMENT_PDF_BYTES) {
    return { ok: false, failure: { code: "too_large", message: "The PDF is larger than 10 MB." } };
  }
  const bytes = await file.arrayBuffer();
  // %PDF magic bytes: a renamed spreadsheet or image is not a PDF.
  const head = new Uint8Array(bytes.slice(0, 5));
  if (String.fromCharCode(...head) !== "%PDF-") {
    return { ok: false, failure: { code: "unreadable", message: "The file is not a PDF." } };
  }

  let extracted: { text: string; numPages: number };
  try {
    extracted = await pdfToTextWithPages(bytes);
  } catch (e) {
    const detail = e instanceof Error ? `${e.name} ${e.message}` : String(e);
    if (/password/i.test(detail)) {
      return { ok: false, failure: { code: "encrypted", message: "The PDF is password protected." } };
    }
    console.error("readBankStatementPdf: pdf-parse failed:", detail.slice(0, 200));
    return { ok: false, failure: { code: "unreadable", message: "The PDF could not be read." } };
  }

  return parseBankStatementPdfText(extracted.text, { numPages: extracted.numPages });
}
