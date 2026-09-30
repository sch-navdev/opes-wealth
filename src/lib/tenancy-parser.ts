import type { Emirate } from "@/lib/real-estate";

export type ParsedTenancyContract = {
  tenant_name: string | null;
  tenancy_start_date: string | null; // ISO YYYY-MM-DD
  tenancy_end_date: string | null; // ISO YYYY-MM-DD
  annual_rent: number | null;
  tenancy_contract_value: number | null;
};

/** Normalizes the varied date formats seen on Ejari/Tawtheeq PDFs (`DD/MM/YYYY`, `DD-MM-YYYY`, `DD Month YYYY`) to `YYYY-MM-DD`. Returns `null` if it can't confidently parse. */
function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();

  const numeric = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (numeric) {
    const [, d, m, y] = numeric;
    const day = d.padStart(2, "0");
    const month = m.padStart(2, "0");
    if (Number(month) > 12) return null;
    return `${y}-${month}-${day}`;
  }

  const monthNames: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const worded = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (worded) {
    const [, d, monthWord, y] = worded;
    const month = monthNames[monthWord.slice(0, 3).toLowerCase()];
    if (!month) return null;
    return `${y}-${month}-${d.padStart(2, "0")}`;
  }

  return null;
}

/** Strips currency symbols/codes and thousands separators from a matched amount string (e.g. `"AED 120,000.00"` -> `120000`). */
function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

const DATE_TOKEN = /\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}/g;
const AMOUNT_TOKEN = /[\d,]+\.\d{2}(?=\s*AED)/g;

/** Every consecutive Latin-uppercase run of 3+ characters, in appearance order — used to pull an English name out of a line that also contains Arabic text (the PDF's Arabic glyphs are encoded as Latin-adjacent codepoints, not real Arabic Unicode, so isolating `[A-Z ]` runs is what actually separates the two). */
function extractLatinNameTokens(line: string): string[] {
  const matches = line.match(/[A-Z][A-Z.'-]*(?:\s+[A-Z][A-Z.'-]*)*/g) ?? [];
  return matches.map((m) => m.trim()).filter((m) => m.length >= 3);
}

/** The longest Latin-uppercase run on the line — in every observed Ejari/Tawtheeq export, the tenant's English name is that run (the Arabic transliteration around it never forms a run of real ASCII uppercase letters longer than a couple of characters). */
function extractEnglishName(line: string): string | null {
  const tokens = extractLatinNameTokens(line);
  if (tokens.length === 0) return null;
  return tokens.reduce((longest, t) => (t.length > longest.length ? t : longest));
}

/**
 * PDF-to-text extraction turns each export's two-column layout into a flat
 * line stream, but consistently keeps each *label* on its own line — so
 * "the line right after this exact label" is a reliable anchor across every
 * contract exported from the same system, even though the value line itself
 * is often a run-together mix of a value, a mirrored Arabic label, and a
 * second value (see `parseEjariContract` below for exactly which line holds
 * which field for Ejari).
 */
function lineAfterLabel(lines: string[], label: string): string | null {
  const idx = lines.findIndex((l) => l === label);
  return idx >= 0 && idx + 1 < lines.length ? lines[idx + 1] : null;
}

function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Ejari (Dubai) tenancy contract — verified against a real export (not just
 * the label names in isolation). Ejari's PDF-to-text extraction interleaves
 * the two-column table into lines like:
 *
 * ```
 * Start Date
 * 21-11-2025<mirrored Arabic "Start Date" label>01-12-2026
 * End Date
 * ```
 *
 * i.e. the line under "Start Date" holds BOTH dates — the first date token
 * belongs to "Start Date" (the label just above), the second belongs to
 * "End Date" (the label appearing just below, which mirrors the same
 * two-columns-per-row pattern the whole document uses). The same shape
 * repeats for the Contract Amount / Annual Amount row. Tenant Name has no
 * second column — its value line just mixes the Arabic transliteration and
 * the real English name on one line, so `extractEnglishName` picks out the
 * genuine Latin name instead.
 */
