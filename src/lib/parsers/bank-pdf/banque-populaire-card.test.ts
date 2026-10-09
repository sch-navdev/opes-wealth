import { describe, expect, it } from "vitest";
import { banquePopulaireCardProfile } from "./banque-populaire-card";
import { detectBankPdf, parseBankStatementPdfText } from "./index";

// Invented text that mimics the pdf-parse layout of a Relevé CB (cells glued, no real data).
const head = [
  "Société anonyme coopérative de Banque Populaire à capital variable",
  "JE CONSERVE",
  "M OU MME EXEMPLE ALICE",
  "Votre relevé mensuel d'opérations par carte bancaire au 02/02/2026",
  "VOTRE COMPTE N° 00000000001",
  "M OU MME EXEMPLE ALICE",
  "DATE DE L'ACHAT",
  "NOM ET ADRESSE DU COMMERCANTMONTANT",
  "CB*1234 A.EXAMPLE",
];

function statement(body: string[]): string {
  return [...head, ...body, " ", "En cas de perte, vol ou utilisation frauduleuse de votre carte"].join("\n");
}

const SAMPLE = statement([
  "28/12/25SHOP ALPHAUS S.CO/HELPPAY10,11 €",
  "    ORIGINE:42,99 AED",
  "     1EURO =        4,25222569",
  "05/01/26SHOP BETAFR PARIS1 234,50 €",
  "TOTAL1 244,61 €",
  "TOTAL1 244,61 €",
]);

describe("banquePopulaireCardProfile", () => {
  it("detects a card statement and is registered before the account profile", () => {
    expect(banquePopulaireCardProfile.detect(SAMPLE)).toBe(true);
    expect(detectBankPdf(SAMPLE)?.id).toBe("banque_populaire_card");
  });

  it("does not claim an account extract", () => {
    expect(banquePopulaireCardProfile.detect("Banque Populaire\nRELEVÉ DE COMPTE\nSOLDE CREDITEUR")).toBe(false);
  });

  it("parses rows as debits on a card account that reconciles to the printed total", () => {
    const out = banquePopulaireCardProfile.parse(SAMPLE);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const [acc] = out.statement.accounts;
    expect(out.statement.bank).toBe("banque_populaire_card");
    expect(acc.accountRef).toBe("CB 1234");
    expect(acc.currency).toBe("EUR");
    expect(acc.periodEnd).toBe("2026-02-02");
    expect(acc.transactions).toHaveLength(2);
    expect(acc.transactions[0]).toMatchObject({ date: "2025-12-28", amount: -10.11, debit: 10.11, credit: null, balance: null });
    expect(acc.transactions[0].rawDescription).toContain("origin 42,99 AED");
    expect(acc.transactions[1]).toMatchObject({ date: "2026-01-05", amount: -1234.5 });
    expect(acc.reconciliation.status).toBe("ok");
    expect(out.statement.warnings).toEqual([]);
  });

  it("never includes the holder name or the account number in a row", () => {
    const out = banquePopulaireCardProfile.parse(SAMPLE);
    if (!out.ok) throw new Error("parse failed");
    const dump = JSON.stringify(out.statement.accounts[0].transactions);
    expect(dump).not.toMatch(/EXEMPLE|00000000001/);
  });

  it("reports a mismatch when the printed total differs from the rows", () => {
    const text = statement(["28/12/25SHOP ALPHAUS S.CO/HELPPAY10,11 €", "TOTAL99,99 €", "TOTAL99,99 €"]);
    const out = banquePopulaireCardProfile.parse(text);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.statement.accounts[0].reconciliation.status).toBe("mismatch");
  });

  it("counts unreadable date lines and warns instead of guessing", () => {
    const text = statement(["28/12/25SHOP ALPHAUS S.CO/HELPPAY10,11 €", "31/02/25SHOP BAD DATE5,00 €", "TOTAL10,11 €"]);
    const out = banquePopulaireCardProfile.parse(text);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.statement.accounts[0].transactions).toHaveLength(1);
    expect(out.statement.warnings.join(" ")).toMatch(/1 transaction line/);
  });

  it("warns when no total is printed (unverified)", () => {
    const out = banquePopulaireCardProfile.parse(statement(["28/12/25SHOP ALPHAUS S.CO/HELPPAY10,11 €"]));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.statement.accounts[0].reconciliation.status).toBe("unverified");
    expect(out.statement.warnings.join(" ")).toMatch(/total was not found/);
  });

  it("returns ok with a note for a quiet month", () => {
    const out = banquePopulaireCardProfile.parse(statement(["TOTAL0,00 €", "TOTAL0,00 €"]));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.statement.warnings.join(" ")).toMatch(/no transactions/i);
    expect(out.statement.accounts[0].reconciliation.status).toBe("ok");
  });

  it("fails with no_transactions when every row is unreadable", () => {
    const out = banquePopulaireCardProfile.parse(statement(["31/02/25SHOP BAD DATE5,00 €"]));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure).toMatchObject({ code: "no_transactions", bank: "banque_populaire_card" });
  });
});

describe("other Banque Populaire documents", () => {
  it("say they are not an account statement instead of unsupported", () => {
    const filler = " texte de l'avis de virement suffisamment long pour passer le controle ".repeat(3);
    const out = parseBankStatementPdfText(`Banque Populaire\nAVIS DE VIREMENT RECU\n${filler}`, { numPages: 1 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure).toMatchObject({ code: "not_account_statement", bank: "banque_populaire" });
  });
});
