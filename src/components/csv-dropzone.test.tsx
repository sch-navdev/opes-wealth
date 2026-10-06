/**
 * CsvDropzone, UI level (jsdom): the CSV path and the PDF path. The server action that reads
 * PDFs is mocked (its parsing is covered by the bank-pdf unit tests); this proves what the
 * user sees: a clean PDF goes straight on, several accounts / a mismatch ask for confirmation,
 * and every failure code shows its own message.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import type { PdfAccountStatement, PdfStatement } from "@/lib/parsers/bank-pdf";

const action = vi.hoisted(() => ({ readBankStatementPdf: vi.fn() }));
vi.mock("@/app/dashboard/bank-pdf-actions", () => action);

import { CsvDropzone, type ParsedCsvFile } from "@/components/csv-dropzone";

function account(over: Partial<PdfAccountStatement> = {}): PdfAccountStatement {
  return {
    accountRef: "AE000000000000000001",
    currency: "AED",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    openingBalance: 100,
    closingBalance: 75.5,
    transactions: [
      {
        bank: "fab", accountRef: "AE000000000000000001", currency: "AED", date: "2026-07-02", valueDate: "2026-07-02",
        description: "Transfer", rawDescription: "Transfer", amount: -24.5, debit: 24.5, credit: null, balance: 75.5,
        reference: null, index: 0,
      },
    ],
    reconciliation: { status: "ok", openingBalance: 100, closingBalance: 75.5, computedClosing: 75.5, difference: 0, brokenBalanceRows: [] },
    ...over,
  };
}
const statement = (accounts: PdfAccountStatement[]): PdfStatement => ({ bank: "fab", bankName: "FAB", accounts, warnings: [] });

function setup(currency?: string) {
  const onParsed = vi.fn<(f: ParsedCsvFile) => void>();
  const view = render(
    <LanguageProvider>
      <CsvDropzone onParsed={onParsed} currency={currency} />
    </LanguageProvider>,
  );
  const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  const upload = (file: File) => fireEvent.change(input, { target: { files: [file] } });
  return { onParsed, input, upload };
}
const pdf = () => new File(["%PDF-1.4"], "statement.pdf", { type: "application/pdf" });

beforeEach(() => action.readBankStatementPdf.mockReset());

describe("CsvDropzone", () => {
  it("accepts .csv and .pdf in the picker and says so", () => {
    const { input } = setup();
    expect(input.accept).toContain(".pdf");
    expect(input.accept).toContain(".csv");
    expect(screen.getByText(/CSV or PDF/i)).toBeTruthy();
  });

  it("rejects other file types", async () => {
    const { upload } = setup();
    upload(new File(["x"], "photo.png", { type: "image/png" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Only .csv or .pdf files are accepted.");
  });

  it("passes a verified single-account PDF straight on as a Date/Description/Debit/Credit/Balance table", async () => {
    action.readBankStatementPdf.mockResolvedValue({ ok: true, statement: statement([account()]) });
    const { upload, onParsed } = setup("AED");
    upload(pdf());
    await waitFor(() => expect(onParsed).toHaveBeenCalledTimes(1));
    const file = onParsed.mock.calls[0][0];
    expect(file.fileName).toBe("statement.pdf");
    expect(file.headers).toEqual(["Date", "Description", "Debit", "Credit", "Balance"]);
    expect(file.rows).toEqual([{ Date: "2026-07-02", Description: "Transfer", Debit: "24.50", Credit: "", Balance: "75.50" }]);
  });

  it("asks which account to use when the PDF holds several, and imports only the chosen one", async () => {
    const usd = account({ accountRef: "AE000000000000000002", currency: "USD" });
    action.readBankStatementPdf.mockResolvedValue({ ok: true, statement: statement([account(), usd]) });
    const { upload, onParsed } = setup();
    upload(pdf());
    expect(await screen.findByText("Choose the account to import from this PDF")).toBeTruthy();
    expect(onParsed).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole("button", { name: "Use this account" })[1]);
    expect(onParsed).toHaveBeenCalledTimes(1);
    expect(onParsed.mock.calls[0][0].rows).toHaveLength(1);
  });

  it("asks for confirmation when the totals do not reconcile", async () => {
    const bad = account({
      reconciliation: { status: "mismatch", openingBalance: 100, closingBalance: 70, computedClosing: 75.5, difference: 5.5, brokenBalanceRows: [] },
    });
    action.readBankStatementPdf.mockResolvedValue({ ok: true, statement: statement([bad]) });
    const { upload, onParsed } = setup("AED");
    upload(pdf());
    expect(await screen.findByText(/Totals don't match the statement/)).toBeTruthy();
    expect(onParsed).not.toHaveBeenCalled();
  });

  it.each([
    ["encrypted", /password protected/],
    ["scanned", /scan \(images only\)/],
    ["image_only", /pages are images/],
    ["unsupported", /isn't a supported bank statement/],
    ["no_transactions", /No transactions were found/],
    ["unreadable", /could not be read as a PDF/],
    ["too_large", /larger than 10 MB/],
  ] as const)("shows the %s message", async (code, pattern) => {
    action.readBankStatementPdf.mockResolvedValue({ ok: false, failure: { code, message: "x" } });
    const { upload, onParsed } = setup();
    upload(pdf());
    expect((await screen.findByRole("alert")).textContent).toMatch(pattern);
    expect(onParsed).not.toHaveBeenCalled();
  });

  it("falls back to the unreadable message for an unknown failure code (e.g. signed out)", async () => {
    action.readBankStatementPdf.mockResolvedValue({ ok: false, failure: { code: "unauthenticated", message: "x" } });
    const { upload } = setup();
    upload(pdf());
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not be read as a PDF/);
  });

  it("still parses a CSV client-side without calling the PDF action", async () => {
    const { upload, onParsed } = setup();
    upload(new File(["Date,Amount\n2026-01-02,10.00\n"], "bank.csv", { type: "text/csv" }));
    await waitFor(() => expect(onParsed).toHaveBeenCalledTimes(1));
    expect(onParsed.mock.calls[0][0].headers).toEqual(["Date", "Amount"]);
    expect(action.readBankStatementPdf).not.toHaveBeenCalled();
  });
});
