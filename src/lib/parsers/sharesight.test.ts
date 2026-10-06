import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseSharesightWorkbook } from "./sharesight";

function csvBuffer(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function xlsxBuffer(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const HEADER = "Market,Code,Trade Date,Quantity,Price,Transaction Type,Brokerage,Currency,Name";

describe("parseSharesightWorkbook (CSV)", () => {
  it("parses buys and sells with exchange, fee and currency", () => {
    const csv = [
      HEADER,
      "NASDAQ,aapl,2026-01-15,10,150.5,Buy,9.95,usd,Apple Inc",
      "ASX,CBA,2026-02-01,5,100,Sell,-10,aud,Commonwealth Bank",
    ].join("\n");
    const { trades, errors, skippedNonTradeCount } = parseSharesightWorkbook(csvBuffer(csv), "t.csv");
    expect(errors).toEqual([]);
    expect(skippedNonTradeCount).toBeUndefined();
    expect(trades[0]).toMatchObject({
      instrumentSymbol: "AAPL:NASDAQ",
      ticker: "AAPL",
      exchange: "NASDAQ",
      instrumentName: "Apple Inc",
      currency: "USD",
      tradeDate: "2026-01-15",
      side: "buy",
      quantity: 10,
      price: 150.5,
      brokerage: 9.95,
    });
    expect(trades[1]).toMatchObject({ side: "sell", brokerage: 10, currency: "AUD" });
  });

  it("silently counts Watchlist / Cancel / Pending / Unconfirmed rows as skipped, not errors", () => {
    const csv = [
      HEADER,
      "NASDAQ,AAPL,2026-01-15,10,150,Buy,0,USD,Apple",
      "NASDAQ,MSFT,2026-01-15,0,0,Watchlist,0,USD,Microsoft",
      "NASDAQ,MSFT,2026-01-15,1,1,Cancelled,0,USD,Microsoft",
      "NASDAQ,MSFT,2026-01-15,1,1, pending ,0,USD,Microsoft",
      "NASDAQ,MSFT,2026-01-15,1,1,UNCONFIRMED,0,USD,Microsoft",
    ].join("\n");
    const { trades, errors, skippedNonTradeCount } = parseSharesightWorkbook(csvBuffer(csv), "t.csv");
    expect(trades).toHaveLength(1);
    expect(errors).toEqual([]);
    expect(skippedNonTradeCount).toBe(4);
  });

  it("errors (not skips) on genuinely unknown transaction types", () => {
    const csv = [HEADER, "NASDAQ,AAPL,2026-01-15,10,150,Dividend,0,USD,Apple"].join("\n");
    const { trades, errors } = parseSharesightWorkbook(csvBuffer(csv), "t.csv");
    expect(trades).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("reports malformed rows by index and ignores blank rows", () => {
    const csv = [
      HEADER,
      "NASDAQ,AAPL,garbage,10,150,Buy,0,USD,Apple",
      "NASDAQ,AAPL,2026-01-15,abc,150,Buy,0,USD,Apple",
      "NASDAQ,AAPL,2026-01-15,10,0,Buy,0,USD,Apple",
      "NASDAQ,,2026-01-15,10,150,Buy,0,USD,Apple",
      ",,,,,,,,",
      "NASDAQ,AAPL,2026-01-16,10,150,Buy,0,USD,Apple",
    ].join("\n");
    const { trades, errors } = parseSharesightWorkbook(csvBuffer(csv), "t.csv");
    expect(trades).toHaveLength(1);
    expect(errors.map((e) => e.rowIndex)).toEqual([0, 1, 2, 3]);
  });

  it("uses negative quantities as magnitudes", () => {
    const csv = [HEADER, "NASDAQ,AAPL,2026-01-15,-10,150,Sell,0,USD,Apple"].join("\n");
    expect(parseSharesightWorkbook(csvBuffer(csv), "t.csv").trades[0].quantity).toBe(10);
  });

  it("defaults currency to USD and name to the ticker; null exchange when market blank", () => {
    const csv = [
      "Market,Code,Trade Date,Quantity,Price,Transaction Type",
      ",abc,2026-01-15,1,2,Buy",
    ].join("\n");
    const { trades } = parseSharesightWorkbook(csvBuffer(csv), "t.csv");
    expect(trades[0]).toMatchObject({
      currency: "USD",
      instrumentName: "ABC",
      exchange: null,
      instrumentSymbol: "ABC",
    });
    expect(trades[0].brokerage).toBeUndefined();
  });

  it("accepts header aliases (Date, Type, Exchange, Symbol, Qty, Commission)", () => {
    const csv = [
      "Exchange,Symbol,Date,Qty,Price,Type,Commission",
      "LSE,vod,2026-03-01,100,0.7,Buy,3",
    ].join("\n");
    const { trades, errors } = parseSharesightWorkbook(csvBuffer(csv), "t.csv");
    expect(errors).toEqual([]);
    expect(trades[0]).toMatchObject({ ticker: "VOD", exchange: "LSE", brokerage: 3 });
  });

  it("flags a file with the key headers but missing required columns", () => {
    const csv = ["Code,Trade Date,Transaction Type", "A,2026-01-01,Buy"].join("\n");
    const { trades, errors } = parseSharesightWorkbook(csvBuffer(csv), "t.csv");
    expect(trades).toEqual([]);
    expect(errors[0].message).toContain("market");
  });

  it("errors for empty input and for non-Sharesight CSVs", () => {
    expect(parseSharesightWorkbook(csvBuffer(""), "t.csv").errors).toHaveLength(1);
    expect(parseSharesightWorkbook(csvBuffer("a,b\n1,2"), "t.csv").errors).toHaveLength(1);
  });

  it("returns zero trades and no errors for a header-only file", () => {
    const { trades, errors } = parseSharesightWorkbook(csvBuffer(HEADER), "t.csv");
    expect(trades).toEqual([]);
    expect(errors).toEqual([]);
  });

  // sharesight.ts:248-255 — the CSV path runs parseCsv, which always treats the
  // FIRST line as the header and keys every later row by it, so the intro-line
  // scan in findHeaderRow can never see the real header (its cells are
  // collapsed onto the blank intro-line keys). The module docs promise intro
  // lines are tolerated; only the xlsx path honours that.
  it("finds the header row below an intro line (CSV)", () => {
    const csv = ["Sharesight All Trades Report,,,,,,,,", HEADER, "NASDAQ,AAPL,2026-01-15,1,2,Buy,0,USD,Apple"].join("\n");
    const { trades, errors } = parseSharesightWorkbook(csvBuffer(csv), "t.csv");
    expect(errors).toEqual([]);
    expect(trades).toHaveLength(1);
  });

  it("does not de-duplicate identical rows (that happens at import time via tradeId)", () => {
    const row = "NASDAQ,AAPL,2026-01-15,1,2,Buy,0,USD,Apple";
    expect(parseSharesightWorkbook(csvBuffer([HEADER, row, row].join("\n")), "t.csv").trades).toHaveLength(2);
  });
});

describe("parseSharesightWorkbook (xlsx)", () => {
  it("reads an All Trades sheet and skips non-trade rows", () => {
    const aoa = [
      HEADER.split(","),
      ["NASDAQ", "AAPL", "2026-01-15", 10, 150, "Buy", 5, "USD", "Apple"],
      ["NASDAQ", "TSLA", "2026-01-15", 1, 1, "Watchlist", 0, "USD", "Tesla"],
    ];
    const { trades, skippedNonTradeCount } = parseSharesightWorkbook(xlsxBuffer({ "All Trades": aoa }), "t.xlsx");
    expect(trades).toHaveLength(1);
    expect(trades[0].brokerage).toBe(5);
    expect(skippedNonTradeCount).toBe(1);
  });

  it("finds the header row below an intro line (xlsx)", () => {
    const aoa = [
      ["Sharesight All Trades Report"],
      HEADER.split(","),
      ["NASDAQ", "AAPL", "2026-01-15", 1, 2, "Buy", 0, "USD", "Apple"],
    ];
    const { trades, errors } = parseSharesightWorkbook(xlsxBuffer({ Report: aoa }), "t.xlsx");
    expect(errors).toEqual([]);
    expect(trades).toHaveLength(1);
  });

  it("errors when no sheet has the expected header", () => {
    const { trades, errors } = parseSharesightWorkbook(xlsxBuffer({ S: [["a"], [1]] }), "t.xlsx");
    expect(trades).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});
