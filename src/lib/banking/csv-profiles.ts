/**
 * Bank-specific CSV profiles: Wio, Emirates NBD, ADCB, FAB (UAE) and
 * BoursoBank, Société Générale, BNP Paribas, Crédit Agricole (France).
 *
 * A profile is a set of column-name aliases + a few format hints (delimiter,
 * decimal style, currency) for that bank's statement export. Given a file the
 * parser locates the header row (statements often start with account info),
 * reads dates and amounts in the formats banks use (ISO, DD/MM/YYYY,
 * DD-MM-YYYY, "05 Jan 2026"; "1,234.56" and "1 234,56"), turns Debit/Credit
 * columns into one signed amount, and groups the rows by account when the file
 * identifies the account (a column, or an IBAN in the preamble) so each group
 * can be routed to the matching Cash account (`routeGroups`).
 *
 * HONESTY NOTE: these presets are built from the column names these banks'
 * exports are generally known to use, NOT verified against real exports
 * (none were available). They are tolerant on purpose (several aliases per
 * column, accent/case-insensitive), the import dialog shows a parsed preview
 * before anything is written, and a wrong match is fixed by choosing the bank
 * manually. Send a real export of each bank to tighten its profile.
 *
 * Pure functions, no I/O — usable on the client and in tests.
 */
import { parseCsvTable } from "@/lib/csv-parser";

export type BankProfileId =
  | "wio"
  | "enbd"
  | "adcb"
  | "fab"
  | "rakbank"
  | "mashreq"
  | "boursobank"
  | "societe_generale"
  | "bnp_paribas"
  | "credit_agricole"
  | "lcl"
  | "caisse_epargne"
  | "banque_populaire"
  | "la_banque_postale"
  | "cic"
  | "credit_mutuel"
  | "hsbc_france"
  | "hello_bank"
  | "fortuneo"
  | "ing_france"
  | "hsbc_uae"
  | "cbi"
  | "cbd"
  | "hsbc_uae_card";

export type BankProfile = {
  id: BankProfileId;
  name: string;
  country: "AE" | "FR";
  defaultCurrency: string;
  /**
   * True for banks whose statements are only read from PDFs (OCR): the profile
   * exists so a PDF result can flow through the statement-import pipeline, has no
   * column aliases and so can never match a CSV (`detectProfile`, `parseStatement`),
   * and is not offered in the CSV bank picker. Not in the `BANKS` registry.
   */
  pdfOnly?: boolean;
  /** Aliases (normalised: lowercase, no accents/spaces/punctuation) per logical column. */
  columns: {
    date: string[];
    description: string[];
    amount?: string[];
    debit?: string[];
    credit?: string[];
    balance?: string[];
    account?: string[];
    currency?: string[];
  };
  /** Header names that make this bank the most likely source of a file. */
  signature: string[];
};

const profile = (p: BankProfile) => p;

