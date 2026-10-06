import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { extractSaxoAccountId, parseSaxoWorkbook } from "./saxo";

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

const HEADER =
  "Trade execution date,Trade Event Type,Traded Quantity,Price,Instrument Symbol,Instrument,Instrument currency";

describe("parseSaxoWorkbook (CSV)", () => {
  it("parses bought and sold rows with symbol/exchange split and upper-casing", () => {
    const csv = [
      HEADER,
      "2026-01-15,Bought,10,150.25,AMZN:xnas,Amazon.com Inc.,USD",
      "2026-02-20,Sold,-4,160,AMZN:xnas,Amazon.com Inc.,USD",
    ].join("\n");
    const { trades, errors } = parseSaxoWorkbook(csvBuffer(csv), "trades.csv");
    expect(errors).toEqual([]);
    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({
      instrumentSymbol: "AMZN:xnas",
      ticker: "AMZN",
      exchange: "XNAS",
      instrumentName: "Amazon.com Inc.",
      currency: "USD",
      tradeDate: "2026-01-15",
      side: "buy",
      quantity: 10,
      price: 150.25,
    });
    expect(trades[1]).toMatchObject({ side: "sell", quantity: 4, tradeDate: "2026-02-20" });
  });

  it("handles quoted fields with embedded commas and CRLF endings", () => {
    const csv = [
      HEADER,
      '2026-01-15,Bought,1,10,ABC:xlon,"Acme, Inc.",GBP',
    ].join("\r\n");
    const { trades } = parseSaxoWorkbook(csvBuffer(csv + "\r\n"), "x.csv");
    expect(trades[0].instrumentName).toBe("Acme, Inc.");
    expect(trades[0].currency).toBe("GBP");
  });

  it("matches headers case-insensitively and across non-breaking spaces", () => {
    const csv = [
      "trade execution date,Trade Event Type,TRADED QUANTITY,price,instrument symbol,instrument,instrument currency",
      "2026-01-15,Bought,1,10,ABC:xlon,Acme,gbp",
    ].join("\n");
    const { trades, errors } = parseSaxoWorkbook(csvBuffer(csv), "x.csv");
    expect(errors).toEqual([]);
    expect(trades[0].currency).toBe("GBP");
  });

  it("defaults currency to USD when the column is empty", () => {
    const csv = [HEADER, "2026-01-15,Bought,1,10,ABC:xlon,Acme,"].join("\n");
    expect(parseSaxoWorkbook(csvBuffer(csv), "x.csv").trades[0].currency).toBe("USD");
  });

  it("leaves exchange null for a symbol without a suffix", () => {
    const csv = [HEADER, "2026-01-15,Bought,1,10,abc,Acme,USD"].join("\n");
    const { trades } = parseSaxoWorkbook(csvBuffer(csv), "x.csv");
    expect(trades[0].ticker).toBe("ABC");
    expect(trades[0].exchange).toBeNull();
  });

  it("reports row errors with 0-based data row indices and keeps good rows", () => {
    const csv = [
      HEADER,
      "not-a-date,Bought,1,10,ABC:xlon,Acme,USD",
      "2026-01-15,Transfer,1,10,ABC:xlon,Acme,USD",
      "2026-01-15,Bought,0,10,ABC:xlon,Acme,USD",
      "2026-01-15,Bought,1,0,ABC:xlon,Acme,USD",
      "2026-01-15,Bought,1,10,,Acme,USD",
      "2026-01-16,Bought,2,11,ABC:xlon,Acme,USD",
    ].join("\n");
    const { trades, errors } = parseSaxoWorkbook(csvBuffer(csv), "x.csv");
    expect(trades).toHaveLength(1);
    expect(trades[0].tradeDate).toBe("2026-01-16");
    expect(errors.map((e) => e.rowIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it("reads optional Trade ID, Booked Amount (as a magnitude) and ISIN", () => {
    const csv = [
      HEADER + ",Trade ID,Booked Amount,Instrument ISIN",
      "2026-01-15,Bought,14,37.86,XYZ:xams,Xyz,EUR,T-1,-530.99,nl0000000001",
    ].join("\n");
    const { trades } = parseSaxoWorkbook(csvBuffer(csv), "x.csv");
    expect(trades[0]).toMatchObject({ brokerTradeId: "T-1", bookedAmount: 530.99, isin: "NL0000000001" });
  });

  it("returns an error for an empty file", () => {
    const { trades, errors } = parseSaxoWorkbook(csvBuffer(""), "x.csv");
    expect(trades).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("returns an error when the file is not a Saxo trades export", () => {
    const { trades, errors } = parseSaxoWorkbook(csvBuffer("a,b\n1,2\n"), "x.csv");
    expect(trades).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("returns a header-only file as zero trades and zero errors", () => {
    const { trades, errors } = parseSaxoWorkbook(csvBuffer(HEADER + "\n"), "x.csv");
    expect(trades).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("flags a missing required column", () => {
    const csv = ["Trade execution date,Trade Event Type,Traded Quantity,Instrument Symbol,Instrument", "2026-01-15,Bought,1,A:x,A"].join("\n");
    const { trades, errors } = parseSaxoWorkbook(csvBuffer(csv), "x.csv");
    expect(trades).toEqual([]);
    expect(errors[0].message).toContain("price");
  });

  it("picks the account id from the file name when no Client ID column exists", () => {
    const csv = [HEADER, "2026-01-15,Bought,1,10,ABC:xlon,Acme,USD"].join("\n");
    expect(parseSaxoWorkbook(csvBuffer(csv), "Trades_10164571_2026-01-01.csv").accountId).toBe("10164571");
  });

  it("does not parse non-.csv names as CSV (garbage xlsx gives a readable error, not a throw)", () => {
    const result = parseSaxoWorkbook(csvBuffer("hello"), "x.xlsx");
    expect(result.trades).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("parseSaxoWorkbook (xlsx)", () => {
  const tradesSheet = [
    ["Trades"],
    [
      "Trade execution date",
      "Trade Event Type",
      "Traded Quantity",
      "Price",
      "Instrument Symbol",
      "Instrument",
      "Instrument currency",
      "Trade ID",
    ],
    ["2026-09-17", "Bought", 14, 37.86, "SAP:xetr", "SAP SE", "EUR", "T1"],
    ["2026-09-18", "Sold", -3, 40, "SAP:xetr", "SAP SE", "EUR", "T2"],
    [],
    ["Bookings"],
    ["Trade execution date", "Booked Amount"],
    ["2026-09-17", -1],
  ];
  const transactionsSheet = [
    [
      "Client ID",
      "Trade ID",
      "Transaction Type",
      "Booked Amount",
      "Total cost",
      "Event",
      "Instrument Symbol",
      "Trade Date",
      "Bk Record Id",
      "Corporate action id",
      "_Currency",
    ],
    ["10164571", "T1", "Trade", -530.99, -1, "Buy", "SAP:xetr", "", "", "", "EUR"],
    ["10164571", "T2", "Trade", 119, -1, "Sell", "SAP:xetr", "", "", "", "EUR"],
    ["10164571", "", "Corporate action", 24.67, "", "Cash dividend", "IVV:arcx", "2025-03-20T20:00:00Z", "bk9", "ca1", "eur"],
    ["10164571", "", "Corporate action", 5, "", "Stock split", "IVV:arcx", "2025-03-20T20:00:00Z", "bk10", "ca2", "eur"],
  ];

  it("reads the Trades section and stops at the next section title row", () => {
    const { trades, errors } = parseSaxoWorkbook(xlsxBuffer({ Trades: tradesSheet }), "t.xlsx");
    expect(errors).toEqual([]);
    expect(trades.map((t) => [t.side, t.quantity, t.ticker])).toEqual([
      ["buy", 14, "SAP"],
      ["sell", 3, "SAP"],
    ]);
  });

  it("locates the Trades table even when it is not on a sheet named Trades", () => {
    const { trades } = parseSaxoWorkbook(xlsxBuffer({ Export: tradesSheet }), "t.xlsx");
    expect(trades).toHaveLength(2);
  });

  it("enriches trades from the Transactions sheet (booked amount + commission) and finds the account id", () => {
    const result = parseSaxoWorkbook(
      xlsxBuffer({ Transactions: transactionsSheet, Trades: tradesSheet }),
      "t.xlsx",
    );
    expect(result.trades[0]).toMatchObject({ brokerTradeId: "T1", bookedAmount: 530.99, brokerage: 1 });
    expect(result.trades[1]).toMatchObject({ brokerTradeId: "T2", bookedAmount: 119, brokerage: 1 });
    expect(result.accountId).toBe("10164571");
  });

  it("extracts only cash dividends, shifting Saxo's 20:00Z midnight to the next day", () => {
    const { dividends } = parseSaxoWorkbook(
      xlsxBuffer({ Transactions: transactionsSheet, Trades: tradesSheet }),
      "t.xlsx",
    );
    expect(dividends).toEqual([
      {
        key: "IVV:ARCX",
        ticker: "IVV",
        date: "2025-03-21",
        amount: 24.67,
        currency: "EUR",
        id: "div-bk9-ca1-2025-03-21-24.67",
      },
    ]);
  });

  it("gives two same-day dividends on one booking record distinct ids", () => {
    const sheet = [
      transactionsSheet[0],
      ["1", "", "Corporate action", 19.35, "", "Cash dividend", "IVV:arcx", "2025-03-20T20:00:00Z", "bk", "ca", "USD"],
      ["1", "", "Corporate action", 0.41, "", "Cash dividend", "IVV:arcx", "2025-03-20T20:00:00Z", "bk", "ca", "USD"],
    ];
    const { dividends } = parseSaxoWorkbook(xlsxBuffer({ Transactions: sheet, Trades: tradesSheet }), "t.xlsx");
    expect(new Set(dividends?.map((d) => d.id)).size).toBe(2);
  });

  it("reports a clear error when no Trades section exists", () => {
    const { trades, errors } = parseSaxoWorkbook(xlsxBuffer({ Other: [["a", "b"], [1, 2]] }), "t.xlsx");
    expect(trades).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});

describe("extractSaxoAccountId", () => {
  it("prefers Client ID over Account ID", () => {
    const rows = [
      ["Account ID", "Client ID"],
      ["373048INET", "10164571"],
    ];
    expect(extractSaxoAccountId(rows, "x.xlsx")).toBe("10164571");
  });

  it("falls back to Account ID", () => {
    expect(extractSaxoAccountId([["Account ID"], ["373048INET"]], "x.xlsx")).toBe("373048INET");
  });

  it("reads a label | value pair on the same row", () => {
    expect(extractSaxoAccountId([["Client ID", "55501234"]], "x.xlsx")).toBe("55501234");
  });

  it("ignores date-like digit runs in the file name but takes other 6-10 digit runs", () => {
    expect(extractSaxoAccountId([], "Report_20260101.xlsx")).toBeUndefined();
    expect(extractSaxoAccountId([], "Report_20260101_10164571.xlsx")).toBe("10164571");
  });

  it("returns undefined when nothing is found", () => {
    expect(extractSaxoAccountId([], "report.xlsx")).toBeUndefined();
  });
});
