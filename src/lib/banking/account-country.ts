/**
 * Pure helpers for the bank-account country (`assets.metadata.country`, an ISO 3166-1 alpha-2 code),
 * the "imported account" test that locks balances in the Edit Bank Account dialog, and the
 * "group by country, then by institution" + country filter of the Banking page.
 *
 * No I/O and no React: usable on the server (Banking page), in the client and in tests.
 */
import { countriesFor } from "./bank-picker";
import { BANK_COUNTRIES, bankByName, getBank, logoBankByName } from "./institutions";
import { getBankProfile } from "./csv-profiles";

type Meta = Record<string, unknown> | null | undefined;

/** localStorage key of the Banking page's country filter chip. */
export const BANKING_COUNTRY_FILTER_KEY = "opes-banking-country-filter";
export const ALL_COUNTRIES = "all";
/** Group key of accounts that have no country. */
export const NO_COUNTRY = "";

export function isCountryCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Institution display name of a Cash account: the stored name, else the CSV profile's. */
export function institutionOfMetadata(metadata: Meta): string {
  return str(metadata?.institution_name) || getBankProfile(str(metadata?.bank_profile))?.name || "";
}

/**
 * The bank an institution name belongs to: a card layout's name ("First Abu Dhabi Bank credit card",
 * "Banque Populaire card") is the same bank as its account layout, so a bank's current accounts and
 * cards are listed together under one bank.
 */
export function bankGroupName(name: string): string {
  const base = name.replace(/\s+(credit\s+|debit\s+)?cards?$/i, "").trim();
  return base || name;
}

/**
 * The key two names of the same bank share: card words and a trailing "(FAB)" style abbreviation are dropped, so
 * "First Abu Dhabi Bank (FAB)" and "First Abu Dhabi Bank credit card" group together.
 */
export function bankKey(name: string): string {
  return bankGroupName(name).replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
}

/** Country of an institution known by display name (registry or profile logo list), or "". */
export function countryOfInstitutionName(name: string): string {
  const bank = bankByName(name);
  if (bank) return bank.country;
  const logo = logoBankByName(name);
  const viaLogo = logo ? getBank(logo.key)?.country : undefined;
  if (viaLogo) return viaLogo;
  return "";
}

/**
 * Country of a bank account: the stored `metadata.country`, else the bank profile's country,
 * else the registry bank's (`bank_key`), else the institution name's. "" when nothing is known.
 */
export function accountCountry(metadata: Meta, institutionName?: string): string {
  if (isCountryCode(metadata?.country)) return metadata.country;
  const profile = getBankProfile(str(metadata?.bank_profile));
  if (profile) return profile.country;
  const key = getBank(str(metadata?.bank_key));
  if (key) return key.country;
  return countryOfInstitutionName(institutionName || institutionOfMetadata(metadata));
}

/** Countries offered by the picker: statement-bank countries, then the registry's, then the current value. */
export function countryOptions(current?: string): string[] {
  const out: string[] = [];
  const add = (c: string) => {
    if (isCountryCode(c) && !out.includes(c)) out.push(c);
  };
  [...countriesFor("csv"), ...countriesFor("pdf"), ...BANK_COUNTRIES].forEach(add);
  if (current) add(current);
  return out;
}

const IMPORT_SOURCES = ["csv_import", "pdf_import"];

/**
 * An account is "imported" when it carries a bank statement profile, or any of its balance history
 * or stored transactions came from a CSV / PDF import. Metadata is checked first.
 */
export function isImportedBankAccount(input: {
  metadata: Meta;
  historySources?: (string | null | undefined)[];
  transactionSources?: (string | null | undefined)[];
}): boolean {
  if (str(input.metadata?.bank_profile)) return true;
  const hit = (s: string | null | undefined) => !!s && IMPORT_SOURCES.includes(s);
  return (input.historySources ?? []).some(hit) || (input.transactionSources ?? []).some(hit);
}

type CountryRow = { institution: string; baseBalance: number; country?: string | null };

export type CountryGroup<T extends CountryRow> = {
  /** ISO code, or NO_COUNTRY. */
  country: string;
  total: number;
  institutions: { institution: string; rows: T[]; total: number }[];
};

const sum = (rows: CountryRow[]) => rows.reduce((s, r) => s + r.baseBalance, 0);

/** Distinct countries present in the rows (largest total first, "no country" last). */
export function countriesInRows(rows: CountryRow[]): string[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const c = r.country && isCountryCode(r.country) ? r.country : NO_COUNTRY;
    totals.set(c, (totals.get(c) ?? 0) + r.baseBalance);
  }
  return Array.from(totals.entries())
    .sort((a, b) => (a[0] === NO_COUNTRY ? 1 : b[0] === NO_COUNTRY ? -1 : b[1] - a[1]))
    .map(([c]) => c);
}

/**
 * Rows filtered to one country (or all), grouped by country, then by institution inside each
 * country. Countries and institutions are ordered by total, largest first; "no country" is last.
 */
export function groupRowsByCountry<T extends CountryRow>(
  rows: T[],
  filter: string = ALL_COUNTRIES,
  otherLabel = "Other",
): CountryGroup<T>[] {
  const keyOf = (r: T) => (r.country && isCountryCode(r.country) ? r.country : NO_COUNTRY);
  const visible = filter === ALL_COUNTRIES ? rows : rows.filter((r) => keyOf(r) === filter);
  const byCountry = new Map<string, T[]>();
  for (const r of visible) byCountry.set(keyOf(r), [...(byCountry.get(keyOf(r)) ?? []), r]);
  return Array.from(byCountry.entries())
    .map(([country, list]) => {
      const byInst = new Map<string, T[]>();
      for (const r of list) {
        const k = r.institution || otherLabel;
        byInst.set(k, [...(byInst.get(k) ?? []), r]);
      }
      const institutions = Array.from(byInst.entries())
        .map(([institution, rs]) => ({ institution, rows: rs, total: sum(rs) }))
        .sort((a, b) => b.total - a.total);
      return { country, total: sum(list), institutions };
    })
    .sort((a, b) => (a.country === NO_COUNTRY ? 1 : b.country === NO_COUNTRY ? -1 : b.total - a.total));
}

/** The remembered filter, or "all". A stored country that is no longer present falls back to "all". */
export function resolveCountryFilter(stored: string | null, available: string[]): string {
  return stored && stored !== ALL_COUNTRIES && available.includes(stored) ? stored : ALL_COUNTRIES;
}

export function readCountryFilter(): string | null {
  try {
    return window.localStorage.getItem(BANKING_COUNTRY_FILTER_KEY);
  } catch {
    return null;
  }
}

export function writeCountryFilter(value: string): void {
  try {
    window.localStorage.setItem(BANKING_COUNTRY_FILTER_KEY, value);
  } catch {
    /* storage unavailable: the filter is simply not remembered */
  }
}
