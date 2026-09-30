/**
 * Saxo Bank (Saxo Markets) trade-export parser — the first entry in the
 * broker registry (`broker-registry.ts`). Saxo's `.xlsx`/`.csv` trade
 * exports contain a "Trades" sheet/section with (per the column names
 * supplied for this feature): `Trade execution date`, `Trade Event Type`
 * ("Bought"/"Sold"), `Traded Quantity`, `Price`, `Instrument Symbol` (e.g.
 * `AMZN:xnas`), `Instrument`, `Instrument currency`. Header matching below
 * is case-insensitive/trimmed rather than exact-string, since real exports
 * can vary slightly in capitalization/spacing from a spec.
 *
 * A real `.xlsx` export isn't a single table: Saxo stacks multiple tables
 * (Transactions, Trades, Bookings, …) vertically in the same sheet, each
 * with its own title row and header row. `findHeaderRowIndex` scans the
 * whole sheet for the Trades section's header (matched on the
 * `Trade Event Type` + `Traded Quantity` pair, unique to that table) rather
 * than assuming row 0 or a fixed search window, and `mapRows` stops
 * consuming rows at the next section's title row (or a blank row), not just
 * a blank row, so it doesn't run into Bookings' header/data as bogus trades.
 */
import * as XLSX from "xlsx";
import { parseCsv } from "@/lib/csv-parser";
import type { BrokerParseResult, ParsedTrade, ParsedTradeRowError, TradeSide } from "./types";

type RawCell = string | number | Date | undefined | null;
type RawRow = RawCell[];

const COLUMN_ALIASES = {
  date: ["trade execution date"],
  eventType: ["trade event type"],
  quantity: ["traded quantity"],
  price: ["price"],
  symbol: ["instrument symbol"],
  name: ["instrument"],
  currency: ["instrument currency", "currency"],
  /** Optional: Saxo's own trade id (joins a trade to its Transactions-sheet row) and, if a trades table carries it, the booked cash amount. */
  tradeId: ["trade id"],
  bookedAmount: ["booked amount"],
} as const;

type ColumnKey = keyof typeof COLUMN_ALIASES;

/**
 * Real Saxo `.xlsx` exports mix regular spaces and non-breaking spaces
 * (U+00A0) within the same multi-word header — e.g. "Trade Event Type"
 * comes through with a NBSP between every word while "Trade execution
 * date" doesn't. `.trim()` alone only strips edge whitespace, not an NBSP
 * sitting between two words, so a plain trim+lowercase silently fails to
 * match any alias containing a NBSP. Collapsing all whitespace (`\s`
 * matches NBSP in JS regex) to a single regular space before comparing
 * fixes this regardless of which headers Saxo happens to affect.
 */
