"use server";

import { PdfPasswordError, pdfToTextWithPages } from "@/lib/pdf-text";
import { PDF_BANK_PROFILES, parseBankStatementOcr, parseBankStatementPdfText, type PdfBankId, type PdfParseOutcome } from "@/lib/parsers/bank-pdf";
import { isOcrConfigured, ocrPdfToDocument } from "@/lib/services/ocr-client";
import { createClient } from "@/utils/supabase/server";

/** Statements are a few hundred KB; anything near this is not a statement. Matches `serverActions.bodySizeLimit` ("5mb") in next.config.ts. */
const MAX_STATEMENT_PDF_BYTES = 5 * 1024 * 1024;
const MAX_PASSWORD_LENGTH = 256;

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
    return { ok: false, failure: { code: "too_large", message: "The PDF is larger than 5 MB." } };
  }
  const bytes = await file.arrayBuffer();
  // %PDF magic bytes: a renamed spreadsheet or image is not a PDF.
  const head = new Uint8Array(bytes.slice(0, 5));
  if (String.fromCharCode(...head) !== "%PDF-") {
    return { ok: false, failure: { code: "unreadable", message: "The file is not a PDF." } };
  }

  // Optional password for an encrypted PDF: used once for this extraction, never logged,
  // echoed back or stored.
  const rawPassword = formData.get("password");
  const password = typeof rawPassword === "string" && rawPassword.length > 0 ? rawPassword : undefined;
  if (password && password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, failure: { code: "password_incorrect", message: "The PDF password is incorrect." } };
  }

  // Optional bank the user picked in the import dialog: forces that bank's parser instead of the
  // fingerprint. Unknown values are ignored (detection runs as usual), never an error.
  const rawBank = formData.get("bank");
  const bank: PdfBankId | undefined =
    typeof rawBank === "string" ? PDF_BANK_PROFILES.find((p) => p.id === rawBank)?.id : undefined;

  // Explicit per-upload consent to send a scanned PDF to the OCR provider (see below).
  const ocrConsent = formData.get("ocr") === "1";
  // The text reader may detach/transfer the buffer, so keep our own copy for OCR.
  const ocrBytes = ocrConsent ? new Uint8Array(bytes.slice(0)) : null;

  let extracted: { text: string; numPages: number };
  try {
    extracted = await pdfToTextWithPages(bytes, password);
  } catch (e) {
    if (e instanceof PdfPasswordError) {
      return e.reason === "incorrect"
        ? { ok: false, failure: { code: "password_incorrect", message: "The PDF password is incorrect." } }
        : { ok: false, failure: { code: "encrypted", message: "The PDF is password protected." } };
    }
    // Log the error class only (a library message could in principle carry request data).
    console.error("readBankStatementPdf: pdf-parse failed:", e instanceof Error ? e.name : "unknown error");
    return { ok: false, failure: { code: "unreadable", message: "The PDF could not be read." } };
  }

  const outcome = parseBankStatementPdfText(extracted.text, { numPages: extracted.numPages, bank });
  if (outcome.ok || (outcome.failure.code !== "scanned" && outcome.failure.code !== "image_only")) return outcome;

  // Scanned / image-only: OCR is the only way in. It sends the file to a third party (AWS Textract),
  // so it runs ONLY with the explicit `ocr=1` consent of this upload. An encrypted PDF never gets
  // here (the reader throws first), so a password-protected file is never sent to OCR.
  if (!ocrBytes) {
    return { ok: false, failure: { ...outcome.failure, ocr: isOcrConfigured() ? "available" : "unconfigured" } };
  }
  if (!isOcrConfigured()) {
    return {
      ok: false,
      failure: { code: "ocr_unavailable", message: "OCR is not set up on this server (AWS keys missing).", detail: "not_configured" },
    };
  }

  const ocr = await ocrPdfToDocument(ocrBytes);
  if (!ocr.ok) {
    // Log the reason code only: never the file, the OCR text or any credential.
    console.error("readBankStatementPdf: OCR failed:", ocr.reason, ocr.detail ?? "");
    if (ocr.reason === "unreadable") {
      return { ok: false, failure: { code: "unreadable", message: "The PDF could not be read by OCR." } };
    }
    if (ocr.reason === "too_many_pages") {
      return { ok: false, failure: { code: "unreadable", message: "The PDF is too long to be read with OCR." } };
    }
    return {
      ok: false,
      failure: { code: "ocr_unavailable", message: `OCR could not be run (${ocr.reason}).`, detail: [ocr.reason, ocr.detail].filter(Boolean).join(": ") },
    };
  }

  const parsed = parseBankStatementOcr(ocr.document, { bank });
  if (parsed.ok && ocr.truncated) {
    return {
      ok: true,
      statement: {
        ...parsed.statement,
        warnings: [`Only the first ${ocr.pages} pages were read.`, ...parsed.statement.warnings],
      },
    };
  }
  return parsed;
}
