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

/** Finds the first value following any of `labels` on the same or next line (contract PDFs commonly put the value on its own line under a label, or after a colon on the same line). */
function extractAfterLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sameLine = new RegExp(`${escaped}\\s*[:\\-]?\\s*([^\\n]+)`, "i");
    const match = text.match(sameLine);
    if (match && match[1].trim()) return match[1].trim();
  }
  return null;
}

const DATE_PATTERN = /(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}|\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/;
const AMOUNT_PATTERN = /((?:AED|Dhs\.?)?\s?[\d,]+(?:\.\d{1,2})?)/i;

function firstDate(after: string | null): string | null {
  if (!after) return null;
  const match = after.match(DATE_PATTERN);
  return match ? normalizeDate(match[1]) : null;
}

function firstAmount(after: string | null): number | null {
  if (!after) return null;
  const match = after.match(AMOUNT_PATTERN);
  return match ? parseAmount(match[1]) : null;
}

/** Ejari (Dubai) "All Trades" style tenancy contract — targets the exact labels: Start Date, End Date, Contract Amount, Annual Amount, Tenant Name. */
export function parseEjariContract(text: string): ParsedTenancyContract {
  return {
    tenancy_start_date: firstDate(extractAfterLabel(text, ["Start Date"])),
    tenancy_end_date: firstDate(extractAfterLabel(text, ["End Date"])),
    tenancy_contract_value: firstAmount(extractAfterLabel(text, ["Contract Amount"])),
    annual_rent: firstAmount(extractAfterLabel(text, ["Annual Amount"])),
    tenant_name: extractAfterLabel(text, ["Tenant Name"]),
  };
}

/**
 * Tawtheeq (Abu Dhabi) tenancy contract — targets: Start Date, End Date,
 * Annual Rent, Contract Value, and Full Name specifically under the SECOND
 * PARTY / TENANT DETAILS section (the same "Full Name" label also appears
 * under the landlord's FIRST PARTY section, so we isolate the text after
 * the tenant-section heading before searching for it).
 */
export function parseTawtheeqContract(text: string): ParsedTenancyContract {
  const tenantSectionMatch = text.match(
    /(SECOND\s+PARTY|TENANT\s+DETAILS)([\s\S]*)/i,
  );
  const tenantSection = tenantSectionMatch ? tenantSectionMatch[2] : text;

  return {
    tenancy_start_date: firstDate(extractAfterLabel(text, ["Start Date"])),
    tenancy_end_date: firstDate(extractAfterLabel(text, ["End Date"])),
    tenancy_contract_value: firstAmount(extractAfterLabel(text, ["Contract Value"])),
    annual_rent: firstAmount(extractAfterLabel(text, ["Annual Rent"])),
    tenant_name: extractAfterLabel(tenantSection, ["Full Name"]),
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
