/**
 * Backend for CSV Bank Uploads (tracker: `tracker/CSV-Bank-Uploads.md`,
 * Phase 1 Step 8). Scope, per that note: import a bank-exported CSV onto
 * the existing `assets`/`asset_history` schema — no new tables. Supports
 * two export shapes:
 *
 * - **Running-balance** (`parseBankCsvRows`): one row per date, with a
 *   Balance column already reflecting the account total that day — maps
 *   directly onto `asset_history(recorded_date, value)`.
 * - **Transactions-only** (`parseTransactionRows` + `computeRunningBalance`,
 *   added as a follow-up to the above): Date + either a signed Amount
 *   column or separate Credit/Debit columns, no running balance at all.
 *   `computeRunningBalance` derives one, anchored on a starting balance,
 *   into the exact same `ParsedBankCsvRow[]` shape — so `csv-import-dialog.tsx`
 *   and `importBankCsvHistory` need no changes at all for this mode; they
 *   already only ever see `{ recorded_date, value }` rows regardless of
 *   which export shape produced them.
 */

export type BankCsvDateFormat = "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";

export type BankCsvColumnMapping = {
  dateColumn: string;
  balanceColumn: string;
  dateFormat: BankCsvDateFormat;
  /** Optional — shown in the import preview only (`asset_history` has no column for it). */
  descriptionColumn?: string;
};

export type ParsedBankCsvRow = {
  recorded_date: string; // always normalized to YYYY-MM-DD
  value: number;
  /** Preview-only text from the mapped Description column; never persisted. */
  description?: string;
};

export type BankCsvRowError = {
  rowIndex: number; // 0-based, matches the row's position in the parsed data (excluding the header row)
  message: string;
};

export type BankCsvImportResult = {
  validRows: ParsedBankCsvRow[];
  errors: BankCsvRowError[];
};

/**
 * Parses one raw CSV cell into an ISO `YYYY-MM-DD` date string per the
 * given format. Deliberately strict — a bank CSV's date format is picked
 * explicitly by whoever maps the columns (see `BankCsvColumnMapping`),
 * never guessed, since silently misreading `03/04/2026` as March 4th vs.
 * April 3rd would corrupt financial history.
 */
function parseDate(raw: string, format: BankCsvDateFormat): string | null {
  const value = raw.trim();

  if (format === "YYYY-MM-DD") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return isValidCalendarDate(+match[1], +match[2], +match[3])
      ? value
      : null;
  }

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, first, second, yearStr] = match;
  const year = +yearStr;
  const month = format === "MM/DD/YYYY" ? +first : +second;
  const day = format === "MM/DD/YYYY" ? +second : +first;

  if (!isValidCalendarDate(year, month, day)) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Reject e.g. Feb 30th rather than let `Date` silently roll it into March.
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Parses one raw CSV cell into a signed balance. Strips currency symbols,
 * thousands separators, and surrounding whitespace; treats parenthesized
 * amounts (`(123.45)`) as negative, the common accounting-export
 * convention for debits.
 */
function parseAmount(raw: string): number | null {
  let value = raw.trim();
  if (value === "") return null;

  let negative = false;
  if (value.startsWith("(") && value.endsWith(")")) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (value.startsWith("-")) {
    negative = true;
    value = value.slice(1);
  }

  value = value.replace(/[^0-9.]/g, "");
  if (value === "") return null;

  const num = Number(value);
  if (!Number.isFinite(num)) return null;

  return negative ? -num : num;
}

/**
 * Validates and parses every row of an already-CSV-parsed bank export
 * (see `parseCsv` in `csv-parser.ts`) against the chosen column mapping.
 * Returns every successfully-parsed row plus a row-indexed error for every
 * row that couldn't be parsed — nothing is silently dropped or guessed.
 */
export function parseBankCsvRows(
  rows: Record<string, string>[],
  mapping: BankCsvColumnMapping,
): BankCsvImportResult {
  const validRows: ParsedBankCsvRow[] = [];
  const errors: BankCsvRowError[] = [];
  const seenDates = new Set<string>();

  rows.forEach((row, rowIndex) => {
    const rawDate = row[mapping.dateColumn];
    const rawBalance = row[mapping.balanceColumn];

    if (rawDate === undefined || rawBalance === undefined) {
      errors.push({
        rowIndex,
        message: `Missing "${mapping.dateColumn}" or "${mapping.balanceColumn}" column.`,
      });
      return;
    }

    const recorded_date = parseDate(rawDate, mapping.dateFormat);
    if (!recorded_date) {
      errors.push({
        rowIndex,
        message: `Could not read "${rawDate}" as a ${mapping.dateFormat} date.`,
      });
      return;
    }

    const value = parseAmount(rawBalance);
    if (value === null) {
      errors.push({
        rowIndex,
        message: `Could not read "${rawBalance}" as a balance amount.`,
      });
      return;
    }

    if (seenDates.has(recorded_date)) {
      errors.push({
        rowIndex,
        message: `Duplicate date ${recorded_date} — a balance for this date already appears earlier in the file.`,
      });
      return;
    }
    seenDates.add(recorded_date);

    const description = mapping.descriptionColumn
      ? row[mapping.descriptionColumn]?.trim() || undefined
      : undefined;
    validRows.push({ recorded_date, value, description });
  });

  return { validRows, errors };
}

