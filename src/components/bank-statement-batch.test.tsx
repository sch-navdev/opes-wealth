/**
 * Multi-file statement import (jsdom): choose several files in the statement dialog and the batch review takes
 * over. Server actions are mocked. Covers multi-select and the 30-file cap, one-at-a-time independent reads,
 * the per-file statuses, password and OCR gating, the within-batch duplicate check, import order, the source
 * and file name passed to the importers, per-file bank override and the per-file result summary.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import type { PdfStatement } from "@/lib/parsers/bank-pdf";

const action = vi.hoisted(() => ({ readBankStatementPdf: vi.fn() }));
const imports = vi.hoisted(() => ({
  importBankCsvHistory: vi.fn(),
  importBankTransactions: vi.fn(),
  checkExistingTransactions: vi.fn(),
}));
vi.mock("@/app/dashboard/bank-pdf-actions", () => action);
vi.mock("@/app/dashboard/actions", () => ({ importBankCsvHistory: imports.importBankCsvHistory }));
vi.mock("@/app/dashboard/transaction-import-actions", () => ({
  importBankTransactions: imports.importBankTransactions,
  checkExistingTransactions: imports.checkExistingTransactions,
}));
const banking = vi.hoisted(() => ({
  rememberCashAccountBank: vi.fn(),
  createStatementCashAccount: vi.fn(),
  recordBalanceSnapshots: vi.fn(),
  recordStatementCoverage: vi.fn().mockResolvedValue({ ok: true }),
  markCashAccountClosed: vi.fn(),
  mergeAccountRefs: vi.fn(),
}));
vi.mock("@/app/dashboard/banking/actions", () => banking);

import { BankStatementImportDialog, type StatementTargetAccount } from "@/components/bank-statement-import-dialog";

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  (globalThis as unknown as Record<string, unknown>).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const MAIN: StatementTargetAccount = { id: "a1", name: "Main", currency: "AED", nativeValue: 100 };

function pdfStatement(bank: PdfStatement["bank"], bankName: string, date: string, description: string): PdfStatement {
  return {
    bank,
    bankName,
    source: "text",
    warnings: [],
    accounts: [
      {
        accountRef: "0123456789",
        currency: "AED",
        periodStart: date,
        periodEnd: date,
        openingBalance: 100,
        closingBalance: 60,
        transactions: [
          { bank, accountRef: "0123456789", currency: "AED", date, valueDate: null, description, rawDescription: description, amount: -40, debit: 40, credit: null, balance: 60, reference: null, index: 0 },
        ],
        reconciliation: { status: "ok", openingBalance: 100, closingBalance: 60, computedClosing: 60, difference: 0, brokenBalanceRows: [] },
      },
    ],
  };
}

const HEAD = "Date,Description,Amount,Running Balance,Currency\n";
const JAN_CSV = HEAD + "2026-01-05,SHOP A,-10.00,90.00,AED\n2026-01-20,SALARY,500.00,590.00,AED\n";
const JANFEB_CSV = HEAD + "2026-01-20,SALARY,500.00,590.00,AED\n2026-02-03,SHOP B,-20.00,570.00,AED\n";

const csv = (name: string, content: string) => new File([content], name, { type: "text/csv" });
const pdf = (name: string, size = 8) => new File(["%PDF-1.4".padEnd(size, " ")], name, { type: "application/pdf" });

async function openAndChoose(files: File[], accounts: StatementTargetAccount[] = [MAIN]) {
  render(
    <LanguageProvider>
      <BankStatementImportDialog accounts={accounts} />
    </LanguageProvider>,
  );
  await userEvent.click(screen.getAllByRole("button")[0]);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
  return input;
}
const status = (id: number) => screen.getByTestId(`batch-status-${id}`);
const formOf = (call: number) => action.readBankStatementPdf.mock.calls[call][0] as FormData;

beforeEach(() => {
  action.readBankStatementPdf.mockReset();
  imports.importBankCsvHistory.mockReset().mockResolvedValue({ success: true });
  imports.importBankTransactions.mockReset().mockImplementation(async (_id: string, txs: unknown[]) => ({ success: true, inserted: txs.length, duplicates: 0 }));
  imports.checkExistingTransactions
    .mockReset()
    .mockImplementation(async (_id: string, txs: unknown[]) => ({ success: true, existing: txs.map(() => false) }));
  banking.createStatementCashAccount.mockReset().mockResolvedValue({ ok: true, id: "new1" });
  banking.recordBalanceSnapshots.mockReset().mockResolvedValue({ ok: true, added: 2, skipped: 0 });
  banking.rememberCashAccountBank.mockReset();
  banking.markCashAccountClosed.mockReset().mockResolvedValue({ ok: true });
  banking.mergeAccountRefs.mockReset().mockResolvedValue({ ok: true });
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("batch import: multi-select", () => {
  it("lets the picker take several files and says how many at most", async () => {
    const input = await openAndChoose([csv("a.csv", JAN_CSV), csv("b.csv", JANFEB_CSV)]);
    expect(input.multiple).toBe(true);
    expect(await screen.findByText("2 files")).toBeTruthy();
    expect(await screen.findByText("Ready", { selector: '[data-testid="batch-status-0"]' })).toBeTruthy();
    expect(status(1)).toHaveTextContent("Ready");
  });

  it("uses the same review for exactly one file, so every import gets row editing, renewals and the rest", async () => {
    await openAndChoose([csv("a.csv", JAN_CSV)]);
    expect(await screen.findByTestId("batch-target-0-0")).toBeTruthy();
    expect(screen.getByTestId("batch-root")).toBeTruthy();
  });

  it("keeps the first 30 files and says so", async () => {
    const files = Array.from({ length: 31 }, (_, i) => csv(`f${i}.csv`, "foo,bar\n1,2\n"));
    await openAndChoose(files);
    expect(await screen.findByText("30 files")).toBeTruthy();
    expect(screen.getByText("Only the first 30 files were kept (31 selected).")).toBeTruthy();
    expect(screen.queryByTestId("batch-file-30")).toBeNull();
  }, 30000);
});

describe("batch import: independent reads and per-file statuses", () => {
  it("reads PDFs one at a time and one failed file never blocks the others", async () => {
    let release: (v: unknown) => void = () => {};
    action.readBankStatementPdf
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
      .mockResolvedValueOnce({ ok: false, failure: { code: "not_account_statement", message: "x" } })
      .mockResolvedValueOnce({ ok: false, failure: { code: "unreadable", message: "x" } })
      .mockResolvedValueOnce({ ok: false, failure: { code: "unsupported", message: "x" } });
    await openAndChoose([pdf("one.pdf"), pdf("two.pdf"), pdf("three.pdf"), pdf("four.pdf"), csv("odd.csv", "foo,bar\n1,2\n"), csv("notes.docx", "x")]);

    await waitFor(() => expect(action.readBankStatementPdf).toHaveBeenCalledTimes(1));
    expect(status(0)).toHaveTextContent("Reading");
    expect(status(1)).toHaveTextContent("Queued");
    expect(status(5)).toHaveTextContent("Unsupported");
    release({ ok: true, statement: pdfStatement("wio", "Wio Bank", "2026-02-02", "WIO SHOP") });

    await waitFor(() => expect(status(0)).toHaveTextContent("Ready"));
    await waitFor(() => expect(status(3)).toHaveTextContent("Unsupported"));
    expect(action.readBankStatementPdf).toHaveBeenCalledTimes(4);
    expect(status(1)).toHaveTextContent("Not an account statement");
    expect(status(2)).toHaveTextContent("Failed");
    expect(status(4)).toHaveTextContent("Unsupported");
    expect(screen.getByText("This file type is not supported. Use a .csv or .pdf file.")).toBeTruthy();
    // The one good file is still importable.
    expect(await screen.findByRole("button", { name: /Import 1 row\(s\) from 1 file\(s\)/ })).toBeEnabled();
  });

  it("never sends an oversized PDF to the server", async () => {
    await openAndChoose([pdf("big.pdf", 5 * 1024 * 1024 + 1), csv("a.csv", JAN_CSV)]);
    await waitFor(() => expect(status(0)).toHaveTextContent("Failed"));
    expect(action.readBankStatementPdf).not.toHaveBeenCalled();
  });
});

describe("batch import: passwords", () => {
  it("gives a locked PDF its own password field while the rest continue", async () => {
    action.readBankStatementPdf
      .mockResolvedValueOnce({ ok: false, failure: { code: "encrypted", message: "x" } })
      .mockResolvedValueOnce({ ok: true, statement: pdfStatement("wio", "Wio Bank", "2026-02-02", "WIO SHOP") })
      .mockResolvedValueOnce({ ok: true, statement: pdfStatement("wio", "Wio Bank", "2026-03-02", "WIO OTHER") });
    await openAndChoose([pdf("locked.pdf"), pdf("open.pdf")]);
    await waitFor(() => expect(status(1)).toHaveTextContent("Ready"));
    expect(status(0)).toHaveTextContent("Needs password");

    const card = screen.getByTestId("batch-file-0");
    await userEvent.type(within(card).getByLabelText("PDF password"), "secret1");
    await userEvent.click(within(card).getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(status(0)).toHaveTextContent("Ready"));

    expect(formOf(2).get("password")).toBe("secret1");
    expect(formOf(2).get("ocr")).toBeNull();
    expect(formOf(1).get("password")).toBeNull();
  });
});

describe("batch import: OCR is never automatic", () => {
  it("lists scanned PDFs as needing OCR, shows the page estimate and asks consent for all of them at once", async () => {
    action.readBankStatementPdf
      .mockResolvedValueOnce({ ok: false, failure: { code: "scanned", message: "x", ocr: "available", pages: 4 } })
      .mockResolvedValueOnce({ ok: false, failure: { code: "scanned", message: "x", ocr: "available" } })
      .mockResolvedValueOnce({ ok: true, statement: { ...pdfStatement("hsbc_uae", "HSBC UAE", "2026-02-02", "OCR SHOP"), source: "ocr" } })
      .mockResolvedValueOnce({ ok: true, statement: { ...pdfStatement("hsbc_uae", "HSBC UAE", "2026-03-02", "OCR TWO"), source: "ocr" } });
    await openAndChoose([pdf("scan1.pdf"), pdf("scan2.pdf")]);

    await waitFor(() => expect(status(1)).toHaveTextContent("Needs OCR"));
    expect(status(0)).toHaveTextContent("Needs OCR");
    // Only the two plain reads so far: no file went to OCR.
    expect(action.readBankStatementPdf).toHaveBeenCalledTimes(2);
    expect(formOf(0).get("ocr")).toBeNull();
    expect(formOf(1).get("ocr")).toBeNull();

    // 4 known pages + about 3 for the file whose page count is unknown.
    const button = screen.getByRole("button", { name: /Read 2 scanned PDF\(s\) with OCR \(about 7 pages\)/ });
    await userEvent.click(button);
    expect(screen.getByText(/Amazon Textract/)).toBeTruthy();
    expect(action.readBankStatementPdf).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole("button", { name: "Yes, read 2 file(s) with OCR" }));
    await waitFor(() => expect(status(0)).toHaveTextContent("Ready"));
    await waitFor(() => expect(status(1)).toHaveTextContent("Ready"));
    expect(formOf(2).get("ocr")).toBe("1");
    expect(formOf(3).get("ocr")).toBe("1");
  });

  it("can be declined: nothing is sent to OCR", async () => {
    action.readBankStatementPdf.mockResolvedValue({ ok: false, failure: { code: "scanned", message: "x", ocr: "available" } });
    await openAndChoose([pdf("scan1.pdf"), pdf("scan2.pdf")]);
    await userEvent.click(await screen.findByRole("button", { name: /with OCR/ }));
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(action.readBankStatementPdf).toHaveBeenCalledTimes(2);
    expect(status(0)).toHaveTextContent("Needs OCR");
  });
});

describe("batch import: within-batch duplicates and order", () => {
  it("unticks rows repeated by an overlapping statement and notes the overlap", async () => {
    await openAndChoose([csv("jan.csv", JAN_CSV), csv("janfeb.csv", JANFEB_CSV)]);
    await screen.findByRole("button", { name: /Import \d+ row/ });
    await waitFor(() => expect(screen.getAllByText("Also in an earlier file")).toHaveLength(1));
    expect(screen.getByText("1 row(s) repeat rows of an earlier statement in this batch and are unticked.")).toBeTruthy();
    expect(screen.getByText("This statement's period overlaps with: jan.csv.")).toBeTruthy();
    // 2 rows of the first file + 1 new row of the second.
    expect(screen.getByRole("button", { name: "Import 3 row(s) from 2 file(s)" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Import 3 row(s) from 2 file(s)" }));
    await screen.findByTestId("batch-results");
    const second = imports.importBankTransactions.mock.calls[1][1] as { description: string }[];
    expect(second.map((r) => r.description)).toEqual(["SHOP B"]);
  });

  it("imports the oldest statement period first and passes the source and file name", async () => {
    // Chosen newest first on purpose.
    await openAndChoose([csv("newer.csv", JANFEB_CSV), csv("older.csv", JAN_CSV)]);
    await userEvent.click(await screen.findByRole("button", { name: /Import \d+ row/ }));
    await screen.findByTestId("batch-results");

    expect(imports.importBankCsvHistory).toHaveBeenCalledTimes(2);
    expect(imports.importBankCsvHistory.mock.calls[0][2]).toEqual({ source: "csv_import", fileName: "older.csv" });
    expect(imports.importBankCsvHistory.mock.calls[1][2]).toEqual({ source: "csv_import", fileName: "newer.csv" });
    expect(imports.importBankTransactions.mock.calls[0][2]).toBe("csv_import");
    expect(imports.importBankTransactions.mock.calls[0][3]).toBe("older.csv");
    expect(imports.importBankTransactions.mock.calls[1][3]).toBe("newer.csv");
  });

  it("records PDF imports as pdf_import with the PDF's file name", async () => {
    action.readBankStatementPdf.mockResolvedValueOnce({ ok: true, statement: pdfStatement("wio", "Wio Bank", "2026-02-02", "WIO SHOP") });
    await openAndChoose([pdf("feb.pdf"), csv("jan.csv", JAN_CSV)]);
    await userEvent.click(await screen.findByRole("button", { name: /Import \d+ row/ }));
    await screen.findByTestId("batch-results");
    const byFile = Object.fromEntries(imports.importBankCsvHistory.mock.calls.map((c) => [c[2].fileName, c[2].source]));
    expect(byFile).toEqual({ "feb.pdf": "pdf_import", "jan.csv": "csv_import" });
  });

  it("shows a per-file summary with added, duplicate, skipped and error counts", async () => {
    imports.importBankTransactions.mockReset().mockResolvedValue({ success: true, inserted: 2, duplicates: 0 });
    await openAndChoose([csv("jan.csv", JAN_CSV), csv("janfeb.csv", JANFEB_CSV), csv("notes.docx", "x")]);
    await userEvent.click(await screen.findByRole("button", { name: /Import \d+ row/ }));
    const results = await screen.findByTestId("batch-results");
    expect(within(results).getByText("2 added · 0 duplicates · 0 skipped · 0 errors")).toBeTruthy();
    // The second file: the repeated salary counts as a duplicate, not as skipped.
    expect(within(results).getByText("2 added · 1 duplicates · 0 skipped · 0 errors")).toBeTruthy();
    expect(within(results).getByText(/Not imported: Unsupported/)).toBeTruthy();
  });
});

describe("batch import: bank override per file", () => {
  it("re-reads only the file whose bank was chosen", async () => {
    action.readBankStatementPdf
      .mockResolvedValueOnce({ ok: false, failure: { code: "unsupported", message: "x" } })
      .mockResolvedValueOnce({ ok: true, statement: pdfStatement("wio", "Wio Bank", "2026-02-02", "WIO SHOP") })
      .mockResolvedValueOnce({ ok: true, statement: pdfStatement("fab", "FAB", "2026-03-02", "FAB SHOP") });
    await openAndChoose([pdf("odd.pdf"), pdf("fine.pdf")]);
    await waitFor(() => expect(status(1)).toHaveTextContent("Ready"));
    expect(status(0)).toHaveTextContent("Unsupported");

    await userEvent.click(await screen.findByTestId("batch-bank-0"));
    await userEvent.click(await screen.findByRole("option", { name: /First Abu Dhabi Bank \(FAB\)/ }));
    await waitFor(() => expect(status(0)).toHaveTextContent("Ready"));
    expect(action.readBankStatementPdf).toHaveBeenCalledTimes(3);
    expect(formOf(2).get("bank")).toBe("fab");
    expect((formOf(2).get("file") as File).name).toBe("odd.pdf");
  });
});

const MARCH_CSV = HEAD + "2026-03-05,SHOP C,-5.00,565.00,AED\n";

describe("batch import: manual correction of a row", () => {
  it("lets the user fix a wrongly read amount before importing, and imports the corrected value", async () => {
    await openAndChoose([csv("jan.csv", JAN_CSV), csv("mar.csv", MARCH_CSV)]);
    await screen.findByText("SHOP A");
    await userEvent.click(screen.getByRole("button", { name: /Edit the row of 2026-01-05: SHOP A/ }));
    const amount = await screen.findByLabelText("Amount (negative = money out)");
    await userEvent.clear(amount);
    await userEvent.type(amount, "-22");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Edited")).toBeTruthy();
    await userEvent.click(await screen.findByRole("button", { name: /Import \d+ row\(s\) from 2 file\(s\)/ }));
    await waitFor(() => expect(imports.importBankTransactions).toHaveBeenCalled());
    const sent = imports.importBankTransactions.mock.calls.flatMap((c) => c[1] as { description: string; amount: number }[]);
    expect(sent.find((t) => t.description === "SHOP A")?.amount).toBe(-22);
  });
});

describe("batch import: never import an account", () => {
  const wio = (date: string, description: string) => pdfStatement("wio", "Wio Bank", date, description);
  const two = () => {
    action.readBankStatementPdf
      .mockResolvedValueOnce({ ok: true, statement: wio("2026-02-02", "WIO SHOP") })
      .mockResolvedValueOnce({ ok: true, statement: wio("2026-03-02", "WIO OTHER") });
    return [pdf("a.pdf"), pdf("b.pdf")];
  };

  it("remembers the choice on this device", async () => {
    await openAndChoose(two(), []);
    await screen.findByText("WIO SHOP");
    await userEvent.click(await screen.findByTestId("batch-target-0-0"));
    await userEvent.click(await screen.findByRole("option", { name: /Don.t import/ }));
    await userEvent.click(await screen.findByRole("checkbox", { name: /Never import this account/ }));
    expect(window.localStorage.getItem("opes-stmt-skipped-accounts")).toContain("wio|6789|AED");
  });

  it("leaves the account out next time, says so, and offers to change the preference", async () => {
    window.localStorage.setItem("opes-stmt-skipped-accounts", JSON.stringify(["wio|6789|AED"]));
    await openAndChoose(two(), []);
    expect((await screen.findAllByText("This account will not be imported, based on your preference.")).length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: "Change preference" })[0]);
    expect(screen.getByTestId("batch-target-0-0").textContent).toMatch(/Create new account/);
  });
});

describe("batch import: closed accounts", () => {
  it("marks an account closed after importing a statement that prints a closure date", async () => {
    const s = pdfStatement("wio", "Wio Bank", "2026-09-23", "CLOSING TRANSFER");
    action.readBankStatementPdf
      .mockResolvedValueOnce({ ok: true, statement: { ...s, accounts: [{ ...s.accounts[0], closedOn: "2026-09-23" }] } })
      .mockResolvedValueOnce({ ok: true, statement: pdfStatement("wio", "Wio Bank", "2026-08-02", "AUG SHOP") });
    await openAndChoose([pdf("closed.pdf"), pdf("aug.pdf")], []);
    expect((await screen.findAllByText(/This account was closed on 2026-09-23/)).length).toBeGreaterThan(0);
    await userEvent.click(await screen.findByRole("button", { name: /Import \d+ row\(s\) from 2 file\(s\)/ }));
    await waitFor(() => expect(banking.markCashAccountClosed).toHaveBeenCalledWith("new1", "2026-09-23"));
  });
});

describe("batch import: a savings space renewed under a new number", () => {
  // The Wio "Papa Fixed Saving Space" pattern: closed and reopened the same day, twice.
  function renewedStatement(): PdfStatement {
    const base = pdfStatement("wio", "Wio Bank", "2026-09-23", "x").accounts[0];
    const acct = (ref: string, over: Partial<typeof base>, desc: string) => ({
      ...base,
      accountRef: ref,
      accountName: "Papa Fixed Saving Space",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      transactions: [{ ...base.transactions[0], accountRef: ref, date: "2026-09-23", description: desc }],
      ...over,
    });
    return {
      ...pdfStatement("wio", "Wio Bank", "2026-09-23", "x"),
      accounts: [
        acct("2801366317", { openedOn: "2026-08-24", closedOn: "2026-09-23" }, "CLOSE OLD"),
        acct("2684141353", { openedOn: "2026-09-23", closedOn: "2026-09-23" }, "SWAP"),
        acct("2884871877", { openedOn: "2026-09-23" }, "OPEN NEW"),
      ],
    };
  }
  const second = () => csv("other.csv", JAN_CSV);

  it("asks, and by default imports them into ONE account that keeps the old numbers in its history", async () => {
    action.readBankStatementPdf.mockResolvedValue({ ok: true, statement: renewedStatement() });
    await openAndChoose([pdf("wio.pdf"), second()], []);
    expect(await screen.findByText(/3 accounts named “Papa Fixed Saving Space”/)).toBeTruthy();
    await userEvent.click(await screen.findByRole("button", { name: /Import \d+ row\(s\) from \d+ file\(s\)/ }));
    await waitFor(() => expect(banking.mergeAccountRefs).toHaveBeenCalled());
    const wioCreates = banking.createStatementCashAccount.mock.calls.filter((c) => /Papa Fixed Saving Space/.test(c[0].name));
    expect(wioCreates).toHaveLength(1);
    expect(wioCreates[0][0].name).toContain("···1877");
    const entries = banking.mergeAccountRefs.mock.calls[0][1] as { ref: string }[];
    expect(entries.map((e) => e.ref).sort()).toEqual(["2684141353", "2801366317", "2884871877"]);
    // The earlier numbers were closed by the renewal, not by the bank: the account itself stays open.
    expect(banking.markCashAccountClosed).not.toHaveBeenCalled();
  });

  it("keeps them as separate accounts when the user says so", async () => {
    action.readBankStatementPdf.mockResolvedValue({ ok: true, statement: renewedStatement() });
    await openAndChoose([pdf("wio.pdf"), second()], []);
    await userEvent.click(await screen.findByRole("button", { name: "No, keep them separate" }));
    await userEvent.click(await screen.findByRole("button", { name: /Import \d+ row\(s\) from \d+ file\(s\)/ }));
    await waitFor(() => expect(banking.createStatementCashAccount.mock.calls.filter((c) => /Papa Fixed Saving Space/.test(c[0].name))).toHaveLength(3));
    expect(banking.mergeAccountRefs).not.toHaveBeenCalled();
    // Separate accounts: the closed ones are marked closed.
    expect(banking.markCashAccountClosed).toHaveBeenCalledTimes(2);
  });
});

describe("batch import: groups left on Don't import are named", () => {
  it("lists the accounts that will be left out so nothing is dropped silently", async () => {
    // A file whose account number is missing gets no default account: it stays on Don't import.
    await openAndChoose([csv("a.csv", JAN_CSV), csv("b.csv", MARCH_CSV)], [MAIN, { id: "a2", name: "Second", currency: "AED", nativeValue: 5 }]);
    expect(await screen.findByText(/Left out because the account is set to Don.t import/)).toBeTruthy();
  });
});
