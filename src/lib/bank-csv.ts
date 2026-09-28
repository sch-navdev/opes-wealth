/**
 * Backend for CSV Bank Uploads (tracker: `tracker/CSV-Bank-Uploads.md`,
 * Phase 1 Step 8). Scope, per that note: import a bank-exported CSV onto
 * the existing `assets`/`asset_history` schema — no new tables. This
 * supports the common "running balance" style bank export (one row per
 * date, with a Balance column already reflecting the account total that
 * day), which maps directly onto `asset_history(recorded_date, value)`.
 *
 * Deliberately NOT supported yet: a transactions-only export (Date,
 * Description, Amount, no running Balance) would need a starting balance
 * and a cumulative sum to derive a balance per date — a real feature, not
 * a one-line addition, and left for a follow-up rather than guessed at
 * here.
 *
 * No UI consumes this yet — this is the backend half of the feature,
 * built ahead of the upload dropzone so the dropzone has something real to
 * call once it exists.
 */

export type BankCsvDateFormat = "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";

export type BankCsvColumnMapping = {
  dateColumn: string;
  balanceColumn: string;
  dateFormat: BankCsvDateFormat;
};

export type ParsedBankCsvRow = {
  recorded_date: string; // always normalized to YYYY-MM-DD
  value: number;
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

    validRows.push({ recorded_date, value });
  });

  return { validRows, errors };
}
