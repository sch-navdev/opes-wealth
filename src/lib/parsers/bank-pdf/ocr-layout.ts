/**
 * Masked layout description of an OCR document, safe to paste to support.
 *
 * Statement OCR text contains personal data (names, addresses, IBANs, amounts), so the OCR
 * profiles cannot be tuned from pasted raw text. This module renders the STRUCTURE only:
 * every digit becomes "9", every word becomes "x" repeated to its length unless it is a
 * plain statement-vocabulary word from the allow-list. Punctuation is kept, so formats such
 * as 99/99/9999, 9,999.99 and "9,999.99 CR" stay visible. Pure: no I/O, never logged.
 */
import type { OcrDocument } from "./ocr-types";

const KEEP_WORDS = new Set([
  "date", "value", "balance", "debit", "credit", "description", "details", "particulars", "transaction",
  "withdrawal", "withdrawals", "deposit", "deposits", "amount", "paid", "in", "out", "brought", "forward",
  "carried", "cr", "dr", "ccy", "currency", "account", "statement", "period", "opening", "closing", "total",
  "page", "of", "ref", "reference", "narrative", "narration", "remarks",
]);

/** Words that mark a line as header-like (extra lines shown beyond the first ones). */
const HEADER_WORDS = new Set([
  "date", "value", "balance", "debit", "credit", "description", "details", "particulars", "withdrawal",
  "withdrawals", "deposit", "deposits", "amount", "narrative", "narration", "remarks", "opening", "closing", "brought", "carried",
]);

const TOKEN = /[\p{L}\p{N}]+/gu;
const ALNUM = /[\p{L}\p{N}]/u;
const WORD_ONLY = /^\p{L}+$/u;

/** Masks one string: digits to "9", non-allow-listed words to "x" runs. */
export function maskText(input: string): string {
  return input.replace(TOKEN, (token, offset: number, whole: string) => {
    if (WORD_ONLY.test(token)) {
      const lower = token.toLowerCase();
      if (KEEP_WORDS.has(lower)) return token;
      // "b/f" and "c/f" (brought / carried forward), as standalone tokens only.
      const before = whole[offset - 1];
      const after = whole[offset + token.length];
      if ((lower === "b" || lower === "c") && whole.slice(offset + 1, offset + 3).toLowerCase() === "/f") {
        const end = whole[offset + 3];
        if ((before === undefined || !ALNUM.test(before)) && (end === undefined || !ALNUM.test(end))) return token;
      }
      if (lower === "f" && whole.slice(offset - 2, offset).toLowerCase().match(/^[bc]\/$/)) {
        const pre = whole[offset - 3];
        if ((pre === undefined || !ALNUM.test(pre)) && (after === undefined || !ALNUM.test(after))) return token;
      }
    }
    // Mixed or unknown token: digits to 9, every letter to x.
    return token.replace(/\p{N}/gu, "9").replace(/\p{L}/gu, "x");
  });
}

function isHeaderLike(line: string): boolean {
  const words = line.toLowerCase().match(/\p{L}+/gu) ?? [];
  let hits = 0;
  for (const w of words) if (HEADER_WORDS.has(w)) hits++;
  return hits >= 1;
}

const TABLE_HEAD_ROWS = 6;
const TABLE_TAIL_ROWS = 2;
const TEXT_LINES = 40;
const EXTRA_HEADER_LINES = 15;
const MAX_LINE_CHARS = 200;

function clip(s: string): string {
  return s.length > MAX_LINE_CHARS ? `${s.slice(0, MAX_LINE_CHARS)}...` : s;
}

export function describeOcrLayout(doc: OcrDocument, opts: { maxChars?: number } = {}): string {
  const maxChars = opts.maxChars ?? 4000;
  const out: string[] = [`OCR layout (masked): ${doc.pages.length} page(s)`];

  doc.pages.forEach((page, p) => {
    out.push("", `== Page ${p + 1}: ${page.lines.length} lines, ${page.tables.length} tables ==`);

    page.tables.forEach((table, t) => {
      const cols = table.rows.reduce((m, r) => Math.max(m, r.length), 0);
      out.push(`-- Table ${t + 1}: ${table.rows.length} rows, ${cols} columns --`);
      const n = table.rows.length;
      const shown = n <= TABLE_HEAD_ROWS + TABLE_TAIL_ROWS
        ? table.rows.map((r, i) => ({ r, i }))
        : [
            ...table.rows.slice(0, TABLE_HEAD_ROWS).map((r, i) => ({ r, i })),
            ...table.rows.slice(n - TABLE_TAIL_ROWS).map((r, i) => ({ r, i: n - TABLE_TAIL_ROWS + i })),
          ];
      let prev = -1;
      for (const { r, i } of shown) {
        if (prev >= 0 && i > prev + 1) out.push("  ...");
        out.push(`  ${i + 1}: ${clip(r.map((c) => maskText(c.replace(/\s+/g, " ").trim())).join(" | "))}`);
        prev = i;
      }
    });

    out.push("-- Text lines --");
    const first = page.lines.slice(0, TEXT_LINES);
    first.forEach((l, i) => out.push(`  ${i + 1}: ${clip(maskText(l.replace(/\s+/g, " ").trim()))}`));
    const extra: number[] = [];
    for (let i = TEXT_LINES; i < page.lines.length && extra.length < EXTRA_HEADER_LINES; i++) {
      if (isHeaderLike(page.lines[i])) extra.push(i);
    }
    if (extra.length > 0) {
      out.push("-- Header-like lines further down --");
      for (const i of extra) out.push(`  ${i + 1}: ${clip(maskText(page.lines[i].replace(/\s+/g, " ").trim()))}`);
    }
    if (page.lines.length > TEXT_LINES) out.push(`  (${page.lines.length - TEXT_LINES} more lines not shown)`);
  });

  const text = out.join("\n");
  if (text.length <= maxChars) return text;
  const marker = "\n[truncated]";
  return text.slice(0, Math.max(0, maxChars - marker.length)) + marker;
}
