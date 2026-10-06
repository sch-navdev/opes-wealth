import { describe, expect, it } from "vitest";
import {
  computeRunningBalance,
  parseBankCsvRows,
  parseTransactionRows,
  type BankCsvColumnMapping,
  type BankCsvTransactionMapping,
} from "./bank-csv";

const balanceMapping = (dateFormat: BankCsvColumnMapping["dateFormat"]): BankCsvColumnMapping => ({
  dateColumn: "Date",
  balanceColumn: "Balance",
  dateFormat,
  descriptionColumn: "Memo",
});

describe("parseBankCsvRows (running balance)", () => {
  it("parses ISO dates and plain balances", () => {
    const { validRows, errors } = parseBankCsvRows(
      [{ Date: "2026-01-31", Balance: "1000.50", Memo: " Opening " }],
      balanceMapping("YYYY-MM-DD"),
    );
    expect(errors).toEqual([]);
    expect(validRows).toEqual([{ recorded_date: "2026-01-31", value: 1000.5, description: "Opening" }]);
  });

  it("reads the same cell as day-first or month-first depending on the chosen format", () => {
    const row = [{ Date: "03/04/2026", Balance: "1" }];
    expect(parseBankCsvRows(row, balanceMapping("DD/MM/YYYY")).validRows[0].recorded_date).toBe("2026-04-03");
    expect(parseBankCsvRows(row, balanceMapping("MM/DD/YYYY")).validRows[0].recorded_date).toBe("2026-03-04");
  });

  it("accepts single-digit day and month", () => {
    const { validRows } = parseBankCsvRows([{ Date: "3/4/2026", Balance: "1" }], balanceMapping("DD/MM/YYYY"));
    expect(validRows[0].recorded_date).toBe("2026-04-03");
  });

  it("rejects impossible calendar dates instead of rolling over", () => {
    const { validRows, errors } = parseBankCsvRows(
      [
        { Date: "2026-02-30", Balance: "1" },
        { Date: "31/04/2026", Balance: "1" },
        { Date: "13/13/2026", Balance: "1" },
      ],
      balanceMapping("DD/MM/YYYY"),
    );
    expect(validRows).toEqual([]);
    expect(errors.map((e) => e.rowIndex)).toEqual([0, 1, 2]);
  });

  it("is strict about the format", () => {
    const { errors } = parseBankCsvRows([{ Date: "2026/01/31", Balance: "1" }], balanceMapping("YYYY-MM-DD"));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("2026/01/31");
  });

  it("strips currency symbols and thousands separators", () => {
    const { validRows } = parseBankCsvRows(
      [{ Date: "2026-01-01", Balance: "AED 1,234,567.89" }, { Date: "2026-01-02", Balance: "$ 5" }],
      balanceMapping("YYYY-MM-DD"),
    );
    expect(validRows.map((r) => r.value)).toEqual([1234567.89, 5]);
  });

  it("treats parentheses and a leading minus as negative", () => {
    const { validRows } = parseBankCsvRows(
      [
        { Date: "2026-01-01", Balance: "(123.45)" },
        { Date: "2026-01-02", Balance: "-50" },
      ],
      balanceMapping("YYYY-MM-DD"),
    );
    expect(validRows.map((r) => r.value)).toEqual([-123.45, -50]);
  });

  it("reports unreadable balances and missing columns with the row index", () => {
    const { validRows, errors } = parseBankCsvRows(
      [
        { Date: "2026-01-01", Balance: "n/a" },
        { Date: "2026-01-02", Balance: "" },
        { Date: "2026-01-03" },
        { Balance: "5" },
        { Date: "2026-01-05", Balance: "10" },
      ],
      balanceMapping("YYYY-MM-DD"),
    );
    expect(validRows).toHaveLength(1);
    expect(errors.map((e) => e.rowIndex)).toEqual([0, 1, 2, 3]);
  });

  it("flags a duplicate date after the first occurrence", () => {
    const { validRows, errors } = parseBankCsvRows(
      [
        { Date: "2026-01-01", Balance: "1" },
        { Date: "2026-01-01", Balance: "2" },
      ],
      balanceMapping("YYYY-MM-DD"),
    );
    expect(validRows).toHaveLength(1);
    expect(validRows[0].value).toBe(1);
    expect(errors).toEqual([{ rowIndex: 1, message: expect.stringContaining("Duplicate date") }]);
  });

  it("detects a duplicate across different written forms of the same day", () => {
    const { errors } = parseBankCsvRows(
      [
        { Date: "1/2/2026", Balance: "1" },
        { Date: "01/02/2026", Balance: "2" },
      ],
      balanceMapping("DD/MM/YYYY"),
    );
    expect(errors).toHaveLength(1);
  });

  it("returns empty results for empty input", () => {
    expect(parseBankCsvRows([], balanceMapping("YYYY-MM-DD"))).toEqual({ validRows: [], errors: [] });
  });

  it("omits the description when no column is mapped", () => {
    const { validRows } = parseBankCsvRows(
      [{ Date: "2026-01-01", Balance: "1", Memo: "x" }],
      { dateColumn: "Date", balanceColumn: "Balance", dateFormat: "YYYY-MM-DD" },
    );
    expect(validRows[0].description).toBeUndefined();
  });

  // KNOWN LIMITATION: parseAmount strips every non [0-9.] character, so a
  // European "1.234,56" is read as 1.23456 instead of 1234.56 (or rejected).
  it.fails("reads European decimal commas correctly", () => {
    const { validRows } = parseBankCsvRows([{ Date: "2026-01-01", Balance: "1.234,56" }], balanceMapping("YYYY-MM-DD"));
    expect(validRows[0]?.value).toBe(1234.56);
  });
});

