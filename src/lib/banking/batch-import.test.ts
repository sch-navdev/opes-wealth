import { describe, expect, it } from "vitest";
import {
  MAX_BATCH_FILES,
  capFiles,
  chainBalanceRows,
  chronologicalOrder,
  classifyFile,
  estimateOcrPages,
  findBatchDuplicates,
  type BatchGroupInput,
} from "@/lib/banking/batch-import";
import { cleanSourceRef, isMissingColumnError } from "@/lib/asset-history";

const group = (over: Partial<BatchGroupInput> & Pick<BatchGroupInput, "key" | "fileId" | "rows">): BatchGroupInput => ({
  fileName: `f${over.fileId}.csv`,
  targetKey: "a1",
  start: null,
  end: null,
  ...over,
});

describe("classifyFile / capFiles / estimateOcrPages", () => {
  it("classifies by extension", () => {
    expect(classifyFile("A.PDF")).toBe("pdf");
    expect(classifyFile("x.csv")).toBe("csv");
    expect(classifyFile("x.txt")).toBe("csv");
    expect(classifyFile("x.xlsx")).toBe("unsupported");
  });
  it("caps the selection and reports how many were dropped", () => {
    const files = Array.from({ length: MAX_BATCH_FILES + 3 }, (_, i) => i);
    const { kept, dropped } = capFiles(files);
    expect(kept).toHaveLength(MAX_BATCH_FILES);
    expect(dropped).toBe(3);
    expect(capFiles([1, 2]).dropped).toBe(0);
  });
  it("estimates about 3 Textract pages per statement, the real count when known", () => {
    expect(estimateOcrPages([{}, {}])).toBe(6);
    expect(estimateOcrPages([{ pages: 5 }, {}])).toBe(8);
    expect(estimateOcrPages([])).toBe(0);
  });
});

describe("chronologicalOrder", () => {
  it("sorts oldest period first, then by file order", () => {
    const order = chronologicalOrder([
      { start: "2026-03-01", end: "2026-03-31", fileId: 0 },
      { start: "2026-01-01", end: "2026-01-31", fileId: 1 },
      { start: "2026-01-01", end: "2026-01-31", fileId: 2 },
      { start: null, end: null, fileId: 3 },
    ]);
    expect(order.map((o) => o.fileId)).toEqual([1, 2, 0, 3]);
  });
});

describe("findBatchDuplicates", () => {
  const jan = [
    { date: "2026-01-05", amount: -10, description: "Shop A" },
    { date: "2026-01-20", amount: 500, description: "Salary" },
  ];
  const janFeb = [
    { date: "2026-01-20", amount: 500, description: "SALARY " },
    { date: "2026-02-03", amount: -20, description: "Shop B" },
  ];

  it("flags rows repeated by a later-period statement of the same account, whatever the choosing order", () => {
    const out = findBatchDuplicates([
      group({ key: "0:0", fileId: 0, rows: janFeb, start: "2026-01-20", end: "2026-02-03" }),
      group({ key: "1:0", fileId: 1, rows: jan, start: "2026-01-05", end: "2026-01-20" }),
    ]);
    // File 1 is older, so file 0 holds the repeat.
    expect(out.get("1:0")?.duplicate).toEqual([false, false]);
    expect(out.get("0:0")?.duplicate).toEqual([true, false]);
    expect(out.get("0:0")?.overlapWith).toEqual(["f1.csv"]);
    expect(out.get("1:0")?.overlapWith).toEqual(["f0.csv"]);
  });

  it("does not compare different accounts or groups routed nowhere", () => {
    const out = findBatchDuplicates([
      group({ key: "0:0", fileId: 0, rows: jan, start: "2026-01-05", end: "2026-01-20" }),
      group({ key: "1:0", fileId: 1, rows: jan, start: "2026-01-05", end: "2026-01-20", targetKey: "a2" }),
      group({ key: "2:0", fileId: 2, rows: jan, start: "2026-01-05", end: "2026-01-20", targetKey: null }),
    ]);
    expect(out.get("1:0")?.duplicate).toEqual([false, false]);
    expect(out.get("2:0")?.duplicate).toEqual([false, false]);
  });

  it("keeps genuinely identical payments of ONE file but drops the copies an earlier file already has", () => {
    const twice = [
      { date: "2026-01-05", amount: -3, description: "Coffee" },
      { date: "2026-01-05", amount: -3, description: "Coffee" },
    ];
    const once = [{ date: "2026-01-05", amount: -3, description: "Coffee" }];
    const same = findBatchDuplicates([
      group({ key: "0:0", fileId: 0, rows: twice, start: "2026-01-01", end: "2026-01-31" }),
    ]);
    expect(same.get("0:0")?.duplicate).toEqual([false, false]);
    const across = findBatchDuplicates([
      group({ key: "0:0", fileId: 0, rows: once, start: "2026-01-01", end: "2026-01-31" }),
      group({ key: "1:0", fileId: 1, rows: twice, start: "2026-01-01", end: "2026-02-15" }),
    ]);
    // The earlier file has one Coffee: the second file's FIRST copy repeats it, its second one is new.
    expect(across.get("1:0")?.duplicate).toEqual([true, false]);
  });

  it("does not call back-to-back statements overlapping", () => {
    const out = findBatchDuplicates([
      group({ key: "0:0", fileId: 0, rows: jan, start: "2026-01-01", end: "2026-01-31" }),
      group({ key: "1:0", fileId: 1, rows: [], start: "2026-02-01", end: "2026-02-28" }),
    ]);
    expect(out.get("1:0")?.overlapWith).toEqual([]);
  });
});

