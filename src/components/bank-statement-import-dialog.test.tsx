/**
 * BankStatementImportDialog (jsdom). The server actions are mocked. Covers the OCR consent flow of
 * the multi-account dialog and the "country, then bank" picker: CSV detection and re-parse, PDF
 * re-read forced to a bank (`bank` form field), which failure states show the picker, the country
 * filter and the remembered country.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
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
vi.mock("@/app/dashboard/banking/actions", () => ({ rememberCashAccountBank: vi.fn() }));

import { BankStatementImportDialog, type StatementTargetAccount } from "@/components/bank-statement-import-dialog";

// Radix Select and Dialog need a few browser APIs jsdom does not implement.
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

function statement(bank: PdfStatement["bank"], bankName: string, source: "text" | "ocr", description: string): PdfStatement {
  return {
    bank,
    bankName,
    source,
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
            bank, accountRef: "0123456789", currency: "AED", date: "2026-02-02", valueDate: null,
            description, rawDescription: description, amount: -40, debit: 40, credit: null, balance: 60,
            reference: null, index: 0,
          },
        ],
        reconciliation: { status: "ok", openingBalance: 100, closingBalance: 60, computedClosing: 60, difference: 0, brokenBalanceRows: [] },
      },
    ],
  };
}
const ocrStatement = statement("hsbc_uae", "HSBC UAE", "ocr", "FAKE SHOP");
const wioStatement = statement("wio", "Wio Bank", "text", "WIO SHOP");

const WIO_CSV = "Date,Description,Amount,Running Balance,Currency\n2026-02-02,CSV SHOP,-40.00,60.00,AED\n2026-02-03,CSV SALARY,500.00,560.00,AED\n";
const UNKNOWN_CSV = "foo,bar\n1,2\n";

const MAIN: StatementTargetAccount = { id: "a1", name: "Main", currency: "AED", nativeValue: 100 };
const SAVINGS: StatementTargetAccount = { id: "a2", name: "Savings", currency: "AED", nativeValue: 5 };

function renderDialog(accounts: StatementTargetAccount[] = [MAIN]) {
  return render(
    <LanguageProvider>
      <BankStatementImportDialog accounts={accounts} />
    </LanguageProvider>,
  );
}

async function openAndUpload(
  file = new File(["%PDF-1.4"], "hsbc.pdf", { type: "application/pdf" }),
  accounts: StatementTargetAccount[] = [MAIN],
) {
  const view = renderDialog(accounts);
  await userEvent.click(screen.getAllByRole("button")[0]);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return { view, file };
}

const csvFile = (content: string) => new File([content], "statement.csv", { type: "text/csv" });

/** Opens a Select by its test id and returns the option names it offers. */
async function openSelect(testId: string) {
  await userEvent.click(await screen.findByTestId(testId));
  const list = await screen.findByRole("listbox");
  return within(list).getAllByRole("option").map((o) => o.textContent ?? "");
}
async function choose(testId: string, optionName: RegExp | string) {
  await userEvent.click(await screen.findByTestId(testId));
  await userEvent.click(await screen.findByRole("option", { name: optionName }));
}
const sentForm = (call: number) => action.readBankStatementPdf.mock.calls[call][0] as FormData;

