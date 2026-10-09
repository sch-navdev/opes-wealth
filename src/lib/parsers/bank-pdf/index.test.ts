import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("./wio", () => ({
  wioProfile: {
    id: "wio",
    name: "Wio",
    detect: (t: string) => t.includes("WIO-MARK") || t.includes("BOTH-MARK"),
    parse: () => ({ ok: false, failure: { code: "no_transactions", bank: "wio", message: "stub wio" } }),
  },
}));
vi.mock("./fab", () => ({
  fabProfile: {
    id: "fab",
    name: "FAB",
    detect: (t: string) => t.includes("FAB-MARK") || t.includes("BOTH-MARK"),
    parse: () => ({ ok: false, failure: { code: "no_transactions", bank: "fab", message: "stub fab" } }),
  },
}));
vi.mock("./banque-populaire", () => ({
  banquePopulaireProfile: {
    id: "banque_populaire",
    name: "BP",
    detect: (t: string) => t.includes("BP-MARK"),
    parse: () => ({ ok: false, failure: { code: "no_transactions", bank: "banque_populaire", message: "stub bp" } }),
  },
}));

import { PDF_BANK_PROFILES, PDF_FAILURE_MESSAGE_KEYS, detectBankPdf, parseBankStatementPdfText } from "./index";
import type { PdfFailureCode } from "./types";

const hsbcText = readFileSync(join(__dirname, "fixtures", "hsbc-image-only.txt"), "utf8");
const filler = " statement body text that is long enough to pass the scanned check ".repeat(3);

describe("PDF_BANK_PROFILES / detectBankPdf", () => {
  it("keeps the documented order", () => {
    expect(PDF_BANK_PROFILES.map((p) => p.id)).toEqual(["wio", "fab_card", "fab", "banque_populaire_card", "banque_populaire", "hsbc_uae_card", "hsbc_uae", "cbi", "cbd"]);
  });

  it("detects each bank", () => {
    expect(detectBankPdf(`WIO-MARK${filler}`)?.id).toBe("wio");
    expect(detectBankPdf(`FAB-MARK${filler}`)?.id).toBe("fab");
    expect(detectBankPdf(`BP-MARK${filler}`)?.id).toBe("banque_populaire");
    expect(detectBankPdf(hsbcText)?.id).toBe("hsbc_uae");
  });

  it("returns the first match deterministically when two profiles match", () => {
    expect(detectBankPdf(`BOTH-MARK${filler}`)?.id).toBe("wio");
  });

  it("returns null when nothing matches", () => {
    expect(detectBankPdf("nothing to see")).toBeNull();
  });
});

describe("parseBankStatementPdfText", () => {
  it("fails with scanned for a text-less PDF", () => {
    const out = parseBankStatementPdfText("\n\n", { numPages: 1 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.code).toBe("scanned");
  });

  it("fails with unreadable for empty text and no pages", () => {
    const out = parseBankStatementPdfText("");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.code).toBe("unreadable");
  });

  it("fails with unsupported when no bank matches", () => {
    const out = parseBankStatementPdfText(`Some unrelated document${filler}`, { numPages: 1 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.code).toBe("unsupported");
  });

  it("delegates to the detected profile", () => {
    const out = parseBankStatementPdfText(`FAB-MARK${filler}`, { numPages: 1 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.message).toBe("stub fab");
  });

  it("honours a forced bank even when detection would pick another", () => {
    const out = parseBankStatementPdfText(`WIO-MARK${filler}`, { numPages: 1, bank: "banque_populaire" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.message).toBe("stub bp");
  });

  it("surfaces HSBC image_only via the real profile", () => {
    const out = parseBankStatementPdfText(hsbcText, { numPages: 5 });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure.code).toBe("image_only");
      expect(out.failure.bank).toBe("hsbc_uae");
    }
  });
});

describe("PDF_FAILURE_MESSAGE_KEYS", () => {
  it("maps every failure code to a translation key", () => {
    const codes: PdfFailureCode[] = [
      "encrypted",
      "password_incorrect",
      "scanned",
      "image_only",
      "unsupported",
      "no_transactions",
      "not_account_statement",
      "unreadable",
      "too_large",
      "ocr_unavailable",
    ];
    expect(Object.keys(PDF_FAILURE_MESSAGE_KEYS).sort()).toEqual([...codes].sort());
    // password_incorrect and ocr_unavailable have their own key families.
    const special: Partial<Record<PdfFailureCode, string>> = {
      password_incorrect: "bank_pdf_password_incorrect",
      ocr_unavailable: "bank_pdf_ocr_unavailable",
    };
    for (const c of codes) expect(PDF_FAILURE_MESSAGE_KEYS[c]).toBe(special[c] ?? `bank_pdf_error_${c}`);
  });
});
