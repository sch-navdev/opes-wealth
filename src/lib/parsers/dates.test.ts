import * as XLSX from "xlsx";
import { afterEach, describe, expect, it } from "vitest";
import { parseCellDateUtc } from "./dates";
import { parseSaxoWorkbook } from "./saxo";
import { parseSharesightWorkbook } from "./sharesight";

const ZONES = ["UTC", "Asia/Dubai", "America/Los_Angeles", "Pacific/Kiritimati"] as const;
const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** Node re-reads process.env.TZ at runtime, so this genuinely moves `new Date(y, m, d)`. */
function inZone<T>(tz: string, fn: () => T): T {
  process.env.TZ = tz;
  return fn();
}

function csvBuffer(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Excel stores a date as a bare serial number (no timezone): 45721 = 2025-03-05. */
function serialXlsx(aoaHeader: string[], row: (string | number)[], dateCol: number): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};
  aoaHeader.forEach((h, c) => (ws[XLSX.utils.encode_cell({ r: 0, c })] = { t: "s", v: h }));
  row.forEach((v, c) => {
    ws[XLSX.utils.encode_cell({ r: 1, c })] =
      c === dateCol ? { t: "n", v: 45721, z: "yyyy-mm-dd" } : typeof v === "number" ? { t: "n", v } : { t: "s", v };
  });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1, c: aoaHeader.length - 1 } });
  XLSX.utils.book_append_sheet(wb, ws, "Trades");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("the TZ environment switch used by these tests", () => {
  it("really changes the local offset at runtime", () => {
    const offsets = ZONES.map((tz) => inZone(tz, () => new Date(2025, 2, 5).getTimezoneOffset()));
    expect(offsets).toEqual([0, -240, 480, -840]);
  });
});

describe.each(ZONES)("parseCellDateUtc in %s", (tz) => {
  const run = (raw: unknown) => inZone(tz, () => parseCellDateUtc(raw));

  it("keeps ISO dates (with or without a time) on the same day", () => {
    expect(run("2025-03-05")).toBe("2025-03-05");
    expect(run("2025-03-05 00:00")).toBe("2025-03-05");
    expect(run("2025-03-05T00:00:00")).toBe("2025-03-05");
    expect(run("2025-3-5")).toBe("2025-03-05");
    expect(run("2025/03/05")).toBe("2025-03-05");
  });

  it("reads slash dates month-first, falling back to day-first when the first number exceeds 12", () => {
    expect(run("03/05/2025")).toBe("2025-03-05");
    expect(run("3/5/2025")).toBe("2025-03-05");
    expect(run("03-05-2025")).toBe("2025-03-05");
    expect(run("25/03/2025")).toBe("2025-03-25");
    expect(run("12/31/2025")).toBe("2025-12-31");
    expect(run("3/5/25")).toBe("2025-03-05");
  });

  it("reads text-month dates", () => {
    expect(run("5 Mar 2025")).toBe("2025-03-05");
    expect(run("05 March 2025")).toBe("2025-03-05");
    expect(run("5-Mar-2025")).toBe("2025-03-05");
    expect(run("Mar 5, 2025")).toBe("2025-03-05");
    expect(run("March 5 2025")).toBe("2025-03-05");
    expect(run("1 Jan 2026")).toBe("2026-01-01");
    expect(run("31 Dec 2025")).toBe("2025-12-31");
  });

  it("reads Date objects (xlsx cellDates, local wall-clock midnight) as that calendar date", () => {
    expect(run(inZone(tz, () => new Date(2025, 2, 5)))).toBe("2025-03-05");
    expect(run(inZone(tz, () => new Date(2025, 0, 1)))).toBe("2025-01-01");
    expect(run(inZone(tz, () => new Date(2025, 11, 31)))).toBe("2025-12-31");
  });

  it("rejects invalid or unreadable input", () => {
    for (const bad of ["", "  ", "not-a-date", "2025-02-31", "31/02/2025", "2025-13-01", "13/13/2025", "Foo 5, 2025", null, undefined, 45721, new Date(NaN)]) {
      expect(run(bad)).toBeNull();
    }
  });
});

describe.each(ZONES)("broker parsers keep the calendar date in %s", (tz) => {
  it("Saxo: slash/text-month CSV dates and xlsx date cells", () => {
    inZone(tz, () => {
      const head = "Trade execution date,Trade Event Type,Traded Quantity,Price,Instrument Symbol,Instrument,Instrument currency";
      const csv = [head, "03/05/2025,Bought,1,10,A:xnas,A,USD", "5 Mar 2025,Bought,1,10,A:xnas,A,USD", "2025-03-05,Bought,1,10,A:xnas,A,USD"].join("\n");
      const csvRes = parseSaxoWorkbook(csvBuffer(csv), "x.csv");
      expect(csvRes.errors).toEqual([]);
      expect(csvRes.trades.map((t) => t.tradeDate)).toEqual(["2025-03-05", "2025-03-05", "2025-03-05"]);

      const xlsx = serialXlsx(head.split(","), ["", "Bought", 1, 10, "A:xnas", "A", "USD"], 0);
      expect(parseSaxoWorkbook(xlsx, "x.xlsx").trades.map((t) => t.tradeDate)).toEqual(["2025-03-05"]);
    });
  });

  it("Sharesight: slash/text-month CSV dates and xlsx date cells", () => {
    inZone(tz, () => {
      const head = "Market,Code,Trade Date,Quantity,Price,Transaction Type";
      const csv = [head, "ASX,A,03/05/2025,1,10,Buy", "ASX,A,5 Mar 2025,1,10,Buy", "ASX,A,2025-03-05 00:00,1,10,Buy"].join("\n");
      const csvRes = parseSharesightWorkbook(csvBuffer(csv), "x.csv");
      expect(csvRes.errors).toEqual([]);
      expect(csvRes.trades.map((t) => t.tradeDate)).toEqual(["2025-03-05", "2025-03-05", "2025-03-05"]);

      const xlsx = serialXlsx(head.split(","), ["ASX", "A", "", 1, 10, "Buy"], 2);
      expect(parseSharesightWorkbook(xlsx, "x.xlsx").trades.map((t) => t.tradeDate)).toEqual(["2025-03-05"]);
    });
  });
});