beforeEach(() => {
  action.readBankStatementPdf.mockReset();
  imports.importBankCsvHistory.mockReset().mockResolvedValue({ success: true });
  imports.importBankTransactions.mockReset().mockResolvedValue({ success: true, inserted: 1, duplicates: 0 });
  imports.checkExistingTransactions.mockReset().mockResolvedValue({ success: true, existing: [false, false] });
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("BankStatementImportDialog OCR", () => {
  it("asks for consent on a scanned PDF, then shows the OCR result with the verify notice (no throw for HSBC UAE)", async () => {
    action.readBankStatementPdf
      .mockResolvedValueOnce({ ok: false, failure: { code: "scanned", message: "x", ocr: "available" } })
      .mockResolvedValueOnce({ ok: true, statement: ocrStatement });
    const { file } = await openAndUpload();

    await userEvent.click(await screen.findByRole("button", { name: "Read with OCR" }));
    expect(await screen.findByText("Read by OCR: check every row before importing")).toBeTruthy();
    expect(screen.getByText(/HSBC UAE ·/)).toBeTruthy();
    expect(screen.getByText("FAKE SHOP")).toBeTruthy();

    const sent = sentForm(1);
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

describe("BankStatementImportDialog masked OCR layout", () => {
  const LAYOUT = "OCR layout (masked): 1 page(s)\n  1: xxxx Date | 99/99/9999";

  it("shows the masked layout in a read-only textarea under the error, with a Copy button", async () => {
    action.readBankStatementPdf.mockResolvedValue({
      ok: false,
      failure: { code: "no_transactions", message: "x", bank: "hsbc_uae", layout: LAYOUT },
    });
    await openAndUpload();
    expect(await screen.findByRole("alert")).toBeTruthy();
    const box = (await screen.findByLabelText("OCR layout for support (numbers and names hidden)")) as HTMLTextAreaElement;
    expect(box.tagName).toBe("TEXTAREA");
    expect(box.readOnly).toBe(true);
    expect(box.value).toBe(LAYOUT);
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });

  it("shows no layout block when the failure carries none", async () => {
    action.readBankStatementPdf.mockResolvedValue({ ok: false, failure: { code: "no_transactions", message: "x", bank: "hsbc_uae" } });
    await openAndUpload();
    await screen.findByRole("alert");
    expect(screen.queryByLabelText("OCR layout for support (numbers and names hidden)")).toBeNull();
  });
});

describe("BankStatementImportDialog bank picker, CSV", () => {
  it("detects the bank from a Wio-like CSV and shows the parsed preview", async () => {
    await openAndUpload(csvFile(WIO_CSV));
    expect(await screen.findByText("CSV SHOP")).toBeTruthy();
    expect(screen.getByText("CSV SALARY")).toBeTruthy();
    expect(screen.getByText(/Wio Bank ·/)).toBeTruthy();
    expect(screen.getByText("Detected")).toBeTruthy();
    expect(screen.getByTestId("stmt-country-select")).toHaveTextContent("United Arab Emirates");
    expect(screen.getByTestId("stmt-bank-select")).toHaveTextContent("Wio Bank");
    expect(action.readBankStatementPdf).not.toHaveBeenCalled();
  });

  it("re-parses the file when another bank is chosen", async () => {
    await openAndUpload(csvFile(WIO_CSV));
    expect(await screen.findByText(/Wio Bank ·/)).toBeTruthy();
    await choose("stmt-bank-select", /Emirates NBD/);
    expect(await screen.findByText(/Emirates NBD ·/)).toBeTruthy();
    expect(screen.queryByText(/Wio Bank ·/)).toBeNull();
    expect(screen.getByText("CSV SHOP")).toBeTruthy();
    expect(screen.queryByText("Detected")).toBeNull();
  });

  it("offers the picker for a CSV whose bank is not detected (nothing is parsed until a bank is chosen)", async () => {
    await openAndUpload(csvFile(UNKNOWN_CSV));
    expect(await screen.findByTestId("stmt-bank-select")).toBeTruthy();
    expect(screen.queryByText("Detected")).toBeNull();
    await choose("stmt-bank-select", /ADCB/);
    // The foo/bar header has no date column: the preset reports it instead of importing garbage.
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("stmt-bank-select")).toHaveTextContent("ADCB");
  });

  it("lists only CSV banks of the chosen country (no HSBC UAE / CBI for CSV)", async () => {
    await openAndUpload(csvFile(WIO_CSV));
    await screen.findByText("CSV SHOP");
    const ae = await openSelect("stmt-bank-select");
    expect(ae.some((n) => /Wio Bank/.test(n))).toBe(true);
    expect(ae.some((n) => /HSBC UAE/.test(n))).toBe(false);
    expect(ae.some((n) => /CBI|Commercial Bank International/.test(n))).toBe(false);
    await userEvent.keyboard("{Escape}");

    await choose("stmt-country-select", "France");
    const fr = await openSelect("stmt-bank-select");
    expect(fr.some((n) => /BoursoBank/.test(n))).toBe(true);
    expect(fr.some((n) => /Wio Bank|Emirates NBD|ADCB/.test(n))).toBe(false);
  });
});

describe("BankStatementImportDialog bank picker, PDF success", () => {
  it("offers the PDF banks (HSBC UAE and CBI included) and re-sends the same file forced to the chosen bank", async () => {
    action.readBankStatementPdf
      .mockResolvedValueOnce({ ok: true, statement: wioStatement })
      .mockResolvedValueOnce({ ok: true, statement: ocrStatement });
    const { file } = await openAndUpload();
    expect(await screen.findByText("WIO SHOP")).toBeTruthy();
    expect(screen.getByText("Detected")).toBeTruthy();

    const options = await openSelect("stmt-bank-select");
    expect(options.some((n) => /HSBC UAE/.test(n))).toBe(true);
    expect(options.some((n) => /Commercial Bank International/.test(n))).toBe(true);
    expect(options.some((n) => /Wio Bank/.test(n))).toBe(true);
    expect(options.some((n) => /Emirates NBD/.test(n))).toBe(false);
    await userEvent.click(screen.getByRole("option", { name: /HSBC UAE$/ }));

    expect(await screen.findByText("FAKE SHOP")).toBeTruthy();
    expect(action.readBankStatementPdf).toHaveBeenCalledTimes(2);
    const second = sentForm(1);
    expect(second.get("bank")).toBe("hsbc_uae");
    expect(second.get("file")).toBe(file);
    // A text-layer result never re-sends OCR consent.
    expect(second.get("ocr")).toBeNull();
    expect(screen.queryByText("Detected")).toBeNull();
    expect(sentForm(0).get("bank")).toBeNull();
  });

  it("keeps the OCR consent only because the current result was OCR-read", async () => {
    action.readBankStatementPdf
      .mockResolvedValueOnce({ ok: false, failure: { code: "scanned", message: "x", ocr: "available" } })
      .mockResolvedValueOnce({ ok: true, statement: ocrStatement })
      .mockResolvedValueOnce({ ok: true, statement: wioStatement });
    await openAndUpload();
    await userEvent.click(await screen.findByRole("button", { name: "Read with OCR" }));
    await screen.findByText("FAKE SHOP");
    await choose("stmt-bank-select", /Wio Bank/);
    expect(await screen.findByText("WIO SHOP")).toBeTruthy();
    expect(sentForm(2).get("bank")).toBe("wio");
    expect(sentForm(2).get("ocr")).toBe("1");
  });

  it("keeps the password of an unlocked PDF for the re-send", async () => {
    action.readBankStatementPdf
      .mockResolvedValueOnce({ ok: false, failure: { code: "encrypted", message: "x" } })
      .mockResolvedValueOnce({ ok: true, statement: wioStatement })
      .mockResolvedValueOnce({ ok: true, statement: ocrStatement });
    await openAndUpload();
    await userEvent.type(await screen.findByLabelText("PDF password"), "s3cret");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByText("WIO SHOP");
    await choose("stmt-bank-select", /HSBC UAE$/);
    await screen.findByText("FAKE SHOP");
    expect(sentForm(2).get("password")).toBe("s3cret");
    expect(sentForm(2).get("bank")).toBe("hsbc_uae");
  });

  it("shows only the banks of the chosen country: AE has HSBC UAE, France only French PDF banks", async () => {
    action.readBankStatementPdf.mockResolvedValue({ ok: true, statement: wioStatement });
    await openAndUpload();
    await screen.findByText("WIO SHOP");
    expect(screen.getByTestId("stmt-country-select")).toHaveTextContent("United Arab Emirates");
    await choose("stmt-country-select", "France");
    const fr = await openSelect("stmt-bank-select");
    expect(fr).toHaveLength(1);
    expect(fr[0]).toMatch(/Banque Populaire/);
  });
});

describe("BankStatementImportDialog bank picker, PDF failures", () => {
  it("shows no bank picker for a scanned PDF, only the OCR consent", async () => {
    action.readBankStatementPdf.mockResolvedValue({ ok: false, failure: { code: "scanned", message: "x", ocr: "available" } });
    await openAndUpload();
    expect(await screen.findByRole("button", { name: "Read with OCR" })).toBeTruthy();
    expect(screen.queryByTestId("stmt-bank-select")).toBeNull();
    expect(screen.queryByTestId("stmt-country-select")).toBeNull();
  });

  it("shows no bank picker when OCR is unavailable or the PDF is unreadable", async () => {
    action.readBankStatementPdf.mockResolvedValue({ ok: false, failure: { code: "ocr_unavailable", message: "x", detail: "not_configured" } });
    await openAndUpload();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("stmt-bank-select")).toBeNull();
  });

  it("shows no bank picker on the password prompt", async () => {
    action.readBankStatementPdf.mockResolvedValue({ ok: false, failure: { code: "encrypted", message: "x" } });
    await openAndUpload();
    expect(await screen.findByLabelText("PDF password")).toBeTruthy();
    expect(screen.queryByTestId("stmt-bank-select")).toBeNull();
  });

  it("offers the picker when no layout was recognised, and re-sends the file forced to the chosen bank", async () => {
    action.readBankStatementPdf
      .mockResolvedValueOnce({ ok: false, failure: { code: "unsupported", message: "x" } })
      .mockResolvedValueOnce({ ok: true, statement: wioStatement });
    const { file } = await openAndUpload();
    expect(await screen.findByRole("alert")).toBeTruthy();
    const options = await openSelect("stmt-bank-select");
    expect(options.some((n) => /HSBC UAE/.test(n))).toBe(true);
    await userEvent.click(screen.getByRole("option", { name: /Wio Bank/ }));

    expect(await screen.findByText("WIO SHOP")).toBeTruthy();
    const second = sentForm(1);
    expect(second.get("bank")).toBe("wio");
    expect(second.get("file")).toBe(file);
    expect(second.get("ocr")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the picker when the forced bank finds no transactions, so another bank can be tried", async () => {
    action.readBankStatementPdf
      .mockResolvedValueOnce({ ok: false, failure: { code: "unsupported", message: "x" } })
      .mockResolvedValueOnce({ ok: false, failure: { code: "no_transactions", message: "x", bank: "fab" } })
      .mockResolvedValueOnce({ ok: true, statement: wioStatement });
    await openAndUpload();
    await screen.findByRole("alert");
    await choose("stmt-bank-select", /First Abu Dhabi Bank/);
    await screen.findByRole("alert");
    expect(screen.getByTestId("stmt-bank-select")).toHaveTextContent(/First Abu Dhabi Bank/);
    await choose("stmt-bank-select", /Wio Bank/);
    expect(await screen.findByText("WIO SHOP")).toBeTruthy();
    expect(sentForm(2).get("bank")).toBe("wio");
  });
});

describe("BankStatementImportDialog remembered country", () => {
  it("stores the chosen country and preselects it for the next file", async () => {
    await openAndUpload(csvFile(UNKNOWN_CSV));
    expect(await screen.findByTestId("stmt-country-select")).toHaveTextContent("United Arab Emirates");
    await choose("stmt-country-select", "France");
    expect(window.localStorage.getItem("opes-stmt-country")).toBe("FR");
  });

  it("uses the remembered country when nothing was detected, but the detected bank's country wins", async () => {
    window.localStorage.setItem("opes-stmt-country", "FR");
    await openAndUpload(csvFile(UNKNOWN_CSV));
    expect(await screen.findByTestId("stmt-country-select")).toHaveTextContent("France");

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile(WIO_CSV)] } });
    await screen.findByText("CSV SHOP");
    expect(screen.getByTestId("stmt-country-select")).toHaveTextContent("United Arab Emirates");
  });

  it("works when localStorage throws", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await openAndUpload(csvFile(UNKNOWN_CSV));
    expect(await screen.findByTestId("stmt-country-select")).toHaveTextContent("United Arab Emirates");
    await choose("stmt-country-select", "France");
    expect(screen.getByTestId("stmt-country-select")).toHaveTextContent("France");
    get.mockRestore();
    set.mockRestore();
  });
});