function normalizeHeader(header: unknown): string {
  return String(header ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Scans every row for the "Trades" section's header row. Saxo's `.xlsx`
 * export stacks multiple tables (Transactions, Trades, Bookings, …)
 * vertically in the same sheet, each with its own title + header row, so
 * this can't just take row 0 (or even the first row containing a
 * plausible-looking date column — "Transactions" has its own date column
 * too). Matching on both "Trade Event Type" and "Traded Quantity" — a pair
 * unique to the Trades section — avoids false-matching an earlier table.
 */
function findHeaderRowIndex(rows: RawRow[]): number {
  for (let i = 0; i < rows.length; i++) {
    const normalized = rows[i].map(normalizeHeader);
    const hasEventType = normalized.includes(COLUMN_ALIASES.eventType[0]);
    const hasQuantity = normalized.includes(COLUMN_ALIASES.quantity[0]);
    if (hasEventType && hasQuantity) {
      return i;
    }
  }
  return -1;
}

/**
 * True once the row stream has run past the Trades section's data — either
 * a blank row, or a new section's title row. Saxo's stacked-table sheet
 * separates sections with a lone-cell title row (e.g. "Bookings"), not
 * necessarily a blank line, so a single populated cell is treated as a
 * section break the same as an empty row.
 */
function isSectionBreak(row: RawRow | undefined): boolean {
  if (!row) return true;
  const nonEmpty = row.filter((cell) => cell !== undefined && cell !== null && cell !== "");
  return nonEmpty.length <= 1;
}

function buildColumnIndex(headerRow: RawRow): Partial<Record<ColumnKey, number>> {
  const normalized = headerRow.map(normalizeHeader);
  const index: Partial<Record<ColumnKey, number>> = {};

  for (const key of Object.keys(COLUMN_ALIASES) as ColumnKey[]) {
    const aliases: readonly string[] = COLUMN_ALIASES[key];
    const found = normalized.findIndex((cell) => aliases.includes(cell));
    if (found !== -1) index[key] = found;
  }

  return index;
}

function parseCellDate(raw: RawCell): string | null {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = new Date(raw.trim());
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function parseSide(raw: RawCell): TradeSide | null {
  const text = String(raw ?? "").trim().toLowerCase();
  if (text.includes("bought") || text === "buy") return "buy";
  if (text.includes("sold") || text === "sell") return "sell";
  return null;
}

function parseSymbol(raw: RawCell): { ticker: string; exchange: string | null } {
  const text = String(raw ?? "").trim();
  const [ticker, exchange] = text.split(":");
  return {
    ticker: (ticker ?? "").trim().toUpperCase(),
    exchange: exchange ? exchange.trim().toUpperCase() : null,
  };
}

function mapRows(rows: RawRow[], startRow: number): BrokerParseResult {
  const headerRow = rows[startRow];
  const columns = buildColumnIndex(headerRow);

  const missing = (Object.keys(COLUMN_ALIASES) as ColumnKey[]).filter(
    (key) =>
      columns[key] === undefined &&
      key !== "currency" &&
      key !== "tradeId" &&
      key !== "bookedAmount",
  );
  if (missing.length > 0) {
    return {
      trades: [],
      errors: [
        {
          rowIndex: startRow,
          message: `Missing expected column(s): ${missing.join(", ")}. This may not be a Saxo Bank trade export.`,
        },
      ],
    };
  }

  const trades: ParsedTrade[] = [];
  const errors: ParsedTradeRowError[] = [];

  for (let i = startRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (isSectionBreak(row)) {
      break;
    }
    const rowIndex = i - startRow - 1;

    const tradeDate = parseCellDate(row[columns.date!]);
    if (!tradeDate) {
      errors.push({ rowIndex, message: `Could not read "${String(row[columns.date!] ?? "")}" as a trade date.` });
      continue;
    }

    const side = parseSide(row[columns.eventType!]);
    if (!side) {
      errors.push({
        rowIndex,
        message: `Unrecognized Trade Event Type "${String(row[columns.eventType!] ?? "")}" — expected "Bought" or "Sold".`,
      });
      continue;
    }

    const quantity = Math.abs(Number(row[columns.quantity!]));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push({ rowIndex, message: `Could not read "${String(row[columns.quantity!] ?? "")}" as a quantity.` });
      continue;
    }

    const price = Number(row[columns.price!]);
    if (!Number.isFinite(price) || price <= 0) {
      errors.push({ rowIndex, message: `Could not read "${String(row[columns.price!] ?? "")}" as a price.` });
      continue;
    }

    const rawSymbol = String(row[columns.symbol!] ?? "").trim();
    if (!rawSymbol) {
      errors.push({ rowIndex, message: "Missing Instrument Symbol." });
      continue;
    }
    const { ticker, exchange } = parseSymbol(rawSymbol);

    const instrumentName = String(row[columns.name!] ?? ticker).trim();
    const currency =
      columns.currency !== undefined ? String(row[columns.currency] ?? "").trim().toUpperCase() : "";

    const bookedAmount =
      columns.bookedAmount !== undefined ? parseAmountCell(row[columns.bookedAmount]) : null;
    const brokerTradeId =
      columns.tradeId !== undefined ? String(row[columns.tradeId] ?? "").trim() : "";

    trades.push({
      instrumentSymbol: rawSymbol,
      ticker,
      exchange,
      instrumentName,
      currency: currency || "USD",
      tradeDate,
      side,
      quantity,
      price,
      ...(bookedAmount != null && bookedAmount > 0 ? { bookedAmount } : {}),
      ...(brokerTradeId ? { brokerTradeId } : {}),
    });
  }

  return { trades, errors };
}

/** Absolute magnitude of an amount cell (numbers, or strings with thousands separators/parenthesised negatives); `null` if it isn't one. */
function parseAmountCell(raw: RawCell): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.abs(raw) : null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const n = Number(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.abs(n) : null;
}

/** Checked in priority order: the Transactions sheet's `Client ID` (e.g. 10164571) is the number Saxo shows the client; `Account ID` (e.g. 373048INET) is a per-sub-account id and only a fallback. */
const CLIENT_ID_LABELS = ["client id", "clientid", "client id:"];
const ACCOUNT_ID_LABELS = ["account id", "accountid", "account id:"];
const ACCOUNT_LABELS = [...CLIENT_ID_LABELS, ...ACCOUNT_ID_LABELS];

function cellText(cell: RawCell): string {
  return cell === undefined || cell === null ? "" : String(cell).trim();
}

const looksLikeAccountId = (text: string) =>
  /^[A-Za-z0-9-]{4,20}$/.test(text) && /\d/.test(text) && !ACCOUNT_LABELS.includes(normalizeHeader(text));

/**
 * Finds the brokerage account number. Saxo puts it in a `Client ID` /
 * `Account ID` column or a "label | value" pair; both are handled by
 * scanning every row for that label and taking either the next cell in the
 * same row or the first populated cell beneath it in the same column. Falls
 * back to a 6–10 digit run in the file name (Saxo names exports like
 * `Portfolio_10164571_2021-01-01_….pdf`/xlsx) that isn't a YYYYMMDD date.
 * Verified against a real export (`Transactions_10164571_….xlsx`): the
 * Transactions sheet's `Client ID` column holds `10164571`.
 */
export function extractSaxoAccountId(rows: RawRow[], fileName: string): string | undefined {
  const limit = Math.min(rows.length, 500);
  for (const labels of [CLIENT_ID_LABELS, ACCOUNT_ID_LABELS]) {
    for (let r = 0; r < limit; r++) {
      const row = rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        if (!labels.includes(normalizeHeader(row[c]))) continue;
        const pair = cellText(row[c + 1]);
        if (looksLikeAccountId(pair)) return pair;
        for (let k = r + 1; k < Math.min(rows.length, r + 6); k++) {
          const value = cellText(rows[k]?.[c]);
          if (looksLikeAccountId(value)) return value;
        }
      }
    }
  }

  for (const match of fileName.matchAll(/(?<!\d)(\d{6,10})(?!\d)/g)) {
    const digits = match[1];
    const isDate = digits.length === 8 && /^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(digits);
    if (!isDate) return digits;
  }
  return undefined;
}