// --- Transactions-only mode (Date + Amount, or Date + Credit/Debit) -----

/** A single dated transaction, signed: positive = credit/deposit, negative = debit/withdrawal — regardless of whether it came from one signed Amount column or a separate unsigned Credit/Debit pair. */
export type ParsedTransactionRow = {
  recorded_date: string;
  amount: number;
  description?: string;
};

export type BankCsvTransactionMapping =
  | {
      dateColumn: string;
      dateFormat: BankCsvDateFormat;
      amountMode: "single";
      amountColumn: string;
      descriptionColumn?: string;
    }
  | {
      dateColumn: string;
      dateFormat: BankCsvDateFormat;
      amountMode: "creditDebit";
      creditColumn: string;
      debitColumn: string;
      descriptionColumn?: string;
    };

export type BankCsvTransactionResult = {
  validRows: ParsedTransactionRow[];
  errors: BankCsvRowError[];
};

/**
 * Validates and parses every row of a transactions-only export into dated,
 * signed amounts. Unlike `parseBankCsvRows`'s running-balance mode, the
 * same date appearing on multiple rows is normal here (several
 * transactions posted the same day) and is not an error — `computeRunningBalance`
 * below sums same-day transactions into that day's single balance point.
 */
export function parseTransactionRows(
  rows: Record<string, string>[],
  mapping: BankCsvTransactionMapping,
): BankCsvTransactionResult {
  const validRows: ParsedTransactionRow[] = [];
  const errors: BankCsvRowError[] = [];

  rows.forEach((row, rowIndex) => {
    const rawDate = row[mapping.dateColumn];
    if (rawDate === undefined) {
      errors.push({ rowIndex, message: `Missing "${mapping.dateColumn}" column.` });
      return;
    }

    const recorded_date = parseDate(rawDate, mapping.dateFormat);
    if (!recorded_date) {
      errors.push({ rowIndex, message: `Could not read "${rawDate}" as a ${mapping.dateFormat} date.` });
      return;
    }

    let amount: number;

    if (mapping.amountMode === "single") {
      const raw = row[mapping.amountColumn];
      if (raw === undefined) {
        errors.push({ rowIndex, message: `Missing "${mapping.amountColumn}" column.` });
        return;
      }
      const parsed = parseAmount(raw);
      if (parsed === null) {
        errors.push({ rowIndex, message: `Could not read "${raw}" as an amount.` });
        return;
      }
      amount = parsed;
    } else {
      const rawCredit = row[mapping.creditColumn];
      const rawDebit = row[mapping.debitColumn];
      if (rawCredit === undefined || rawDebit === undefined) {
        errors.push({
          rowIndex,
          message: `Missing "${mapping.creditColumn}" or "${mapping.debitColumn}" column.`,
        });
        return;
      }
      const credit = rawCredit.trim() === "" ? 0 : parseAmount(rawCredit);
      const debit = rawDebit.trim() === "" ? 0 : parseAmount(rawDebit);
      if (credit === null || debit === null) {
        errors.push({
          rowIndex,
          message: `Could not read "${credit === null ? rawCredit : rawDebit}" as an amount.`,
        });
        return;
      }
      if (credit === 0 && debit === 0) {
        errors.push({ rowIndex, message: "Row has no Credit or Debit amount." });
        return;
      }
      amount = Math.abs(credit) - Math.abs(debit);
    }

    const description = mapping.descriptionColumn
      ? row[mapping.descriptionColumn]?.trim() || undefined
      : undefined;
    validRows.push({ recorded_date, amount, description });
  });

  return { validRows, errors };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Turns dated transaction amounts into one running-balance point per
 * distinct date, anchored on `startingBalance` — the account's balance
 * immediately *before* the earliest transaction in the file. Produces the
 * exact same `ParsedBankCsvRow[]` shape `parseBankCsvRows` does, so nothing
 * downstream (the dialog's preview, `importBankCsvHistory`) needs to know
 * which mode originally produced it. Multiple same-day transactions are
 * summed into that date's single point (the day's actual closing balance).
 */
export function computeRunningBalance(
  transactions: ParsedTransactionRow[],
  startingBalance: number,
): ParsedBankCsvRow[] {
  const byDate = new Map<string, number>();
  const descriptions = new Map<string, string[]>();
  for (const t of transactions) {
    byDate.set(t.recorded_date, (byDate.get(t.recorded_date) ?? 0) + t.amount);
    if (t.description) {
      descriptions.set(t.recorded_date, [...(descriptions.get(t.recorded_date) ?? []), t.description]);
    }
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  let runningBalance = startingBalance;
  const result: ParsedBankCsvRow[] = [];

  for (const date of sortedDates) {
    runningBalance += byDate.get(date)!;
    // Several same-day transactions collapse into one point: list them all.
    const description = descriptions.get(date)?.join(" · ");
    result.push({ recorded_date: date, value: round2(runningBalance), description });
  }

  return result;
}
