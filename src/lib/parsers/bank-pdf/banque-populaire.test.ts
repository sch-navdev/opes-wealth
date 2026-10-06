import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { banquePopulaireProfile } from "./banque-populaire";
import type { PdfAccountStatement, PdfStatement } from "./types";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

function parseOk(text: string): PdfStatement {
  const out = banquePopulaireProfile.parse(text);
  if (!out.ok) throw new Error(`parse failed: ${out.failure.code}`);
  return out.statement;
}

const EXTRAIT = fixture("banque-populaire-extrait.txt");
const DEBITEUR = fixture("banque-populaire-debiteur.txt");

describe("banquePopulaireProfile.detect", () => {
  it("recognises account statements", () => {
    expect(banquePopulaireProfile.detect(EXTRAIT)).toBe(true);
    expect(banquePopulaireProfile.detect(DEBITEUR)).toBe(true);
    expect(banquePopulaireProfile.id).toBe("banque_populaire");
    expect(banquePopulaireProfile.name).toBe("Banque Populaire (France)");
  });

  it("rejects other banks and non-statement Banque Populaire documents", () => {
    expect(banquePopulaireProfile.detect("Wio Bank PJSC statement")).toBe(false);
    const notice = "Banque Populaire\nVirement international reçu\nMontant 100,00 EUR";
    expect(banquePopulaireProfile.detect(notice)).toBe(false);
    const out = banquePopulaireProfile.parse(notice);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure.code).toBe("unsupported");
      expect(out.failure.bank).toBe("banque_populaire");
    }
  });
});