function findTradesSheet(workbook: XLSX.WorkBook): { sheet: XLSX.WorkSheet; rows: RawRow[]; headerRow: number } | null {
  const byName = workbook.SheetNames.find((name) => name.trim().toLowerCase() === "trades");
  const candidates = byName ? [byName] : workbook.SheetNames;

  for (const name of candidates) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { header: 1, raw: true }) as unknown as RawRow[];
    const headerRow = findHeaderRowIndex(rows);
    if (headerRow !== -1) {
      return { sheet, rows, headerRow };
    }
  }

  return null;
}

/**
 * Joins trades to the Transactions sheet by `Trade ID` (every trade has one
 * row there). In that sheet `Booked Amount` is the full signed cash effect
 * including commission (e.g. -530.99 for 14 @ 37.86) and `Total cost` is
 * just the commission (-1), so `Booked Amount` becomes the trade's cost and
 * `Total cost` its brokerage fee.
 */
function enrichFromTransactions(trades: ParsedTrade[], sheets: RawRow[][]): void {
  const byTradeId = new Map<string, { booked: number | null; commission: number | null }>();

  for (const rows of sheets) {
    const headerIdx = rows.findIndex((row) => {
      const n = row.map(normalizeHeader);
      // "Transaction Type" distinguishes the Transactions sheet from Bookings,
      // which also has Trade ID + Booked Amount but splits each trade into
      // separate value and commission rows.
      return (
        n.includes("trade id") && n.includes("booked amount") && n.includes("transaction type")
      );
    });
    if (headerIdx === -1) continue;
    const header = rows[headerIdx].map(normalizeHeader);
    const idCol = header.indexOf("trade id");
    const bookedCol = header.indexOf("booked amount");
    const costCol = header.indexOf("total cost");

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const id = cellText(rows[i]?.[idCol]);
      if (!id) continue;
      byTradeId.set(id, {
        booked: parseAmountCell(rows[i][bookedCol]),
        commission: costCol >= 0 ? parseAmountCell(rows[i][costCol]) : null,
      });
    }
  }

  for (const trade of trades) {
    const match = trade.brokerTradeId ? byTradeId.get(trade.brokerTradeId) : undefined;
    if (!match) continue;
    if (match.booked && match.booked > 0 && trade.bookedAmount === undefined) {
      trade.bookedAmount = match.booked;
    }
    if (match.commission && match.commission > 0 && trade.brokerage === undefined) {
      trade.brokerage = match.commission;
    }
  }
}

export function parseSaxoWorkbook(buffer: ArrayBuffer, fileName: string): BrokerParseResult {
  const isCsv = fileName.toLowerCase().endsWith(".csv");

  if (isCsv) {
    const text = new TextDecoder("utf-8").decode(buffer);
    const { headers, rows: csvRows } = parseCsv(text);
    if (headers.length === 0) {
      return { trades: [], errors: [{ rowIndex: 0, message: "This file has no data rows." }] };
    }
    const rows: RawRow[] = [headers, ...csvRows.map((row) => headers.map((h) => row[h]))];
    const headerRow = findHeaderRowIndex(rows);
    if (headerRow === -1) {
      return {
        trades: [],
        errors: [{ rowIndex: 0, message: 'Could not find a "Trade Event Type"/"Traded Quantity" header row — this may not be a Saxo Bank trade export.' }],
      };
    }
    return { ...mapRows(rows, headerRow), accountId: extractSaxoAccountId(rows, fileName) };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    return { trades: [], errors: [{ rowIndex: 0, message: "Could not read this file as an Excel workbook." }] };
  }

  const found = findTradesSheet(workbook);
  if (!found) {
    return {
      trades: [],
      errors: [{ rowIndex: 0, message: 'Could not find a "Trades" section (with "Trade Event Type" and "Traded Quantity" columns) in this workbook.' }],
    };
  }

  const sheetRows = workbook.SheetNames.map(
    (name) =>
      XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets[name], {
        header: 1,
        raw: true,
      }) as unknown as RawRow[],
  );
  const result = mapRows(found.rows, found.headerRow);
  enrichFromTransactions(result.trades, sheetRows);
  return { ...result, accountId: extractSaxoAccountId(sheetRows.flat(), fileName) };
}