export const BANK_PROFILES: BankProfile[] = [
  profile({
    id: "wio",
    name: "Wio Bank",
    country: "AE",
    defaultCurrency: "AED",
    columns: {
      date: ["transactiondate", "bookingdate", "date"],
      description: ["description", "narration", "merchant", "details", "reference"],
      amount: ["amount", "transactionamount"],
      debit: ["debit", "withdrawal"],
      credit: ["credit", "deposit"],
      balance: ["balance", "runningbalance", "closingbalance"],
      currency: ["currency", "ccy"],
    },
    signature: ["runningbalance", "bookingdate"],
  }),
  profile({
    id: "enbd",
    name: "Emirates NBD",
    country: "AE",
    defaultCurrency: "AED",
    columns: {
      date: ["transactiondate", "txndate", "postingdate", "date", "valuedate"],
      description: ["description", "narration", "transactiondetails", "details"],
      amount: ["amount"],
      debit: ["debit", "withdrawals", "debitamount"],
      credit: ["credit", "deposits", "creditamount"],
      balance: ["balance", "availablebalance", "runningbalance"],
      currency: ["currency"],
    },
    signature: ["narration", "txndate", "transactiondetails"],
  }),
  profile({
    id: "adcb",
    name: "ADCB",
    country: "AE",
    defaultCurrency: "AED",
    columns: {
      date: ["date", "transactiondate", "valuedate", "postdate"],
      description: ["description", "transactiondescription", "narrative", "details"],
      amount: ["amount"],
      debit: ["debit", "debitamount", "withdrawal"],
      credit: ["credit", "creditamount", "deposit"],
      balance: ["balance", "runningbalance"],
      currency: ["currency"],
    },
    signature: ["transactiondescription", "narrative", "postdate"],
  }),
  profile({
    id: "fab",
    name: "First Abu Dhabi Bank (FAB)",
    country: "AE",
    defaultCurrency: "AED",
    columns: {
      date: ["transactiondate", "postingdate", "date", "valuedate"],
      description: ["description", "narration", "transactiondescription", "remarks"],
      amount: ["amount"],
      debit: ["debit", "debitamount", "withdrawals"],
      credit: ["credit", "creditamount", "deposits"],
      balance: ["runningbalance", "balance", "ledgerbalance"],
      account: ["accountnumber", "accountno"],
      currency: ["currency"],
    },
    signature: ["ledgerbalance", "remarks", "accountnumber"],
  }),
  profile({
    id: "boursobank",
    name: "BoursoBank",
    country: "FR",
    defaultCurrency: "EUR",
    columns: {
      date: ["dateop", "dateoperation", "date"],
      description: ["label", "libelle", "supplierfound"],
      amount: ["amount", "montant"],
      balance: ["accountbalance", "solde"],
      account: ["accountnum", "numerodecompte", "accountnumber"],
    },
    signature: ["dateop", "accountnum", "accountlabel", "categoryparent"],
  }),
  profile({
    id: "societe_generale",
    name: "Société Générale",
    country: "FR",
    defaultCurrency: "EUR",
    columns: {
      date: ["datedeloperation", "dateoperation", "date"],
      description: ["libelle", "detaildelecriture", "detail"],
      amount: ["montantdeloperation", "montant"],
      debit: ["debit"],
      credit: ["credit"],
      currency: ["devise"],
    },
    signature: ["detaildelecriture", "montantdeloperation"],
  }),
  profile({
    id: "bnp_paribas",
    name: "BNP Paribas",
    country: "FR",
    defaultCurrency: "EUR",
    columns: {
      date: ["dateoperation", "date", "datedevaleur"],
      description: ["libelleoperation", "libellesimplifie", "libelle", "informationcomplementaire"],
      amount: ["montant", "montantenreuros"],
      debit: ["debit"],
      credit: ["credit"],
      account: ["numerodecompte", "compte"],
    },
    signature: ["libellesimplifie", "libelleoperation", "typeoperation"],
  }),
  profile({
    id: "credit_agricole",
    name: "Crédit Agricole",
    country: "FR",
    defaultCurrency: "EUR",
    columns: {
      date: ["date", "dateoperation"],
      description: ["libelle", "libelleoperation"],
      debit: ["debiteuros", "debit"],
      credit: ["crediteuros", "credit"],
      amount: ["montant"],
    },
    signature: ["debiteuros", "crediteuros"],
  }),
  profile({
    id: "rakbank",
    name: "RAKBANK",
    country: "AE",
    defaultCurrency: "AED",
    columns: {
      date: ["transactiondate", "postingdate", "date", "valuedate"],
      description: ["description", "narration", "transactiondetails", "details"],
      amount: ["amount"],
      debit: ["debit", "debitamount", "withdrawal"],
      credit: ["credit", "creditamount", "deposit"],
      balance: ["balance", "runningbalance", "availablebalance"],
      currency: ["currency"],
    },
    signature: [],
  }),
  profile({
    id: "mashreq",
    name: "Mashreq",
    country: "AE",
    defaultCurrency: "AED",
    columns: {
      date: ["date", "transactiondate", "valuedate", "postingdate"],
      description: ["description", "narration", "transactiondescription", "remarks"],
      amount: ["amount"],
      debit: ["debit", "withdrawal", "debitamount"],
      credit: ["credit", "deposit", "creditamount"],
      balance: ["balance", "runningbalance"],
      currency: ["currency"],
    },
    signature: [],
  }),
  // ---- French banks beyond the first four. Their statement exports share the
  // same generic vocabulary (Date / Libellé / Débit / Crédit / Montant / Solde),
  // so most cannot be told apart by headers alone: detection reports an
  // "ambiguous" match and the user confirms the bank in the dialog.
  profile({
    id: "lcl",
    name: "LCL",
    country: "FR",
    defaultCurrency: "EUR",
    columns: {
      date: ["date", "dateoperation"],
      description: ["libelle", "libelleoperation", "intitule"],
      amount: ["montant"],
      debit: ["debit"],
      credit: ["credit"],
      balance: ["solde"],
    },
    signature: [],
  }),
  profile({
    id: "caisse_epargne",
    name: "Caisse d'Épargne",
    country: "FR",
    defaultCurrency: "EUR",
    columns: {
      date: ["date", "dateoperation", "datedecomptabilisation"],
      description: ["libelle", "libelleoperation", "detail", "detaildelecriture"],
      debit: ["debit", "debiteuros"],
      credit: ["credit", "crediteuros"],
      amount: ["montant"],
      balance: ["solde"],
      account: ["numerodecompte", "compte"],
    },
    signature: ["numerodoperation"],
  }),
  profile({
    id: "banque_populaire",
    name: "Banque Populaire",
    country: "FR",
    defaultCurrency: "EUR",
    columns: {
      date: ["date", "dateoperation", "datedecomptabilisation"],
      description: ["libelle", "libelleoperation", "detail", "detaildelecriture"],
      debit: ["debit", "debiteuros"],
      credit: ["credit", "crediteuros"],
      amount: ["montant"],
      balance: ["solde"],
      account: ["numerodecompte", "compte"],
    },
    signature: ["numerodoperation"],
  }),
  profile({
    id: "la_banque_postale",
    name: "La Banque Postale",
    country: "FR",
    defaultCurrency: "EUR",
    columns: {
      date: ["date", "dateoperation"],
      description: ["libelle", "libelleoperation"],
      amount: ["montanteur", "montant", "montantenreuros"],
    },
    signature: ["montanteur"],
  }),
  profile({
    id: "cic",
    name: "CIC",
    country: "FR",
    defaultCurrency: "EUR",
    columns: {
      date: ["date", "dateoperation"],
      description: ["libelle", "libelleoperation"],
      debit: ["debit"],
      credit: ["credit"],
      amount: ["montant"],
      balance: ["solde"],
    },
    signature: ["datedevaleur"],
  }),
  profile({
    id: "credit_mutuel",
    name: "Crédit Mutuel",
    country: "FR",
    defaultCurrency: "EUR",
    columns: {
      date: ["date", "dateoperation"],
      description: ["libelle", "libelleoperation"],
      debit: ["debit"],
      credit: ["credit"],
      amount: ["montant"],
      balance: ["solde"],
    },
    signature: ["datedevaleur"],
  }),
  profile({
    id: "hsbc_france",
    name: "HSBC France",
    country: "FR",
    defaultCurrency: "EUR",
    columns: {
      date: ["date", "dateoperation"],
      description: ["libelle", "description", "libelleoperation"],
      amount: ["montant"],
      debit: ["debit"],
      credit: ["credit"],
      balance: ["solde"],
    },
    signature: [],
  }),
  profile({
    id: "hello_bank",
    name: "Hello bank!",
    country: "FR",
    defaultCurrency: "EUR",
    columns: {
      date: ["dateoperation", "date"],
      description: ["libellesimplifie", "libelleoperation", "libelle"],
      amount: ["montant"],
      debit: ["debit"],
      credit: ["credit"],
      account: ["numerodecompte", "compte"],
    },
    signature: ["libellesimplifie", "libelleoperation"],
  }),
  profile({
    id: "fortuneo",
    name: "Fortuneo",
    country: "FR",
    defaultCurrency: "EUR",
    columns: {
      date: ["dateoperation", "date"],
      description: ["libelle", "libelleoperation"],
      debit: ["debit"],
      credit: ["credit"],
      amount: ["montant"],
    },
    signature: ["datevaleur"],
  }),
  profile({
    id: "ing_france",
    name: "ING France",
    country: "FR",
    defaultCurrency: "EUR",
    columns: {
      date: ["date", "dateoperation"],
      description: ["libelle", "detaildelecriture", "description"],
      amount: ["montant"],
      debit: ["debit"],
      credit: ["credit"],
      balance: ["solde"],
    },
    signature: [],
  }),
  // ---- PDF-only banks (read through OCR): no CSV columns, never detected from a CSV.
  profile({
    id: "hsbc_uae",
    name: "HSBC UAE",
    country: "AE",
    defaultCurrency: "AED",
    pdfOnly: true,
    columns: { date: [], description: [] },
    signature: [],
  }),
  profile({
    id: "cbi",
    name: "Commercial Bank International (CBI)",
    country: "AE",
    defaultCurrency: "AED",
    pdfOnly: true,
    columns: { date: [], description: [] },
    signature: [],
  }),
  profile({
    id: "cbd",
    name: "Commercial Bank of Dubai (CBD)",
    country: "AE",
    defaultCurrency: "AED",
    pdfOnly: true,
    columns: { date: [], description: [] },
    signature: [],
  }),
  profile({
    id: "hsbc_uae_card",
    name: "HSBC UAE credit card",
    country: "AE",
    defaultCurrency: "AED",
    pdfOnly: true,
    columns: { date: [], description: [] },
    signature: [],
  }),
];

