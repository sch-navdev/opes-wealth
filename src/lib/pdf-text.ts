/**
 * Text of a PDF (server-only), via pdf-parse. Hands the bytes over as a plain
 * `Uint8Array`: inside Next's server runtime the old pdf.js that pdf-parse wraps fails
 * on a Node `Buffer` ("bad XRef entry") even for valid PDFs, but reads the very same
 * bytes as a Uint8Array. Every PDF import (tenancy contracts, property documents,
 * Blue Book valuations) goes through here.
 *
 * Password-protected PDFs: decryption is done by pdf.js itself during text extraction,
 * entirely in memory (pdf-lib cannot decrypt PDFs, so it is not involved). pdf-parse
 * forwards `{ data, password }` to pdf.js, which throws a `PasswordException` (code 1 =
 * password needed, code 2 = wrong password); that is surfaced as `PdfPasswordError`.
 * The password is never logged, never put in an error message and never stored: it only
 * lives in the argument of this call.
 */
export class PdfPasswordError extends Error {
  readonly reason: "required" | "incorrect";
  constructor(reason: "required" | "incorrect") {
    // Fixed text: never derived from the caller's password or from the library's message.
    super(reason === "required" ? "The PDF is password protected." : "The PDF password is incorrect.");
    this.name = "PdfPasswordError";
    this.reason = reason;
  }
}

/** Maps a pdf.js PasswordException (name / code 1|2 / message) to a typed error, else null. */
function toPasswordError(e: unknown): PdfPasswordError | null {
  if (typeof e !== "object" || e === null) return null;
  const { name, code, message } = e as { name?: unknown; code?: unknown; message?: unknown };
  const text = typeof message === "string" ? message : "";
  if (name !== "PasswordException" && !/password/i.test(text)) return null;
  if (code === 2 || /incorrect password/i.test(text)) return new PdfPasswordError("incorrect");
  if (code === 1 || /no password given|need.*password/i.test(text) || name === "PasswordException") {
    return new PdfPasswordError("required");
  }
  return null;
}

export async function pdfToText(data: ArrayBuffer): Promise<string> {
  return (await pdfToTextWithPages(data)).text;
}

/** Same extraction, also returning the page count (the bank-statement importer uses it to tell a scanned PDF from a text one). Throws `PdfPasswordError` for an encrypted PDF. */
export async function pdfToTextWithPages(
  data: ArrayBuffer,
  password?: string,
): Promise<{ text: string; numPages: number }> {
  const pdfParse = (await import("pdf-parse")).default;
  const bytes = new Uint8Array(data);
  try {
    const source = password ? { data: bytes, password } : bytes;
    const result = await pdfParse(source as unknown as Buffer);
    return { text: result.text, numPages: result.numpages };
  } catch (e) {
    const pwd = toPasswordError(e);
    if (pwd) throw pwd;
    throw e;
  }
}
