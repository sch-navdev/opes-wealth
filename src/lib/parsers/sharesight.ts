/**
 * Sharesight trade-export parser — the second entry in the broker registry
 * (`broker-registry.ts`), alongside Saxo Bank. Sharesight's standard "All
 * Trades" CSV/XLSX export is a single flat table (unlike Saxo's, which
 * stacks several tables vertically in one sheet) with columns: `Market`
 * (exchange code), `Code` (stock code/ticker), `Trade Date`, `Quantity`,
 * `Price`, `Transaction Type` ("Buy"/"Sell"), `Brokerage`, `Currency`.
 * Header matching is case-insensitive/whitespace-normalized, same posture
 * as the Saxo parser, since real exports can vary slightly from a spec.
 *
 * A Sharesight export can also contain rows that were never an executed
 * trade: a synced Watchlist entry (Transaction Type "Watchlist"), or a
 * trade later cancelled or left unconfirmed ("Cancel"/"Pending"/
 * "Unconfirmed"). The import must only process finalized trades, so these
 * are filtered out up front — silently, not as a row error, since nothing
 * about the row itself is malformed.
 */
import * as XLSX from "xlsx";
import { parseCsv } from "@/lib/csv-parser";
import type { BrokerParseResult, ParsedTrade, ParsedTradeRowError, TradeSide } from "./types";

type RawCell = string | number | Date | undefined | null;
type RawRow = RawCell[];

const COLUMN_ALIASES = {
  date: ["trade date", "date"],
  transactionType: ["transaction type", "type"],
  market: ["market", "market code", "exchange"],
  code: ["code", "stock code", "symbol", "ticker"],
  quantity: ["quantity", "qty"],
  price: ["price"],
  brokerage: ["brokerage", "brokerage/fees", "fees", "commission"],
  currency: ["currency", "brokerage currency"],
  name: ["name", "instrument", "company"],
} as const;

type ColumnKey = keyof typeof COLUMN_ALIASES;

/** Every column except a human-readable name/currency is required to trust this is really a Sharesight export. */
const REQUIRED_COLUMNS: ColumnKey[] = [
  "date",
  "transactionType",
  "market",
  "code",
  "quantity",
  "price",
];

/**
 * Transaction Type values Sharesight uses for a row that never actually
 * executed as a trade: a Watchlist entry synced from Sharesight's
 * Watchlist feature (no real position ever existed), or a trade later
 * cancelled/left unconfirmed. Matched case-insensitively/trimmed.
 */
const NON_TRADE_TRANSACTION_TYPES = new Set([
  "watchlist",
  "watch list",
  "cancel",
  "cancelled",
  "canceled",
  "pending",
  "unconfirmed",
]);