export function getBankProfile(id: string): BankProfile | undefined {
  return BANK_PROFILES.find((p) => p.id === id);
}

// --- Normalisation helpers ------------------------------------------------------

/** Lowercase, strip accents and everything that isn't a letter/digit. */
export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findColumn(headers: string[], aliases?: string[]): number {
  if (!aliases) return -1;
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const index = normalized.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
}

/** English and French month names/abbreviations, accent-free and lowercase. */
const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, january: 1, janvier: 1,
  feb: 2, fev: 2, fevr: 2, february: 2, fevrier: 2,
  mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, april: 4, avril: 4,
  may: 5, mai: 5,
  jun: 6, june: 6, juin: 6,
  jul: 7, july: 7, juil: 7, juillet: 7,
  aug: 8, august: 8, aout: 8,
  sep: 9, sept: 9, september: 9, septembre: 9,
  oct: 10, october: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11,
  dec: 12, december: 12, decembre: 12,
};

function validDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Dates as banks write them: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY,
 * "05 Jan 2026" (a time part is ignored). Slash/dash/dot forms are DAY-first —
 * the convention of every bank in these profiles (UAE and France); a month-
 * first file would fail validation or be misread, which is why the parsed
 * preview is shown before importing.
 */
export function parseBankDate(raw: string): string | null {
  const value = raw.trim().replace(/[T ]\d{1,2}:\d{2}(:\d{2})?.*$/, "");
  let m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  m = value.match(/^(\d{1,2})\s+([A-Za-zéûÉ.]+)\s+(\d{4})$/);
  if (m) {
    const month = MONTHS[normalizeHeader(m[2])];
    return month ? validDate(+m[3], month, +m[1]) : null;
  }
  return null;
}

