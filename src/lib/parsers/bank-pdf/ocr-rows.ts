/**
 * Geometry helpers: rebuild VISUAL ROWS from OCR boxes.
 *
 * Textract may split one printed line into several LINE blocks, merge neighbours, or return the
 * blocks in any order. So: every box is split into whitespace-separated tokens whose x-extent is
 * estimated proportionally to character offsets, tokens are clustered by vertical centre (tolerance
 * relative to the text height) and each row is sorted left to right.
 */
import type { OcrBox } from "./ocr-types";

export type OcrToken = {
  text: string;
  left: number;
  right: number;
  /** Vertical centre. */
  cy: number;
  /** Text height. */
  h: number;
};

export type VisualRow = {
  tokens: OcrToken[];
  cy: number;
};

export function boxesToTokens(boxes: readonly OcrBox[]): OcrToken[] {
  const out: OcrToken[] = [];
  for (const b of boxes) {
    const text = b.text;
    if (!text.trim()) continue;
    const width = Math.max(0, b.right - b.left);
    const h = Math.max(0, b.bottom - b.top);
    const cy = (b.top + b.bottom) / 2;
    const total = Math.max(1, text.length);
    for (const m of text.matchAll(/\S+/g)) {
      const start = m.index ?? 0;
      out.push({
        text: m[0],
        left: b.left + (start / total) * width,
        right: b.left + ((start + m[0].length) / total) * width,
        cy,
        h,
      });
    }
  }
  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Clusters tokens into visual rows (top to bottom, tokens left to right). */
export function groupRows(tokens: readonly OcrToken[]): VisualRow[] {
  if (tokens.length === 0) return [];
  const tolerance = Math.max(0.003, 0.6 * median(tokens.map((t) => t.h).filter((h) => h > 0)));
  const sorted = [...tokens].sort((a, b) => a.cy - b.cy);
  const rows: { tokens: OcrToken[]; sum: number }[] = [];
  for (const t of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(t.cy - last.sum / last.tokens.length) <= tolerance) {
      last.tokens.push(t);
      last.sum += t.cy;
    } else {
      rows.push({ tokens: [t], sum: t.cy });
    }
  }
  return rows.map((r) => ({
    tokens: r.tokens.sort((a, b) => a.left - b.left),
    cy: r.sum / r.tokens.length,
  }));
}

export function boxesToRows(boxes: readonly OcrBox[]): VisualRow[] {
  return groupRows(boxesToTokens(boxes));
}
