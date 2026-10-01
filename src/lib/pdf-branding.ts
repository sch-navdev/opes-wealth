/**
 * Shared PDF branding: the Opes Wealth logo in every page header and a
 * "Page n / total" footer. Used by every jsPDF document the app generates
 * (today the DCC advisor document, `lib/dcc-pdf.ts`) so a new report gets the
 * same chrome by calling `drawPdfChrome` once, after its content is laid out.
 */
import type { jsPDF } from "jspdf";

export type PdfLogo = { dataUrl: string; width: number; height: number };

const LOGO_URL = "/logo.png";
const LOGO_PX = 240; // plenty for a 7–26 mm print height, keeps the PDF small

/**
 * Loads `/logo.png` (transparent gold mark) and downsizes it on a canvas.
 * Returns null — never throws — if it can't be loaded, so a report is still
 * produced without the mark rather than failing.
 */
export async function loadPdfLogo(): Promise<PdfLogo | null> {
  if (typeof document === "undefined") return null;
  try {
    const image = new Image();
    image.src = LOGO_URL;
    await image.decode();
    const scale = LOGO_PX / image.naturalWidth;
    const canvas = document.createElement("canvas");
    canvas.width = LOGO_PX;
    canvas.height = Math.round(image.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

const GOLD: [number, number, number] = [168, 124, 31];
const MUTED: [number, number, number] = [107, 114, 128];
const RULE: [number, number, number] = [209, 213, 219];

/** Draws the logo at a given printed height (mm), keeping its aspect ratio. */
export function drawLogo(doc: jsPDF, logo: PdfLogo, x: number, y: number, heightMm: number) {
  doc.addImage(logo.dataUrl, "PNG", x, y, (heightMm * logo.width) / logo.height, heightMm);
}

/**
 * Header (logo + wordmark + hairline) and footer (hairline, left caption,
 * "Page n / total" at the right) on every page from `firstPage` on — the cover
 * (page 1) gets its own larger logo from the caller. Numbering restarts at 1
 * on `firstPage`, so the cover is not counted.
 */
export function drawPdfChrome(
  doc: jsPDF,
  opts: {
    logo: PdfLogo | null;
    firstPage?: number;
    margin: number;
    pageWidth: number;
    pageHeight: number;
    leftCaption: string;
    pageLabel: (n: number, total: number) => string;
  },
) {
  const first = opts.firstPage ?? 1;
  const pages = doc.getNumberOfPages();
  const total = pages - first + 1;
  for (let i = first; i <= pages; i++) {
    doc.setPage(i);
    // Header
    if (opts.logo) drawLogo(doc, opts.logo, opts.margin, 4.5, 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...GOLD);
    doc.text("Opes Wealth", opts.margin + (opts.logo ? (7 * opts.logo.width) / opts.logo.height + 2.5 : 0), 9.4);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.line(opts.margin, 13, opts.pageWidth - opts.margin, 13);
    // Footer
    doc.line(opts.margin, opts.pageHeight - 13, opts.pageWidth - opts.margin, opts.pageHeight - 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(opts.leftCaption, opts.margin, opts.pageHeight - 8);
    doc.text(opts.pageLabel(i - first + 1, total), opts.pageWidth - opts.margin, opts.pageHeight - 8, { align: "right" });
  }
}