describe("parseTransactionRows", () => {
  const single: BankCsvTransactionMapping = {
    dateColumn: "Date",
    dateFormat: "DD/MM/YYYY",
    amountMode: "single",
    amountColumn: "Amount",
    descriptionColumn: "Memo",
  };
  const split: BankCsvTransactionMapping = {
    dateColumn: "Date",
    dateFormat: "DD/MM/YYYY",
    amountMode: "creditDebit",
    creditColumn: "Credit",
    debitColumn: "Debit",
  };

  it("keeps the sign of a single amount column", () => {
    const { validRows, errors } = parseTransactionRows(
      [
        { Date: "01/02/2026", Amount: "100", Memo: "Salary" },
        { Date: "02/02/2026", Amount: "-40.25", Memo: "Shop" },
        { Date: "03/02/2026", Amount: "(10)" },
      ],
      single,
    );
    expect(errors).toEqual([]);
    expect(validRows.map((r) => r.amount)).toEqual([100, -40.25, -10]);
    expect(validRows[0].description).toBe("Salary");
  });

  it("derives sign from Credit/Debit columns regardless of how they are written", () => {
    const { validRows } = parseTransactionRows(
      [
        { Date: "01/02/2026", Credit: "200", Debit: "" },
        { Date: "02/02/2026", Credit: "", Debit: "50" },
        { Date: "03/02/2026", Credit: "", Debit: "-60" }, // debit already negative
        { Date: "04/02/2026", Credit: "5", Debit: "2" },
      ],
      split,
    );
    expect(validRows.map((r) => r.amount)).toEqual([200, -50, -60, 3]);
  });

  it("errors on a row with neither credit nor debit", () => {
    const { validRows, errors } = parseTransactionRows(
      [
        { Date: "01/02/2026", Credit: "", Debit: "" },
        { Date: "01/02/2026", Credit: "0", Debit: "0" },
      ],
      split,
    );
    expect(validRows).toEqual([]);
    expect(errors.map((e) => e.rowIndex)).toEqual([0, 1]);
  });

  it("errors on unreadable amounts, bad dates and missing columns", () => {
    const { validRows, errors } = parseTransactionRows(
      [
        { Date: "01/02/2026", Amount: "abc" },
        { Date: "99/99/2026", Amount: "1" },
        { Amount: "1" },
        { Date: "01/02/2026" },
        { Date: "01/02/2026", Amount: "5" },
      ],
      single,
    );
    expect(validRows).toHaveLength(1);
    expect(errors.map((e) => e.rowIndex)).toEqual([0, 1, 2, 3]);
  });

  it("errors in credit/debit mode when a column is missing or unreadable", () => {
    const { errors } = parseTransactionRows(
      [
        { Date: "01/02/2026", Credit: "5" },
        { Date: "01/02/2026", Credit: "x", Debit: "" },
      ],
      split,
    );
    expect(errors.map((e) => e.rowIndex)).toEqual([0, 1]);
  });

  it("allows several transactions on the same date", () => {
    const { validRows, errors } = parseTransactionRows(
      [
        { Date: "01/02/2026", Amount: "1" },
        { Date: "01/02/2026", Amount: "2" },
      ],
      single,
    );
    expect(errors).toEqual([]);
    expect(validRows).toHaveLength(2);
  });

  it("handles empty input", () => {
    expect(parseTransactionRows([], single)).toEqual({ validRows: [], errors: [] });
  });
});

