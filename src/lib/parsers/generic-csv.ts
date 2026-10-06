/**
 * Broker Trade Import's "Upload via file" path — a generic, user-mapped CSV
 * importer for a trade export that isn't from a registered broker (see
 * `broker-registry.ts`). Unlike the Saxo parser, this never guesses a
 * column layout: the user explicitly maps Ticker/Side/Quantity/Price/Date
 * columns (same "never guess an ambiguous mapping" principle as
 * `lib/bank-csv.ts`'s date-format picker) via the UI in
 * `add-investments-dialog.tsx`.
 */
import * as XLSX from "xlsx";
import type { ParsedTrade, ParsedTradeRowError, TradeSide } from "./types";

export type GenericCsvDateFormat = "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";

/**
 * Reads an `.xlsx` file's first sheet into the same `{headers, rows}` shape
 * `parseCsv` produces, so the generic "Upload via file" column-mapping UI
 * doesn't need to know whether the user dropped a CSV or a spreadsheet.
 * `raw: false` formats each cell the way Excel displays it (dates, numbers)
 * so downstream parsing (`parseDate`, `Number(...)`) sees the same kind of
 * string a hand-written CSV would contain.
 */
export function parseGenericWorkbook(buffer: ArrayBuffer): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) return { headers: [], rows: [] };

  const table = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown as string[][];
  if (table.length === 0) return { headers: [], rows: [] };

  const headers = table[0].map((h) => String(h ?? "").trim());
  const rows = table
    .slice(1)
    .filter((cells) => cells.some((cell) => String(cell ?? "").trim() !== ""))
    .map((cells) => {
      const row: Record<string, string> = {};
      headers.forEach((header, i) => {
        row[header] = String(cells[i] ?? "").trim();
      });
      return row;
    });

  return { headers, rows };
}

export type GenericCsvMapping = {
  tickerColumn: string;
  sideColumn: string;
  quantityColumn: string;
  priceColumn: string;
  dateColumn: string;
  dateFormat: GenericCsvDateFormat;
  currency: string;
};

function parseDate(raw: string, format: GenericCsvDateFormat): string | null {
  const value = raw.trim();

  if (format === "YYYY-MM-DD") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match && isRealDate(Number(match[1]), Number(match[2]), Number(match[3])) ? value : null;
  }

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, first, second, yearStr] = match;
  const month = format === "MM/DD/YYYY" ? first : second;
  const day = format === "MM/DD/YYYY" ? second : first;
  if (!isRealDate(Number(yearStr), Number(month), Number(day))) return null;
  return `${yearStr}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseSide(raw: string): TradeSide | null {
  const text = raw.trim().toLowerCase();
  if (text === "buy" || text === "bought") return "buy";
  if (text === "sell" || text === "sold") return "sell";
  return null;
}

export function parseGenericCsvTrades(
  rows: Record<string, string>[],
  mapping: GenericCsvMapping,
): { trades: ParsedTrade[]; errors: ParsedTradeRowError[] } {
  const trades: ParsedTrade[] = [];
  const errors: ParsedTradeRowError[] = [];

  rows.forEach((row, rowIndex) => {
    const rawTicker = row[mapping.tickerColumn];
    const rawSide = row[mapping.sideColumn];
    const rawQuantity = row[mapping.quantityColumn];
    const rawPrice = row[mapping.priceColumn];
    const rawDate = row[mapping.dateColumn];

    if (!rawTicker?.trim()) {
      errors.push({ rowIndex, message: "Missing ticker." });
      return;
    }

    const side = parseSide(rawSide ?? "");
    if (!side) {
      errors.push({ rowIndex, message: `Could not read "${rawSide ?? ""}" as Buy or Sell.` });
      return;
    }

    const quantity = Math.abs(Number(rawQuantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push({ rowIndex, message: `Could not read "${rawQuantity ?? ""}" as a quantity.` });
      return;
    }

    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price <= 0) {
      errors.push({ rowIndex, message: `Could not read "${rawPrice ?? ""}" as a price.` });
      return;
    }

    const tradeDate = parseDate(rawDate ?? "", mapping.dateFormat);
    if (!tradeDate) {
      errors.push({ rowIndex, message: `Could not read "${rawDate ?? ""}" as a ${mapping.dateFormat} date.` });
      return;
    }

    const ticker = rawTicker.trim().toUpperCase();

    trades.push({
      instrumentSymbol: ticker,
      ticker,
      exchange: null,
      instrumentName: ticker,
      currency: mapping.currency,
      tradeDate,
      side,
      quantity,
      price,
    });
  });

  return { trades, errors };
}