describe("chainBalanceRows", () => {
  it("anchors the newest statement on the current balance and each older one where the next starts", () => {
    const older = { accountRef: "", currency: "AED", rows: [{ date: "2026-01-05", description: "a", amount: -10, balance: null }] };
    const newer = { accountRef: "", currency: "AED", rows: [{ date: "2026-02-05", description: "b", amount: -20, balance: null }] };
    const out = chainBalanceRows(
      [
        { key: "o", group: older },
        { key: "n", group: newer },
      ],
      100,
    );
    // Newer ends on 100, so it started on 120; older then ends on 120 (starts on 130).
    expect(out.get("n")?.[0].value).toBe(100);
    expect(out.get("o")?.[0].value).toBe(120);
  });
});

describe("chainBalanceRows with printed statement balances", () => {
  it("anchors each statement on its own printed closing balance, not on the account's recorded 0", () => {
    const row = (date: string, amount: number) => ({ date, description: "x", amount, balance: null });
    const older = { accountRef: "", currency: "EUR", rows: [row("2026-08-20", -100)], openingBalance: 467.83, closingBalance: 367.83, periodEnd: "2026-08-10" };
    const newer = { accountRef: "", currency: "EUR", rows: [row("2026-09-05", -157.66)], openingBalance: 367.83, closingBalance: 210.17, periodEnd: "2026-09-10" };
    const out = chainBalanceRows([{ key: "o", group: older }, { key: "n", group: newer }], 0);
    expect(out.get("n")?.map((r) => [r.recorded_date, r.value])).toEqual([["2026-09-05", 210.17], ["2026-09-10", 210.17]]);
    expect(out.get("o")?.[0].value).toBe(367.83);
  });
});

describe("history source helpers", () => {
  it("keeps the base name only, trimmed and capped", () => {
    expect(cleanSourceRef("C:\\docs\\March 2026.pdf")).toBe("March 2026.pdf");
    expect(cleanSourceRef("  a/b/c.csv ")).toBe("c.csv");
    expect(cleanSourceRef("x".repeat(300))).toHaveLength(200);
    expect(cleanSourceRef("")).toBeUndefined();
    expect(cleanSourceRef(undefined)).toBeUndefined();
  });
  it("recognises a missing column from either Postgres or PostgREST", () => {
    expect(isMissingColumnError({ code: "42703", message: 'column "source_ref" of relation does not exist' }, "source_ref")).toBe(true);
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'source_ref' column" }, "source_ref")).toBe(true);
    expect(isMissingColumnError({ code: "23514", message: "check" }, "source_ref")).toBe(false);
    expect(isMissingColumnError({ code: "42703", message: 'column "other"' }, "source_ref")).toBe(false);
    expect(isMissingColumnError(null, "source_ref")).toBe(false);
  });
});
