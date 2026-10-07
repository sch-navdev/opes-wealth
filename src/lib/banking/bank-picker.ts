/**
 * Pure helpers behind the "country, then bank" picker of the statement-import dialog
 * (`components/bank-statement-import-dialog.tsx`). Everything is derived from
 * `BANK_PROFILES` (the CSV presets plus the PDF-only banks) and `PDF_BANK_PROFILES`
 * (the banks the PDF pipeline can read), so a new profile shows up without touching the UI.
 *
 * HONESTY NOTE: apart from the banks the PDF parsers were validated against, the CSV
 * presets are UNVERIFIED (built from the column names each bank is generally known to
 * use; see `csv-profiles.ts`). The dialog keeps showing `stmt_unverified_note` for CSV
 * files. Detection (`detectProfile` for CSV, the PDF fingerprint for PDF) stays the
 * default; choosing a bank here is only an override.
 */
import { PDF_BANK_PROFILES, type PdfBankId } from "@/lib/parsers/bank-pdf";
import { BANK_PROFILES, getBankProfile, type BankProfile, type BankProfileId } from "./csv-profiles";

export type StatementFileKind = "csv" | "pdf";

/** localStorage key of the last country chosen in the picker. */
export const STATEMENT_COUNTRY_STORAGE_KEY = "opes-stmt-country";
export const DEFAULT_STATEMENT_COUNTRY = "AE";

/** Display order of the countries (UAE first, then France; anything new is appended in profile order). */
const COUNTRY_ORDER = ["AE", "FR"];

/** Ids the PDF pipeline can be forced to (`readBankStatementPdf` field `bank`). */
export function pdfBankIds(): PdfBankId[] {
  return PDF_BANK_PROFILES.map((p) => p.id);
}

export function isPdfBankId(value: unknown): value is PdfBankId {
  return typeof value === "string" && PDF_BANK_PROFILES.some((p) => p.id === value);
}

/** The profiles a user may pick for a file of this kind. PDF ids are the same strings as the matching `BANK_PROFILES` ids. */
export function selectableProfiles(kind: StatementFileKind): BankProfile[] {
  if (kind === "csv") return BANK_PROFILES.filter((p) => !p.pdfOnly);
  return pdfBankIds()
    .map((id) => getBankProfile(id))
    .filter((p): p is BankProfile => p !== undefined);
}

/** Countries that have at least one selectable bank for this kind, in display order. */
export function countriesFor(kind: StatementFileKind): string[] {
  const present = new Set(selectableProfiles(kind).map((p) => p.country as string));
  const ordered = COUNTRY_ORDER.filter((c) => present.has(c));
  const rest = Array.from(present).filter((c) => !COUNTRY_ORDER.includes(c));
  return [...ordered, ...rest];
}

export function banksForCountry(kind: StatementFileKind, country: string): BankProfile[] {
  return selectableProfiles(kind).filter((p) => p.country === country);
}

/** Regional-indicator flag emoji of an ISO 3166-1 alpha-2 code ("AE" -> the UAE flag). */
export function countryFlag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...Array.from(code.toUpperCase()).map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Country name in the UI language (same `Intl.DisplayNames` approach as the bank registry's group labels). */
export function countryLabel(code: string, intlLocale: string): string {
  try {
    return new Intl.DisplayNames([intlLocale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function countryOfProfile(id: BankProfileId | string): string | undefined {
  return getBankProfile(id)?.country;
}

export function readStoredCountry(): string | null {
  try {
    const v = window.localStorage.getItem(STATEMENT_COUNTRY_STORAGE_KEY);
    return v && /^[A-Z]{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeStoredCountry(country: string): void {
  try {
    window.localStorage.setItem(STATEMENT_COUNTRY_STORAGE_KEY, country);
  } catch {
    /* storage unavailable (private mode, blocked): the picker simply does not remember */
  }
}

/**
 * Country to preselect: the detected bank's, else the remembered one, else the UAE.
 * A candidate with no selectable bank for this kind is skipped.
 */
export function defaultCountry(
  kind: StatementFileKind,
  detectedProfileId: BankProfileId | string | null | undefined,
  stored: string | null,
): string {
  const available = countriesFor(kind);
  const candidates = [detectedProfileId ? countryOfProfile(detectedProfileId) : undefined, stored ?? undefined, DEFAULT_STATEMENT_COUNTRY];
  return candidates.find((c): c is string => !!c && available.includes(c)) ?? available[0] ?? DEFAULT_STATEMENT_COUNTRY;
}
