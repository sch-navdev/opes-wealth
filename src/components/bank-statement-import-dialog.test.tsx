/**
 * BankStatementImportDialog, PDF/OCR smoke tests (jsdom). The server actions are mocked; this
 * proves the OCR flow of the multi-account dialog: consent prompt, re-submit with ocr=1, and that an
 * OCR-read HSBC UAE statement (a bank with no CSV profile) renders with the verify notice.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import type { PdfStatement } from "@/lib/parsers/bank-pdf";

const action = vi.hoisted(() => ({ readBankStatementPdf: vi.fn() }));
vi.mock("@/app/dashboard/bank-pdf-actions", () => action);
vi.mock("@/app/dashboard/actions", () => ({ importBankCsvHistory: vi.fn() }));
vi.mock("@/app/dashboard/transaction-import-actions", () => ({ importBankTransactions: vi.fn() }));
vi.mock("@/app/dashboard/banking/actions", () => ({ rememberCashAccountBank: vi.fn() }));

import { BankStatementImportDialog } from "@/components/bank-statement-import-dialog";

const ocrStatement: PdfStatement = {
  bank: "hsbc_uae",
  bankName: "HSBC UAE",
  source: "ocr",
  warnings: [],
  accounts: [
    {
      accountRef: "0123456789",
      currency: "AED",
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      openingBalance: 100,
      closingBalance: 60,
      transactions: [
        {
          bank: "hsbc_uae", accountRef: "0123456789", currency: "AED", date: "2026-02-02", valueDate: null,
          description: "FAKE SHOP", rawDescription: "FAKE SHOP", amount: -40, debit: 40, credit: null, balance: 60,
          reference: null, index: 0,
        },
      ],
      reconciliation: { status: "ok", openingBalance: 100, closingBalance: 60, computedClosing: 60, difference: 0, brokenBalanceRows: [] },
    },
  ],
};

async function openAndUpload() {
  const view = render(
    <LanguageProvider>
      <BankStatementImportDialog accounts={[{ id: "a1", name: "Main", currency: "AED", nativeValue: 100 }]} />
    </LanguageProvider>,
  );
  await userEvent.click(screen.getAllByRole("button")[0]);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["%PDF-1.4"], "hsbc.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
  return { view, file };
}

beforeEach(() => action.readBankStatementPdf.mockReset());

describe("BankStatementImportDialog OCR", () => {
  it("asks for consent on a scanned PDF, then shows the OCR result with the verify notice (no throw for HSBC UAE)", async () => {
    action.readBankStatementPdf
      .mockResolvedValueOnce({ ok: false, failure: { code: "scanned", message: "x", ocr: "available" } })
      .mockResolvedValueOnce({ ok: true, statement: ocrStatement });
    const { file } = await openAndUpload();

    await userEvent.click(await screen.findByRole("button", { name: "Read with OCR" }));
    expect(await screen.findByText("Read by OCR: check every row before importing")).toBeTruthy();
    expect(screen.getByText(/HSBC UAE/)).toBeTruthy();
    expect(screen.getByText("FAKE SHOP")).toBeTruthy();

    const sent = action.readBankStatementPdf.mock.calls[1][0] as FormData;
    expect(sent.get("ocr")).toBe("1");
    expect(sent.get("file")).toBe(file);
  });

  it("shows the keys-missing line when OCR is not configured", async () => {
    action.readBankStatementPdf.mockResolvedValue({ ok: false, failure: { code: "scanned", message: "x", ocr: "unconfigured" } });
    await openAndUpload();
    expect(await screen.findByText(/OCR is not set up on this server/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Read with OCR" })).toBeNull();
  });
});
