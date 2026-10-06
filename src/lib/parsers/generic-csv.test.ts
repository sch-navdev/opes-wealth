import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  parseGenericCsvTrades,
  parseGenericWorkbook,
  type GenericCsvMapping,
} from "./generic-csv";

const mapping = (dateFormat: GenericCsvMapping["dateFormat"] = "YYYY-MM-DD"): GenericCsvMapping => ({
  tickerColumn: "Ticker",
  sideColumn: "Side",
  quantityColumn: "Qty",
  priceColumn: "Price",
  dateColumn: "Date",
  dateFormat,
  currency: "USD",
});

const row = (over: Record<string, string> = {}) => ({
  Ticker: "aapl",
  Side: "Buy",
  Qty: "10",
  Price: "150.5",
  Date: "2026-01-15",
  ...over,
});

describe("parseGenericCsvTrades", () => {
  it("parses a well formed row", () => {
    const { trades, errors } = parseGenericCsvTrades([row()], mapping());
    expect(errors).toEqual([]);
    expect(trades).toEqual([
      {
        instrumentSymbol: "AAPL",
        ticker: "AAPL",
        exchange: null,
        instrumentName: "AAPL",
        currency: "USD",
        tradeDate: "2026-01-15",
        side: "buy",
        quantity: 10,
        price: 150.5,
      },
    ]);
  });

  it("accepts buy/bought/sell/sold in any case", () => {
    const { trades } = parseGenericCsvTrades(
      [row({ Side: "BOUGHT" }), row({ Side: " sold " }), row({ Side: "Sell" })],
      mapping(),
    );
    expect(trades.map((t) => t.side)).toEqual(["buy", "sell", "sell"]);
  });

  it("rejects unknown sides", () => {
    const { trades, errors } = parseGenericCsvTrades([row({ Side: "dividend" })], mapping());
    expect(trades).toEqual([]);
    expect(errors).toEqual([{ rowIndex: 0, message: expect.stringContaining("dividend") }]);
  });

  it("stores quantity as a positive magnitude even when exported negative for sells", () => {
    const { trades } = parseGenericCsvTrades([row({ Side: "Sell", Qty: "-5" })], mapping());
    expect(trades[0].quantity).toBe(5);
    expect(trades[0].side).toBe("sell");
  });

  it("errors on missing ticker, zero/non-numeric quantity, and non-positive price", () => {
    const { trades, errors } = parseGenericCsvTrades(
      [
        row({ Ticker: "  " }),
        row({ Qty: "0" }),
        row({ Qty: "abc" }),
        row({ Qty: "" }),
        row({ Price: "0" }),
        row({ Price: "-3" }),
        row({ Price: "x" }),
        row(),
      ],
      mapping(),
    );
    expect(trades).toHaveLength(1);
    expect(errors.map((e) => e.rowIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("interprets DD/MM/YYYY and MM/DD/YYYY per the mapping", () => {
    const dmy = parseGenericCsvTrades([row({ Date: "03/04/2026" })], mapping("DD/MM/YYYY"));
    const mdy = parseGenericCsvTrades([row({ Date: "03/04/2026" })], mapping("MM/DD/YYYY"));
    expect(dmy.trades[0].tradeDate).toBe("2026-04-03");
    expect(mdy.trades[0].tradeDate).toBe("2026-03-04");
  });

  it("pads single digit day and month", () => {
    const { trades } = parseGenericCsvTrades([row({ Date: "5/6/2026" })], mapping("DD/MM/YYYY"));
    expect(trades[0].tradeDate).toBe("2026-06-05");
  });

  it("errors on dates not matching the format", () => {
    const { errors } = parseGenericCsvTrades(
      [row({ Date: "15 Jan 2026" }), row({ Date: "" })],
      mapping(),
    );
    expect(errors).toHaveLength(2);
  });

  it("errors when the mapped column is absent from the row", () => {
    const { errors } = parseGenericCsvTrades([{ Ticker: "X" }], mapping());
    expect(errors).toHaveLength(1);
  });

  it("returns empty output for empty input", () => {
    expect(parseGenericCsvTrades([], mapping())).toEqual({ trades: [], errors: [] });
  });

  it("keeps duplicate rows (netting/dedupe is done downstream)", () => {
    const { trades } = parseGenericCsvTrades([row(), row()], mapping());
    expect(trades).toHaveLength(2);
  });

  // The bank-csv parser rejects impossible calendar dates ("2026-02-30",
  // "31/04/2026"); the generic trade parser only checks the shape, so a
  // nonsense date flows into the trade history.
  it.fails("rejects impossible calendar dates like 2026-02-30", () => {
    const { trades, errors } = parseGenericCsvTrades([row({ Date: "2026-02-30" })], mapping());
    expect(trades).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it.fails("rejects impossible calendar dates like 31/04/2026 (DD/MM/YYYY)", () => {
    const { trades } = parseGenericCsvTrades([row({ Date: "31/04/2026" })], mapping("DD/MM/YYYY"));
    expect(trades).toEqual([]);
  });

  it.fails("rejects a month of 13", () => {
    const { trades } = parseGenericCsvTrades([row({ Date: "01/13/2026" })], mapping("DD/MM/YYYY"));
    expect(trades).toEqual([]);
  });
});

describe("parseGenericWorkbook", () => {
  function workbookBuffer(aoa: unknown[][], sheetName = "Sheet1"): ArrayBuffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return out;
  }

  it("reads the first sheet into headers and string rows", () => {
    const { headers, rows } = parseGenericWorkbook(
      workbookBuffer([
        ["Ticker", " Side ", "Qty"],
        ["AAPL", "Buy", 10],
        ["MSFT", "Sell", 5],
      ]),
    );
    expect(headers).toEqual(["Ticker", "Side", "Qty"]);
    expect(rows).toEqual([
      { Ticker: "AAPL", Side: "Buy", Qty: "10" },
      { Ticker: "MSFT", Side: "Sell", Qty: "5" },
    ]);
  });

  it("skips fully blank rows", () => {
    const { rows } = parseGenericWorkbook(workbookBuffer([["A", "B"], ["1", "2"], ["", ""], ["3", "4"]]));
    expect(rows).toHaveLength(2);
  });

  it("returns empty for an empty sheet", () => {
    expect(parseGenericWorkbook(workbookBuffer([]))).toEqual({ headers: [], rows: [] });
  });
});