describe("banquePopulaireProfile.parse (credit balance, Dec -> Jan rollover)", () => {
  const st = parseOk(EXTRAIT);
  const acct: PdfAccountStatement = st.accounts[0];

  it("reads the header", () => {
    expect(st.bank).toBe("banque_populaire");
    expect(st.bankName).toBe("Banque Populaire (France)");
    expect(st.accounts).toHaveLength(1);
    expect(acct.accountRef).toBe("FR7600000000000000000000000");
    expect(acct.currency).toBe("EUR");
    expect(acct.periodStart).toBe("2025-12-10");
    expect(acct.periodEnd).toBe("2026-01-02");
    expect(acct.openingBalance).toBe(1234.5);
    expect(acct.closingBalance).toBe(2120.14);
  });

  it("parses every row exactly (booking date, value date, amount)", () => {
    const rows = acct.transactions.map((t) => [t.date, t.valueDate, t.amount]);
    expect(rows).toEqual([
      ["2025-12-12", "2025-12-12", 1000],
      ["2025-12-15", "2025-12-15", -45.3],
      ["2025-12-17", "2025-12-16", -24.35],
      ["2025-12-30", "2025-12-29", -8],
      ["2025-12-31", "2025-12-31", -21.44],
      ["2026-01-02", "2026-01-02", 150],
      ["2026-01-02", "2026-01-02", -165.27],
    ]);
    acct.transactions.forEach((t, i) => {
      expect(t.index).toBe(i);
      expect(t.currency).toBe("EUR");
      expect(t.bank).toBe("banque_populaire");
      expect(t.accountRef).toBe(acct.accountRef);
    });
  });

  it("sets debit/credit from the sign", () => {
    const [credit, debit] = acct.transactions;
    expect(credit.credit).toBe(1000);
    expect(credit.debit).toBeNull();
    expect(debit.debit).toBe(45.3);
    expect(debit.credit).toBeNull();
  });

  it("separates label, glued reference and continuation lines", () => {
    const t = acct.transactions;
    expect(t[0].description).toBe("VIREMENT SEPA SALAIRE EXEMPLE SA");
    expect(t[0].reference).toBeNull();
    expect(t[1].description).toBe("PRLV SEPA ASSURANCE EXEMPLE");
    expect(t[1].reference).toBe("0AB12CD");
    expect(t[1].rawDescription).toBe(
      "PRLV SEPA ASSURANCE EXEMPLE 12345678/X000000001 13122025 X000000001",
    );
    expect(t[2].description).toBe("COTIS DUO PREMIUM");
    expect(t[2].reference).toBe("0022485");
    expect(t[2].rawDescription).toContain("CONTRAT CNV0000000000");
    expect(t[3].description).toBe("FRAIS COM INTERVENTION");
    expect(t[3].reference).toBe("0055039");
    expect(t[4].description).toBe("CB FACTURETTES CB");
    expect(t[4].reference).toBeNull();
    expect(t[6].description).toBe("PRLV SEPA SANTE EXEMPLE");
    expect(t[6].reference).toBe("0E43QLG");
  });

  it("does not turn the card-statement line, SEPA detail or fees recap into transactions", () => {
    expect(acct.transactions).toHaveLength(7);
    expect(acct.transactions.some((t) => t.rawDescription.includes("VOTRE RELEVE CB"))).toBe(false);
    // The deferred-card line must not leak into the previous row's description.
    expect(acct.transactions[3].rawDescription).not.toContain("1234");
  });

  it("verifies the intermediate balance checkpoint without counting it as a row", () => {
    // 31/12 checkpoint is attached to the row before it (the CB debit).
    expect(acct.transactions[4].balance).toBe(2135.41);
    expect(acct.transactions.filter((t) => t.balance !== null)).toHaveLength(1);
    expect(acct.reconciliation.brokenBalanceRows).toEqual([]);
  });

  it("matches the printed totals and reconciles to the cent", () => {
    const debits = acct.transactions.reduce((s, t) => s + (t.debit ?? 0), 0);
    const credits = acct.transactions.reduce((s, t) => s + (t.credit ?? 0), 0);
    expect(Math.round(debits * 100)).toBe(26436);
    expect(Math.round(credits * 100)).toBe(115000);
    expect(acct.reconciliation.status).toBe("ok");
    expect(acct.reconciliation.computedClosing).toBe(2120.14);
    expect(acct.reconciliation.difference).toBe(0);
    expect(st.warnings).toEqual([]);
  });

  it("flags a tampered amount as a mismatch with a totals warning", () => {
    const bad = EXTRAIT.replace("02/01VIREMENT SEPA02/0102/01 150,00 €", "02/01VIREMENT SEPA02/0102/01 151,00 €");
    expect(bad).not.toBe(EXTRAIT);
    const s = parseOk(bad);
    expect(s.accounts[0].reconciliation.status).toBe("mismatch");
    expect(s.warnings.some((w) => /credits/.test(w))).toBe(true);
  });

  it("flags a wrong intermediate checkpoint", () => {
    const bad = EXTRAIT.replace("SOLDE CREDITEUR AU 31/12/2025 2 135,41 €", "SOLDE CREDITEUR AU 31/12/2025 2 135,42 €");
    const s = parseOk(bad);
    expect(s.accounts[0].reconciliation.status).toBe("mismatch");
    expect(s.accounts[0].reconciliation.brokenBalanceRows).toEqual([4]);
  });

  it("accepts narrow no-break and no-break space thousands separators", () => {
    const nb = EXTRAIT.replace("1 234,50 €", "1 234,50 €").replace("12/12 1 000,00 €", "12/12 1 000,00 €");
    const s = parseOk(nb);
    expect(s.accounts[0].openingBalance).toBe(1234.5);
    expect(s.accounts[0].transactions[0].amount).toBe(1000);
    expect(s.accounts[0].reconciliation.status).toBe("ok");
  });
});

describe("banquePopulaireProfile.parse (SOLDE DEBITEUR)", () => {
  const st = parseOk(DEBITEUR);
  const acct = st.accounts[0];

  it("treats SOLDE DEBITEUR as a negative balance", () => {
    expect(acct.openingBalance).toBe(-120);
    expect(acct.closingBalance).toBe(-95.4);
    expect(acct.periodStart).toBe("2026-01-10");
    expect(acct.periodEnd).toBe("2026-02-05");
  });

  it("parses rows within a single year", () => {
    expect(acct.transactions.map((t) => [t.date, t.valueDate, t.amount])).toEqual([
      ["2026-01-12", "2026-01-12", 100],
      ["2026-01-20", "2026-01-20", -75.4],
    ]);
    expect(acct.transactions[1].reference).toBe("0ZZ99AA");
    expect(acct.accountRef).toBe("FR7600000000000000000000001");
  });

  it("reconciles from a negative opening balance", () => {
    expect(acct.reconciliation.status).toBe("ok");
    expect(acct.reconciliation.computedClosing).toBe(-95.4);
    expect(st.warnings).toEqual([]);
  });
});