export function parseEjariContract(text: string): ParsedTenancyContract {
  const lines = toLines(text);

  const tenantLine = lineAfterLabel(lines, "Tenant Name");
  const tenant_name = tenantLine ? extractEnglishName(tenantLine) : null;

  const dateLine = lineAfterLabel(lines, "Start Date");
  const dates = dateLine ? (dateLine.match(DATE_TOKEN) ?? []) : [];
  const tenancy_start_date = dates[0] ? normalizeDate(dates[0]) : null;
  const tenancy_end_date = dates[1] ? normalizeDate(dates[1]) : null;

  const amountLine = lineAfterLabel(lines, "Contract Amount");
  const amounts = amountLine ? (amountLine.match(AMOUNT_TOKEN) ?? []) : [];
  const tenancy_contract_value = amounts[0] ? parseAmount(amounts[0]) : null;
  const annual_rent = amounts[1] ? parseAmount(amounts[1]) : null;

  return {
    tenant_name,
    tenancy_start_date,
    tenancy_end_date,
    tenancy_contract_value,
    annual_rent,
  };
}

/** First capture group of `pattern` against the raw text, or `null`. */
function firstMatch(text: string, pattern: RegExp): string | null {
  return text.match(pattern)?.[1] ?? null;
}

/**
 * Tawtheeq (Abu Dhabi) tenancy contract — verified against a real export
 * (dari.ae). Unlike Ejari, the CONTRACT DETAILS table extracts as one line
 * per row with the English label, value and mirrored Arabic label run
 * together with no delimiter:
 *
 * ```
 * Start Date2026-04-28<Arabic label>
 * Annual Rent157,500.00 <Arabic label>
 * ```
 *
 * so dates and amounts are anchored on the line-start label and read straight
 * off its value (dates are already ISO). The tenant's English name is the
 * last `Full Name` value inside TENANT DETAILS (the landlord section uses the
 * same label). It follows the Arabic name and can wrap across lines
 * (`MICHAEL WILLIAM ` / `MCGROARTY`), so it's the trailing run of pure
 * Latin-uppercase lines in that section. Falls back to the signature line
 * (`NAME<Emirates ID><Arabic name>`).
 */
export function parseTawtheeqContract(text: string): ParsedTenancyContract {
  const start = firstMatch(text, /^Start Date\s*(\d{4}-\d{2}-\d{2})/m);
  const end = firstMatch(text, /^End Date\s*(\d{4}-\d{2}-\d{2})/m);
  const annual = firstMatch(text, /^Annual Rent\s*([\d,]+\.\d{2})/m);
  const value = firstMatch(text, /^Contract Value\s*([\d,]+\.\d{2})/m);

  return {
    tenant_name: extractTawtheeqTenantName(text),
    tenancy_start_date: start,
    tenancy_end_date: end,
    tenancy_contract_value: value ? parseAmount(value) : null,
    annual_rent: annual ? parseAmount(annual) : null,
  };
}

function extractTawtheeqTenantName(text: string): string | null {
  const section = text.match(/TENANT\s+DETAILS([\s\S]*?)(?:PROPERTY\s+DETAILS|$)/i)?.[1];
  if (section) {
    const lines = toLines(section);
    const labelIdx = lines.map((l) => l === "Full Name").lastIndexOf(true);
    const nameLines: string[] = [];
    for (let i = lines.length - 1; labelIdx >= 0 && i > labelIdx; i--) {
      if (!/^[A-Z][A-Z .'-]*$/.test(lines[i])) break;
      nameLines.unshift(lines[i]);
    }
    if (nameLines.length > 0) return nameLines.join(" ").replace(/\s+/g, " ");
  }
  const signed = firstMatch(text, /^([A-Z][A-Z .'-]+?)\s*\d{15}/m);
  return signed ? signed.replace(/\s+/g, " ") : null;
}

/** Picks the parser based on the property's registered emirate — Ejari for Dubai, Tawtheeq for Abu Dhabi. */
export function parseTenancyContract(
  text: string,
  emirate: Emirate,
): ParsedTenancyContract {
  return emirate === "abu_dhabi" ? parseTawtheeqContract(text) : parseEjariContract(text);
}

/** True if at least one field was successfully extracted — used to decide whether to surface a "couldn't read this contract" error instead of silently saving all-nulls. */
export function hasAnyExtractedField(parsed: ParsedTenancyContract): boolean {
  return Object.values(parsed).some((v) => v !== null && v !== "");
}
