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
    (key) => columns[key] === undefined && key !== "currency",
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
    });
  }

  return { trades, errors };
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
    return mapRows(rows, headerRow);
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

  return mapRows(found.rows, found.headerRow);
}
