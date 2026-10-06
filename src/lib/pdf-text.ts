/**
 * Text of a PDF (server-only), via pdf-parse. Hands the bytes over as a plain
 * `Uint8Array`: inside Next's server runtime the old pdf.js that pdf-parse wraps fails
 * on a Node `Buffer` ("bad XRef entry") even for valid PDFs, but reads the very same
 * bytes as a Uint8Array. Every PDF import (tenancy contracts, property documents,
 * Blue Book valuations) goes through here.
 */
export async function pdfToText(data: ArrayBuffer): Promise<string> {
  return (await pdfToTextWithPages(data)).text;
}

/** Same extraction, also returning the page count (the bank-statement importer uses it to tell a scanned PDF from a text one). */
export async function pdfToTextWithPages(data: ArrayBuffer): Promise<{ text: string; numPages: number }> {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(new Uint8Array(data) as unknown as Buffer);
  return { text: result.text, numPages: result.numpages };
}