describe("BankStatementImportDialog import button reason and account preselection", () => {
  it("explains why Import is disabled and highlights the account menu still on Don't import", async () => {
    await openAndUpload(csvFile(WIO_CSV), [MAIN, SAVINGS]);
    await screen.findByText("CSV SHOP");
    const button = screen.getByRole("button", { name: "Import" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Choose the Cash account to import into for at least one account above.")).toBeTruthy();
    expect(button.getAttribute("aria-describedby")).toBe("stmt-import-hint");
    const menu = screen.getByTestId("stmt-target-0");
    expect(menu).toHaveTextContent("Don't import");
    expect(menu.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Choose the Cash account to import into")).toBeTruthy();
    expect(imports.checkExistingTransactions).not.toHaveBeenCalled();
  });

  it("preselects the only Cash account in the group's currency and says so", async () => {
    await openAndUpload(csvFile(WIO_CSV));
    await screen.findByText("CSV SHOP");
    expect(screen.getByTestId("stmt-target-0")).toHaveTextContent("Main (AED)");
    expect(screen.getByText("Pre-selected: it is your only AED Cash account.")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Import 2 transaction(s)" })).toBeEnabled();
    expect(screen.queryByText("Choose the Cash account to import into")).toBeNull();
  });

  it("never preselects when several accounts share the currency", async () => {
    await openAndUpload(csvFile(WIO_CSV), [MAIN, SAVINGS]);
    await screen.findByText("CSV SHOP");
    expect(screen.getByTestId("stmt-target-0")).toHaveTextContent("Don't import");
    expect(screen.queryByText(/Pre-selected/)).toBeNull();
  });

  it("does not preselect an account in another currency", async () => {
    await openAndUpload(csvFile(WIO_CSV), [{ ...MAIN, currency: "EUR" }]);
    await screen.findByText("CSV SHOP");
    expect(screen.getByTestId("stmt-target-0")).toHaveTextContent("Don't import");
  });

  it("prefers the remembered account over the single-currency rule", async () => {
    await openAndUpload(csvFile(WIO_CSV), [MAIN, { ...SAVINGS, bankProfile: "wio" }]);
    await screen.findByText("CSV SHOP");
    expect(screen.getByTestId("stmt-target-0")).toHaveTextContent("Savings (AED)");
    expect(screen.queryByText(/Pre-selected/)).toBeNull();
  });

  it("checks for existing transactions when the account is chosen, with the whole file's rows", async () => {
    await openAndUpload(csvFile(WIO_CSV), [MAIN, SAVINGS]);
    await screen.findByText("CSV SHOP");
    await choose("stmt-target-0", /Savings/);
    expect(await screen.findByRole("button", { name: "Import 2 transaction(s)" })).toBeEnabled();
    expect(imports.checkExistingTransactions).toHaveBeenCalledTimes(1);
    const [assetId, txs] = imports.checkExistingTransactions.mock.calls[0];
    expect(assetId).toBe("a2");
    expect(txs).toHaveLength(2);
    expect(txs[0]).toMatchObject({ date: "2026-02-02", amount: -40, description: "CSV SHOP" });
  });
});

const ALL_BOX = "Select all or none of this account's transactions";

describe("BankStatementImportDialog row selection", () => {
  const rowBox = (name: RegExp) => screen.getByRole("checkbox", { name });

  it("shows a checked checkbox per row and a selected counter", async () => {
    await openAndUpload(csvFile(WIO_CSV));
    await screen.findByText("CSV SHOP");
    expect(rowBox(/Select the transaction of 2026-02-02/)).toBeChecked();
    expect(rowBox(/Select the transaction of 2026-02-03/)).toBeChecked();
    expect(screen.getByText("2 of 2 selected")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: ALL_BOX })).toBeChecked();
  });

  it("unchecking a row removes it from the transactions payload but not from the balance history", async () => {
    await openAndUpload(csvFile(WIO_CSV));
    await screen.findByText("CSV SHOP");
    await userEvent.click(rowBox(/Select the transaction of 2026-02-02/));
    expect(screen.getByText("1 of 2 selected")).toBeTruthy();
    expect(screen.getByText(/balance history is built from all rows/i)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: ALL_BOX })).toHaveAttribute("aria-checked", "mixed");

    await userEvent.click(screen.getByRole("button", { name: "Import 1 transaction(s)" }));
    expect(await screen.findByText(/1 new transaction\(s\), 0 already imported, 1 skipped by you/)).toBeTruthy();

    expect(imports.importBankCsvHistory).toHaveBeenCalledTimes(1);
    const history = imports.importBankCsvHistory.mock.calls[0][1] as { recorded_date: string }[];
    expect(history.map((r) => r.recorded_date).sort()).toEqual(["2026-02-02", "2026-02-03"]);

    expect(imports.importBankTransactions).toHaveBeenCalledTimes(1);
    const [assetId, sent, source] = imports.importBankTransactions.mock.calls[0];
    expect(assetId).toBe("a1");
    expect(source).toBe("csv_import");
    expect(sent).toEqual([{ date: "2026-02-03", amount: 500, description: "CSV SALARY", occurrence: 0 }]);
  });

  it("disables Import with a reason when nothing is selected", async () => {
    await openAndUpload(csvFile(WIO_CSV));
    await screen.findByText("CSV SHOP");
    await userEvent.click(screen.getByRole("button", { name: "Select none" }));
    expect(screen.getByText("0 of 2 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(screen.getByText("Select at least one transaction to import.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByRole("button", { name: "Import 2 transaction(s)" })).toBeEnabled();
  });

  it("the header checkbox toggles all rows", async () => {
    await openAndUpload(csvFile(WIO_CSV));
    await screen.findByText("CSV SHOP");
    const header = screen.getByRole("checkbox", { name: ALL_BOX });
    await userEvent.click(header);
    expect(screen.getByText("0 of 2 selected")).toBeTruthy();
    await userEvent.click(header);
    expect(screen.getByText("2 of 2 selected")).toBeTruthy();
  });

  it("clicking a row checkbox does not open the details drawer, clicking the date does", async () => {
    await openAndUpload(csvFile(WIO_CSV));
    await screen.findByText("CSV SHOP");
    await userEvent.click(rowBox(/Select the transaction of 2026-02-02/));
    expect(screen.queryByText("Transaction details")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "2026-02-03" }));
    expect(await screen.findByText("Transaction details")).toBeTruthy();
  });
});

