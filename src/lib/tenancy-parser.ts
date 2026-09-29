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

/**
 * Tawtheeq (Abu Dhabi) tenancy contract. No real export has been available
 * to verify this against (unlike Ejari above) — this mirrors the same
 * row-pairing structure as a best-effort match for what's presumed to be a
 * similarly-generated government export, isolating "Full Name" to the
 * SECOND PARTY / TENANT DETAILS section since the landlord's FIRST PARTY
 * section uses the identical label.
 */
export function parseTawtheeqContract(text: string): ParsedTenancyContract {
  const tenantSectionMatch = text.match(/(SECOND\s+PARTY|TENANT\s+DETAILS)([\s\S]*)/i);
  const tenantLines = toLines(tenantSectionMatch ? tenantSectionMatch[2] : text);
  const allLines = toLines(text);

  const tenantLine = lineAfterLabel(tenantLines, "Full Name");
  const tenant_name = tenantLine ? extractEnglishName(tenantLine) : null;

  const dateLine = lineAfterLabel(allLines, "Start Date");
  const dates = dateLine ? (dateLine.match(DATE_TOKEN) ?? []) : [];
  const tenancy_start_date = dates[0] ? normalizeDate(dates[0]) : null;
  const tenancy_end_date = dates[1] ? normalizeDate(dates[1]) : null;

  const amountLine = lineAfterLabel(allLines, "Contract Value");
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