/**
 * Amounts in either convention: "1,234.56", "1.234,56", "1 234,56", "-12,50",
 * "(12.50)", "12.50-", with currency symbols/letters ignored. The LAST of "."
 * or "," is the decimal mark when something follows it that isn't a 3-digit
 * thousands group (or when it is the only separator and ≤2 digits follow).
 */
export function parseBankAmount(raw: string): number | null {
  // Currency symbols/letters first, so "€ -45,00" and "-AED 45" keep their sign.
  let v = raw.replace(/[^\d.,()\-−\s]/g, "").trim();
  if (v === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  if (/-\s*$/.test(v)) {
    negative = true;
    v = v.replace(/-\s*$/, "");
  }
  if (/^[-−]/.test(v)) {
    negative = true;
    v = v.replace(/^[-−]/, "");
  }
  v = v.replace(/[^\d.,]/g, "");
  if (v === "") return null;

  const lastDot = v.lastIndexOf(".");
  const lastComma = v.lastIndexOf(",");
  let decimalMark: "." | "," | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: the later one is the decimal mark ("1,234.56" / "1.234,56").
    decimalMark = lastDot > lastComma ? "." : ",";
  } else if (lastDot >= 0 || lastComma >= 0) {
    const mark = lastDot >= 0 ? "." : ",";
    const parts = v.split(mark);
    const tail = parts[parts.length - 1];
    // Several marks ("1.234.567") or a single mark followed by exactly 3 digits
    // after a short head ("1,234") is a thousands group; otherwise it's decimal.
    const thousandsOnly =
      parts.length > 2 || (tail.length === 3 && parts[0].length >= 1 && parts[0].length <= 3);
    decimalMark = thousandsOnly ? null : mark;
  }
  let normalized: string;
  if (decimalMark) {
    const thousands = decimalMark === "." ? "," : ".";
    normalized = v.split(thousands).join("").replace(decimalMark, ".");
  } else {
    normalized = v.replace(/[.,]/g, "");
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

// --- Parsing ---------------------------------------------------------------------

export type NormalizedTx = {
  date: string;
  description: string;
  /** Signed: positive = money in. */
  amount: number;
  /** Running balance after this transaction, when the file has one. */
  balance: number | null;
};

export type StatementGroup = {
  /** Account identifier found in the file ("" when the file doesn't say). */
  accountRef: string;
  currency: string;
  rows: NormalizedTx[];
};

export type StatementParseResult = {
  profile: BankProfile;
  delimiter: string;
  groups: StatementGroup[];
  errors: { line: number; message: string }[];
  /** Rows ignored because they were blank / preamble / footer (no date). */
  skipped: number;
};

export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 40).join("\n");
  const counts = [";", "\t", ","].map((d) => ({ d, n: sample.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

function scoreProfile(p: BankProfile, headers: string[]): number {
  const normalized = headers.map(normalizeHeader);
  let score = 0;
  if (findColumn(headers, p.columns.date) >= 0) score += 2;
  if (findColumn(headers, p.columns.description) >= 0) score += 1;
  if (
    findColumn(headers, p.columns.amount) >= 0 ||
    (findColumn(headers, p.columns.debit) >= 0 && findColumn(headers, p.columns.credit) >= 0)
  ) {
    score += 2;
  }
  if (findColumn(headers, p.columns.balance) >= 0) score += 1;
  for (const s of p.signature) if (normalized.includes(s)) score += 3;
  return score;
}

function isHeaderRow(p: BankProfile, row: string[]): boolean {
  return (
    findColumn(row, p.columns.date) >= 0 &&
    (findColumn(row, p.columns.amount) >= 0 ||
      findColumn(row, p.columns.debit) >= 0 ||
      findColumn(row, p.columns.credit) >= 0)
  );
}

export type Detection = { profile: BankProfile; score: number; ambiguous: boolean };

/** Best-matching profile for a file, and whether another profile scored the same (the caller then asks the user). */
export function detectProfile(text: string): Detection | null {
  const delimiter = detectDelimiter(text);
  const table = parseCsvTable(text.replace(/^﻿/, ""), delimiter).slice(0, 60);
  let best: { profile: BankProfile; score: number } | null = null;
  let tie = false;
  for (const p of BANK_PROFILES) {
    const headerRow = table.find((r) => isHeaderRow(p, r));
    if (!headerRow) continue;
    const score = scoreProfile(p, headerRow);
    if (!best || score > best.score) {
      best = { profile: p, score };
      tie = false;
    } else if (score === best.score) {
      tie = true;
    }
  }
  return best ? { ...best, ambiguous: tie } : null;
}

const IBAN_PATTERN = /\b((?:FR|AE)\d{2}(?:[ ]?[0-9A-Z]){11,30})\b/;

/** Account identifiers are compared on their last 4 characters, spaces/case ignored. */
export function accountTail(ref: string): string {
  return ref.replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(-4);
}

export function parseStatement(text: string, profileId: BankProfileId): StatementParseResult | { error: string } {
  const bankProfile = getBankProfile(profileId);
  if (!bankProfile) return { error: "Unknown bank profile." };
  const delimiter = detectDelimiter(text);
  const table = parseCsvTable(text.replace(/^﻿/, ""), delimiter);
  const headerIndex = table.slice(0, 60).findIndex((r) => isHeaderRow(bankProfile, r));
  if (headerIndex < 0) {
    return { error: "Couldn't find this bank's columns (a date and an amount / debit / credit column)." };
  }

  const headers = table[headerIndex].map((h) => h.trim());
  const col = {
    date: findColumn(headers, bankProfile.columns.date),
    description: findColumn(headers, bankProfile.columns.description),
    amount: findColumn(headers, bankProfile.columns.amount),
    debit: findColumn(headers, bankProfile.columns.debit),
    credit: findColumn(headers, bankProfile.columns.credit),
    balance: findColumn(headers, bankProfile.columns.balance),
    account: findColumn(headers, bankProfile.columns.account),
    currency: findColumn(headers, bankProfile.columns.currency),
  };

  // An IBAN in the preamble identifies the account when there's no account column.
  let preambleRef = "";
  for (const row of table.slice(0, headerIndex)) {
    const match = row.join(" ").match(IBAN_PATTERN);
    if (match) {
      preambleRef = match[1];
      break;
    }
  }

  const groups = new Map<string, StatementGroup>();
  const errors: StatementParseResult["errors"] = [];
  let skipped = 0;

  // parseCsvTable drops fully-blank lines, so map each table row back to its physical line.
  // Only reliable when no quoted field spans lines (row count equals non-blank line count).
  const physicalLines: number[] = [];
  text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((l, n) => {
      if (l !== "") physicalLines.push(n + 1);
    });
  const hasLineMap = physicalLines.length === table.length;

  table.slice(headerIndex + 1).forEach((cells, i) => {
    const line = hasLineMap ? physicalLines[headerIndex + 1 + i] : headerIndex + 2 + i;
    const rawDate = (cells[col.date] ?? "").trim();
    if (rawDate === "") {
      skipped += 1;
      return;
    }
    const date = parseBankDate(rawDate);
    if (!date) {
      // A non-date first cell is a footer/total line, not a bad transaction.
      if (!/\d/.test(rawDate)) skipped += 1;
      else errors.push({ line, message: `Couldn't read "${rawDate}" as a date.` });
      return;
    }

    let amount: number | null = null;
    if (col.amount >= 0 && (cells[col.amount] ?? "").trim() !== "") {
      amount = parseBankAmount(cells[col.amount]);
    } else if (col.debit >= 0 || col.credit >= 0) {
      const debit = col.debit >= 0 && (cells[col.debit] ?? "").trim() !== "" ? parseBankAmount(cells[col.debit]) : 0;
      const credit = col.credit >= 0 && (cells[col.credit] ?? "").trim() !== "" ? parseBankAmount(cells[col.credit]) : 0;
      if (debit !== null && credit !== null && (debit !== 0 || credit !== 0)) {
        amount = Math.abs(credit) - Math.abs(debit);
      }
    }
    if (amount === null) {
      errors.push({ line, message: "No readable amount on this row." });
      return;
    }

    const balance = col.balance >= 0 && (cells[col.balance] ?? "").trim() !== "" ? parseBankAmount(cells[col.balance]) : null;
    const accountRef = (col.account >= 0 ? (cells[col.account] ?? "").trim() : "") || preambleRef;
    const currency = ((col.currency >= 0 ? (cells[col.currency] ?? "").trim() : "") || bankProfile.defaultCurrency).toUpperCase();
    const key = `${accountRef}|${currency}`;
    if (!groups.has(key)) groups.set(key, { accountRef, currency, rows: [] });
    groups.get(key)!.rows.push({
      date,
      description: col.description >= 0 ? (cells[col.description] ?? "").trim() : "",
      amount,
      balance,
    });
  });

  return { profile: bankProfile, delimiter, groups: Array.from(groups.values()), errors, skipped };
}

// --- Routing ----------------------------------------------------------------------------

export type RoutableAccount = {
  id: string;
  name: string;
  currency: string;
  /** Saved from an earlier import (see `rememberCashAccountBank`). */
  bankProfile?: string;
  accountRef?: string;
};

export type RouteMatch =
  | { kind: "matched"; assetId: string; reason: "account_ref" | "bank_and_currency" }
  | { kind: "unmatched"; candidates: string[] };

/**
 * Decides which Cash account a group of statement rows belongs to:
 *  1. the account identifier's last 4 characters equal a saved one (exact);
 *  2. otherwise, when exactly ONE Cash account is remembered for this bank in
 *     this currency;
 *  3. otherwise unmatched — the dialog asks, and can remember the answer.
 * Never guesses between several candidates.
 */
export function routeGroup(
  group: Pick<StatementGroup, "accountRef" | "currency">,
  profileId: BankProfileId,
  accounts: RoutableAccount[],
): RouteMatch {
  const tail = accountTail(group.accountRef);
  if (tail.length === 4) {
    const byRef = accounts.filter((a) => a.accountRef && accountTail(a.accountRef) === tail);
    if (byRef.length === 1) return { kind: "matched", assetId: byRef[0].id, reason: "account_ref" };
  }
  const byBank = accounts.filter(
    (a) => a.bankProfile === profileId && a.currency.toUpperCase() === group.currency.toUpperCase(),
  );
  if (byBank.length === 1) return { kind: "matched", assetId: byBank[0].id, reason: "bank_and_currency" };
  return { kind: "unmatched", candidates: byBank.map((a) => a.id) };
}
