import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  pdfToTextWithPages: vi.fn(),
  isOcrConfigured: vi.fn(),
  ocrPdfToDocument: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/pdf-text", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf-text")>("@/lib/pdf-text");
  return { ...actual, pdfToTextWithPages: mocks.pdfToTextWithPages };
});
vi.mock("@/lib/services/ocr-client", () => ({
  isOcrConfigured: mocks.isOcrConfigured,
  ocrPdfToDocument: mocks.ocrPdfToDocument,
}));

import { readBankStatementPdf } from "@/app/dashboard/bank-pdf-actions";
import { PdfPasswordError } from "@/lib/pdf-text";

const PASSWORD = "my-top-secret-pw";

function form(password?: string, bytes = "%PDF-1.4 x", ocr = false, bank?: string) {
  const f = new FormData();
  if (bank !== undefined) f.append("bank", bank);
  f.append("file", new File([bytes], "s.pdf", { type: "application/pdf" }));
  if (password !== undefined) f.append("password", password);
  if (ocr) f.append("ocr", "1");
  return f;
}

beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
  mocks.pdfToTextWithPages.mockReset();
  mocks.isOcrConfigured.mockReset().mockReturnValue(false);
  mocks.ocrPdfToDocument.mockReset();
});

describe("readBankStatementPdf passwords", () => {
  it("returns encrypted when a password is required", async () => {
    mocks.pdfToTextWithPages.mockRejectedValue(new PdfPasswordError("required"));
    const r = await readBankStatementPdf(form());
    expect(r).toMatchObject({ ok: false, failure: { code: "encrypted" } });
  });

  it("returns password_incorrect for a wrong password and never echoes or logs it", async () => {
    mocks.pdfToTextWithPages.mockRejectedValue(new PdfPasswordError("incorrect"));
    const spies = (["log", "error", "warn", "info"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const r = await readBankStatementPdf(form(PASSWORD));
    expect(r).toMatchObject({ ok: false, failure: { code: "password_incorrect" } });
    expect(JSON.stringify(r)).not.toContain(PASSWORD);
    expect(mocks.pdfToTextWithPages.mock.calls[0][1]).toBe(PASSWORD);
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(PASSWORD);
    spies.forEach((s) => s.mockRestore());
  });

  it("does not log the password when extraction fails for another reason", async () => {
    mocks.pdfToTextWithPages.mockRejectedValue(new Error(`boom ${PASSWORD}`));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await readBankStatementPdf(form(PASSWORD));
    expect(r).toMatchObject({ ok: false, failure: { code: "unreadable" } });
    expect(JSON.stringify(spy.mock.calls)).not.toContain(PASSWORD);
    expect(JSON.stringify(r)).not.toContain(PASSWORD);
    spy.mockRestore();
  });

  it("rejects an over-long password without calling the reader", async () => {
    const r = await readBankStatementPdf(form("x".repeat(257)));
    expect(r).toMatchObject({ ok: false, failure: { code: "password_incorrect" } });
    expect(mocks.pdfToTextWithPages).not.toHaveBeenCalled();
  });

  it("rejects files over 5 MB", async () => {
    const r = await readBankStatementPdf(form(undefined, "%PDF-" + "a".repeat(5 * 1024 * 1024)));
    expect(r).toMatchObject({ ok: false, failure: { code: "too_large", message: "The PDF is larger than 5 MB." } });
  });
});

describe("readBankStatementPdf OCR", () => {
  const hsbcDoc = {
    pages: [
      {
        lines: ["HSBC Bank Middle East Limited", "Statement of Account", "01 Feb 2026 to 28 Feb 2026"],
        tables: [
          {
            rows: [
              ["Date", "Transaction details", "Withdrawals", "Deposits", "Balance"],
              ["", "B/F", "", "", "100.00"],
              ["02 Feb", "FAKE SHOP", "40.00", "", "60.00"],
              ["", "Closing balance", "", "", "60.00"],
            ],
          },
        ],
      },
    ],
  };
  const scanned = () => mocks.pdfToTextWithPages.mockResolvedValue({ text: "", numPages: 1 });

  it("without consent never calls OCR and flags it as available when configured", async () => {
    scanned();
    mocks.isOcrConfigured.mockReturnValue(true);
    const r = await readBankStatementPdf(form());
    expect(r).toMatchObject({ ok: false, failure: { code: "scanned", ocr: "available" } });
    expect(mocks.ocrPdfToDocument).not.toHaveBeenCalled();
  });

  it("without consent flags OCR as unconfigured when the keys are missing", async () => {
    scanned();
    const r = await readBankStatementPdf(form());
    expect(r).toMatchObject({ ok: false, failure: { code: "scanned", ocr: "unconfigured" } });
    expect(mocks.ocrPdfToDocument).not.toHaveBeenCalled();
  });

  it("with consent and OCR configured returns the OCR statement", async () => {
    scanned();
    mocks.isOcrConfigured.mockReturnValue(true);
    mocks.ocrPdfToDocument.mockResolvedValue({ ok: true, document: hsbcDoc, pages: 1, truncated: false });
    const r = await readBankStatementPdf(form(undefined, "%PDF-1.4 x", true));
    expect(mocks.ocrPdfToDocument).toHaveBeenCalledTimes(1);
    expect(mocks.ocrPdfToDocument.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
    expect(r.ok && r.statement.source).toBe("ocr");
    expect(r.ok && r.statement.bank).toBe("hsbc_uae");
  });

  it("adds a warning when OCR read only the first pages", async () => {
    scanned();
    mocks.isOcrConfigured.mockReturnValue(true);
    mocks.ocrPdfToDocument.mockResolvedValue({ ok: true, document: hsbcDoc, pages: 8, truncated: true });
    const r = await readBankStatementPdf(form(undefined, "%PDF-1.4 x", true));
    expect(r.ok && r.statement.warnings[0]).toBe("Only the first 8 pages were read.");
  });

  it("with consent but OCR not configured returns ocr_unavailable without calling OCR", async () => {
    scanned();
    const r = await readBankStatementPdf(form(undefined, "%PDF-1.4 x", true));
    expect(r).toMatchObject({ ok: false, failure: { code: "ocr_unavailable" } });
    expect(mocks.ocrPdfToDocument).not.toHaveBeenCalled();
  });

  it.each([
    ["not_configured", "ocr_unavailable"],
    ["access_denied", "ocr_unavailable"],
    ["throttled", "ocr_unavailable"],
    ["provider_error", "ocr_unavailable"],
    ["unreadable", "unreadable"],
    ["too_many_pages", "unreadable"],
  ])("maps the OCR failure %s to %s and logs only the reason", async (reason, code) => {
    scanned();
    mocks.isOcrConfigured.mockReturnValue(true);
    mocks.ocrPdfToDocument.mockResolvedValue({ ok: false, reason, message: "secret-ish provider text" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await readBankStatementPdf(form(undefined, "%PDF-1.4 x", true));
    expect(r).toMatchObject({ ok: false, failure: { code } });
    expect(JSON.stringify(r)).not.toContain("secret-ish");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("secret-ish");
    spy.mockRestore();
  });

  it("never sends an encrypted PDF to OCR, even with consent", async () => {
    mocks.pdfToTextWithPages.mockRejectedValue(new PdfPasswordError("required"));
    mocks.isOcrConfigured.mockReturnValue(true);
    const r = await readBankStatementPdf(form(undefined, "%PDF-1.4 x", true));
    expect(r).toMatchObject({ ok: false, failure: { code: "encrypted" } });
    expect(mocks.ocrPdfToDocument).not.toHaveBeenCalled();
  });

  it("does not call OCR for a PDF that has text, even with consent", async () => {
    mocks.pdfToTextWithPages.mockResolvedValue({
      text: "Some unrelated document with plenty of words but nothing else here at all",
      numPages: 1,
    });
    mocks.isOcrConfigured.mockReturnValue(true);
    const r = await readBankStatementPdf(form(undefined, "%PDF-1.4 x", true));
    expect(r).toMatchObject({ ok: false, failure: { code: "unsupported" } });
    expect(mocks.ocrPdfToDocument).not.toHaveBeenCalled();
  });
});

describe("readBankStatementPdf forced bank", () => {
  const junk = { text: "Some unrelated document with plenty of words but nothing else here at all", numPages: 1 };

  it("forces the chosen bank's parser instead of reporting an unsupported layout", async () => {
    mocks.pdfToTextWithPages.mockResolvedValue(junk);
    const detected = await readBankStatementPdf(form());
    expect(detected).toMatchObject({ ok: false, failure: { code: "unsupported" } });
    const forced = await readBankStatementPdf(form(undefined, "%PDF-1.4 x", false, "wio"));
    expect(forced.ok === false && forced.failure.code).not.toBe("unsupported");
  });

  it("ignores an unknown bank value (detection runs as usual)", async () => {
    mocks.pdfToTextWithPages.mockResolvedValue(junk);
    for (const bank of ["cbd", "__proto__", ""]) {
      const r = await readBankStatementPdf(form(undefined, "%PDF-1.4 x", false, bank));
      expect(r).toMatchObject({ ok: false, failure: { code: "unsupported" } });
    }
  });

  it("passes the forced bank to the OCR parser too (consent still required)", async () => {
    mocks.pdfToTextWithPages.mockResolvedValue({ text: "", numPages: 1 });
    mocks.isOcrConfigured.mockReturnValue(true);
    const noConsent = await readBankStatementPdf(form(undefined, "%PDF-1.4 x", false, "hsbc_uae"));
    expect(noConsent).toMatchObject({ ok: false, failure: { code: "scanned", ocr: "available" } });
    expect(mocks.ocrPdfToDocument).not.toHaveBeenCalled();
    mocks.ocrPdfToDocument.mockResolvedValue({
      ok: true,
      document: { pages: [{ lines: ["Totally unrecognisable text"], tables: [] }] },
      pages: 1,
      truncated: false,
    });
    const r = await readBankStatementPdf(form(undefined, "%PDF-1.4 x", true, "hsbc_uae"));
    expect(mocks.ocrPdfToDocument).toHaveBeenCalledTimes(1);
    // Forced to HSBC UAE: its OCR parser ran (so not the generic "no layout recognised" outcome of detection).
    expect(r.ok === false && r.failure.message).not.toMatch(/No supported bank statement layout/);
  });
});