describe("BankStatementImportDialog already imported transactions", () => {
  it("unchecks rows that are already stored, badges them and shows the group banner", async () => {
    imports.checkExistingTransactions.mockResolvedValue({ success: true, existing: [true, false] });
    await openAndUpload(csvFile(WIO_CSV));
    expect(await screen.findByText("1 of 2 transactions were already imported.")).toBeTruthy();
    expect(screen.getAllByText("Already imported")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: /Select the transaction of 2026-02-02/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Select the transaction of 2026-02-03/ })).toBeChecked();
    expect(screen.getByText("1 of 2 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import 1 transaction(s)" })).toBeEnabled();
  });

  it("reports already-imported rows that were not selected in the result and does not send them", async () => {
    imports.checkExistingTransactions.mockResolvedValue({ success: true, existing: [true, false] });
    await openAndUpload(csvFile(WIO_CSV));
    await userEvent.click(await screen.findByRole("button", { name: "Import 1 transaction(s)" }));
    expect(await screen.findByText(/1 new transaction\(s\), 1 already imported, 0 skipped by you/)).toBeTruthy();
    expect(imports.importBankTransactions.mock.calls[0][1]).toEqual([
      { date: "2026-02-03", amount: 500, description: "CSV SALARY", occurrence: 0 },
    ]);
  });

  it("skips a group whose rows are all already imported, and Import has nothing to do", async () => {
    imports.checkExistingTransactions.mockResolvedValue({ success: true, existing: [true, true] });
    await openAndUpload(csvFile(WIO_CSV));
    expect(await screen.findByText("This statement was already imported into Main.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(screen.getByText("Everything in this file was already imported, so there is nothing to import.")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Select the transaction of 2026-02-02/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
    expect(imports.importBankCsvHistory).not.toHaveBeenCalled();
    expect(imports.importBankTransactions).not.toHaveBeenCalled();
  });

  it("Select only new unticks stored rows; Select all ticks everything again", async () => {
    imports.checkExistingTransactions.mockResolvedValue({ success: true, existing: [true, false] });
    await openAndUpload(csvFile(WIO_CSV));
    await screen.findByText("1 of 2 selected");
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("2 of 2 selected")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Select only new" }));
    expect(screen.getByText("1 of 2 selected")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Select the transaction of 2026-02-02/ })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Select none" }));
    expect(screen.getByText("0 of 2 selected")).toBeTruthy();
  });

  it("degrades to unknown when the check fails and still allows the import", async () => {
    imports.checkExistingTransactions.mockResolvedValue({ error: "relation transactions does not exist" });
    await openAndUpload(csvFile(WIO_CSV));
    expect(await screen.findByText(/Could not check for already imported transactions/)).toBeTruthy();
    expect(screen.queryByText("Already imported")).toBeNull();
    expect(screen.getByRole("button", { name: "Import 2 transaction(s)" })).toBeEnabled();
  });

  it("also degrades when the check throws", async () => {
    imports.checkExistingTransactions.mockRejectedValue(new Error("boom"));
    await openAndUpload(csvFile(WIO_CSV));
    expect(await screen.findByText(/Could not check for already imported transactions/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import 2 transaction(s)" })).toBeEnabled();
  });

  it("re-checks against the new account when the target changes", async () => {
    imports.checkExistingTransactions
      .mockResolvedValueOnce({ success: true, existing: [true, true] })
      .mockResolvedValueOnce({ success: true, existing: [false, false] });
    await openAndUpload(csvFile(WIO_CSV), [MAIN, { ...SAVINGS, bankProfile: "wio" }]);
    expect(await screen.findByText("This statement was already imported into Savings.")).toBeTruthy();
    await choose("stmt-target-0", /Main/);
    expect(await screen.findByRole("button", { name: "Import 2 transaction(s)" })).toBeEnabled();
    expect(screen.queryByText(/was already imported into/)).toBeNull();
    expect(imports.checkExistingTransactions.mock.calls[1][0]).toBe("a1");
  });
});

describe("BankStatementImportDialog identical rows in one file", () => {
  const DUP_CSV =
    "Date,Description,Amount,Running Balance,Currency\n2026-02-02,COFFEE,-4.00,96.00,AED\n2026-02-02,COFFEE,-4.00,92.00,AED\n2026-02-03,SALARY,500.00,592.00,AED\n";

  it("warns about identical rows and keeps them as separate transactions with their occurrence numbers", async () => {
    imports.checkExistingTransactions.mockResolvedValue({ success: true, existing: [false, false, false] });
    await openAndUpload(csvFile(DUP_CSV));
    expect(await screen.findByText(/2 rows have the same date, amount and description as another row/)).toBeTruthy();
    expect(screen.getAllByText("Identical row")).toHaveLength(2);
    await userEvent.click(await screen.findByRole("button", { name: "Import 3 transaction(s)" }));
    await screen.findByText(/new transaction\(s\)/);
    const sent = imports.importBankTransactions.mock.calls[0][1] as { occurrence: number }[];
    expect(sent.map((t) => t.occurrence)).toEqual([0, 1, 0]);
  });

  it("keeps the occurrence number of the second identical row when only that one is sent", async () => {
    imports.checkExistingTransactions.mockResolvedValue({ success: true, existing: [false, false, false] });
    await openAndUpload(csvFile(DUP_CSV));
    await screen.findByText(/2 rows have the same date/);
    // Table order is newest first: SALARY, COFFEE (#0), COFFEE (#1). Untick SALARY and the first COFFEE row.
    await userEvent.click(screen.getByRole("checkbox", { name: /Select the transaction of 2026-02-03/ }));
    const coffee = screen.getAllByRole("checkbox", { name: /Select the transaction of 2026-02-02: COFFEE/ });
    await userEvent.click(coffee[0]);
    await userEvent.click(screen.getByRole("button", { name: "Import 1 transaction(s)" }));
    await screen.findByText(/new transaction\(s\)/);
    const sent = imports.importBankTransactions.mock.calls[0][1] as { description: string; occurrence: number }[];
    expect(sent).toHaveLength(1);
    expect(sent[0].description).toBe("COFFEE");
    expect(sent[0].occurrence).toBe(1);
  });
});