/** See `saxo.ts`'s identical helper — collapses regular spaces and non-breaking spaces (U+00A0) alike, so a header with either still matches. */
function normalizeHeader(header: unknown): string {
  return String(header ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isNonTradeTransactionType(raw: RawCell): boolean {
  return NON_TRADE_TRANSACTION_TYPES.has(String(raw ?? "").trim().toLowerCase());
}

function isBlankRow(row: RawRow | undefined): boolean {
  if (!row) return true;
  return row.every((cell) => cell === undefined || cell === null || cell === "");
}

/** Sharesight's export is a single flat table, so this just needs to find the one header row — scanning rather than assuming row 0 in case the export has an intro/title line above it. */
function findHeaderRowIndex(rows: RawRow[]): number {
  for (let i = 0; i < rows.length; i++) {
    const normalized = rows[i].map(normalizeHeader);
    const hasDate = COLUMN_ALIASES.date.some((alias) => normalized.includes(alias));
    const hasCode = COLUMN_ALIASES.code.some((alias) => normalized.includes(alias));
    const hasType = COLUMN_ALIASES.transactionType.some((alias) => normalized.includes(alias));
    if (hasDate && hasCode && hasType) return i;
  }
  return -1;
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
  if (text === "buy") return "buy";
  if (text === "sell") return "sell";
  return null;
}

function mapRows(rows: RawRow[], startRow: number): BrokerParseResult {
  const headerRow = rows[startRow];
  const columns = buildColumnIndex(headerRow);

  const missing = REQUIRED_COLUMNS.filter((key) => columns[key] === undefined);
  if (missing.length > 0) {
    return {
      trades: [],
      errors: [
        {
          rowIndex: startRow,
          message: `Missing expected column(s): ${missing.join(", ")}. This may not be a Sharesight trade export.`,
        },
      ],
    };
  }

  const trades: ParsedTrade[] = [];
  const errors: ParsedTradeRowError[] = [];
  let skippedNonTradeCount = 0;

  for (let i = startRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (isBlankRow(row)) continue;
    const rowIndex = i - startRow - 1;

    if (isNonTradeTransactionType(row[columns.transactionType!])) {
      skippedNonTradeCount++;
      continue;
    }

    const tradeDate = parseCellDate(row[columns.date!]);
    if (!tradeDate) {
      errors.push({ rowIndex, message: `Could not read "${String(row[columns.date!] ?? "")}" as a trade date.` });
      continue;
    }

    const side = parseSide(row[columns.transactionType!]);
    if (!side) {
      errors.push({
        rowIndex,
        message: `Unrecognized Transaction Type "${String(row[columns.transactionType!] ?? "")}" — expected "Buy" or "Sell".`,
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

    const ticker = String(row[columns.code!] ?? "").trim().toUpperCase();
    if (!ticker) {
      errors.push({ rowIndex, message: "Missing Code (stock code)." });
      continue;
    }

    const exchange =
      columns.market !== undefined
        ? String(row[columns.market] ?? "").trim().toUpperCase() || null
        : null;

    const instrumentName =
      columns.name !== undefined ? String(row[columns.name] ?? "").trim() || ticker : ticker;

    const currency =
      columns.currency !== undefined ? String(row[columns.currency] ?? "").trim().toUpperCase() : "";

    // Sharesight's Brokerage column is a real per-trade fee figure — unlike
    // Saxo, which has no such column, so `ParsedTrade.brokerage` stays
    // `undefined` there and is only ever UI-defaulted.
    const brokerageRaw = columns.brokerage !== undefined ? Number(row[columns.brokerage]) : NaN;
    const brokerage = Number.isFinite(brokerageRaw) ? Math.abs(brokerageRaw) : undefined;

    trades.push({
      instrumentSymbol: exchange ? `${ticker}:${exchange}` : ticker,
      ticker,
      exchange,
      instrumentName,
      currency: currency || "USD",
      tradeDate,
      side,
      quantity,
      price,
      brokerage,
    });
  }

  return {
    trades,
    errors,
    skippedNonTradeCount: skippedNonTradeCount > 0 ? skippedNonTradeCount : undefined,
  };
}

function findTradesSheet(
  workbook: XLSX.WorkBook,
): { rows: RawRow[]; headerRow: number } | null {
  const byName = workbook.SheetNames.find((name) =>
    ["trades", "all trades"].includes(name.trim().toLowerCase()),
  );
  const candidates = byName ? [byName] : workbook.SheetNames;

  for (const name of candidates) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { header: 1, raw: true }) as unknown as RawRow[];
    const headerRow = findHeaderRowIndex(rows);
    if (headerRow !== -1) {
      return { rows, headerRow };
    }
  }

  return null;
}

export function parseSharesightWorkbook(buffer: ArrayBuffer, fileName: string): BrokerParseResult {
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
        errors: [
          {
            rowIndex: 0,
            message: 'Could not find a "Trade Date"/"Code"/"Transaction Type" header row — this may not be a Sharesight trade export.',
          },
        ],
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
      errors: [
        {
          rowIndex: 0,
          message: 'Could not find a "Trade Date"/"Code"/"Transaction Type" header row in this workbook.',
        },
      ],
    };
  }

  return mapRows(found.rows, found.headerRow);
}