describe("computeRunningBalance", () => {
  it("returns nothing for no transactions", () => {
    expect(computeRunningBalance([], 100)).toEqual([]);
  });

  it("anchors on the starting balance and accumulates by date", () => {
    const out = computeRunningBalance(
      [
        { recorded_date: "2026-01-01", amount: 50 },
        { recorded_date: "2026-01-02", amount: -30 },
      ],
      1000,
    );
    expect(out.map((r) => [r.recorded_date, r.value])).toEqual([
      ["2026-01-01", 1050],
      ["2026-01-02", 1020],
    ]);
  });

  it("sorts unordered input chronologically before accumulating", () => {
    const out = computeRunningBalance(
      [
        { recorded_date: "2026-01-03", amount: 10 },
        { recorded_date: "2026-01-01", amount: 100 },
        { recorded_date: "2026-01-02", amount: -20 },
      ],
      0,
    );
    expect(out.map((r) => r.value)).toEqual([100, 80, 90]);
    expect(out.map((r) => r.recorded_date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  it("collapses same-day transactions into a single closing point and joins descriptions", () => {
    const out = computeRunningBalance(
      [
        { recorded_date: "2026-01-01", amount: 10, description: "a" },
        { recorded_date: "2026-01-01", amount: -4, description: "b" },
        { recorded_date: "2026-01-01", amount: 1 },
      ],
      100,
    );
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe(107);
    expect(out[0].description).toContain("a");
    expect(out[0].description).toContain("b");
  });

  it("leaves description undefined when none given", () => {
    const [row] = computeRunningBalance([{ recorded_date: "2026-01-01", amount: 1 }], 0);
    expect(row.description).toBeUndefined();
  });

  it("rounds away floating point drift to cents", () => {
    const out = computeRunningBalance(
      [
        { recorded_date: "2026-01-01", amount: 0.1 },
        { recorded_date: "2026-01-02", amount: 0.2 },
      ],
      0,
    );
    expect(out[1].value).toBe(0.3);
  });

  it("can go negative from an overdraft", () => {
    const [row] = computeRunningBalance([{ recorded_date: "2026-01-01", amount: -150 }], 100);
    expect(row.value).toBe(-50);
  });

  it("composes with parseTransactionRows end to end", () => {
    const { validRows } = parseTransactionRows(
      [
        { Date: "2026-01-02", Credit: "", Debit: "25" },
        { Date: "2026-01-01", Credit: "100", Debit: "" },
      ],
      { dateColumn: "Date", dateFormat: "YYYY-MM-DD", amountMode: "creditDebit", creditColumn: "Credit", debitColumn: "Debit" },
    );
    expect(computeRunningBalance(validRows, 10).map((r) => r.value)).toEqual([110, 85]);
  });
});
