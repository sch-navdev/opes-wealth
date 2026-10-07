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
vi.mock("@/app/dashboard/bank-pdf-actions", () => action);
vi.mock("@/app/dashboard/actions", () => ({ importBankCsvHistory: vi.fn() }));
vi.mock("@/app/dashboard/transaction-import-actions", () => ({ importBankTransactions: vi.fn() }));
vi.mock("@/app/dashboard/banking/actions", () => ({ rememberCashAccountBank: vi.fn() }));

import { BankStatementImportDialog } from "@/components/bank-statement-import-dialog";

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

function renderDialog() {
  return render(
    <LanguageProvider>
      <BankStatementImportDialog accounts={[{ id: "a1", name: "Main", currency: "AED", nativeValue: 100 }]} />
    </LanguageProvider>,
  );
}

async function openAndUpload(file = new File(["%PDF-1.4"], "hsbc.pdf", { type: "application/pdf" })) {
  const view = renderDialog();
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
    await userEvent.click(screen.getByRole("option", { name: /HSBC UAE/ }));

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
    await choose("stmt-bank-select", /HSBC UAE/);
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
