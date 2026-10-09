/**
 * Banque Populaire (France) "Relevé mensuel d'opérations par carte bancaire" (deferred-debit card
 * statement, text layer).
 *
 * Layout facts (pdf-parse output of a real 2026 statement; the PDF has one page for a quiet month):
 *  - title line "Votre relevé mensuel d'opérations par carte bancaire au DD/MM/YYYY" (statement date);
 *  - "VOTRE COMPTE N° <account>" then the holder line; the account number is the settlement account
 *    that the single monthly card debit hits, so the card rows get their OWN account reference
 *    (the card's last four digits) and are never merged with the account extract;
 *  - column headers "DATE DE L'ACHAT" / "NOM ET ADRESSE DU COMMERCANTMONTANT" (the last two glued);
 *  - a line "CB*<last 4 digits> <holder>" opens one block per card;
 *  - one row per purchase on a single line with the cells glued together:
 *    "DD/MM/YY<merchant><location><amount> €" (e.g. 28/11/25...10,11 €); foreign-currency purchases
 *    add the lines "ORIGINE:<amount> <CCY>" and "1EURO = <rate>";
 *  - "TOTAL<amount> €" is printed twice (per card, then overall): the last one is the amount debited
 *    from the account.
 *
 * Model: the repo's signed convention (positive = money in) makes every purchase negative. There is
 * no printed opening balance, so opening = 0 and closing = minus the printed total: `reconcile`
 * (sum of rows = total) proves the parse. Because the date, merchant and amount cells are glued, a
 * merchant name that ends in digits would be ambiguous: the total check then reports a mismatch,
 * the numbers are never corrected. Unreadable rows are counted and warned about, never guessed.
 */
import { buildAccount, isoDate, moneyFields, roundMoney, squash } from "./shared";
import type { BankPdfProfile, PdfParseOutcome, TransactionFingerprint } from "./types";

const AMOUNT = "-?\\s*\\d{1,3}(?:[ .\\u00a0\\u202f]?\\d{3})*,\\d{2}|-?\\s*\\d+,\\d{2}";
const ROW = new RegExp(`^(\\d{2})/(\\d{2})/(\\d{2})(.+?)\\s*(${AMOUNT})\\s*€\\s*(CR)?\\s*$`);
const DATE_START = /^\d{2}\/\d{2}\/\d{2}/;
const TOTAL = new RegExp(`^TOTAL\\s*(${AMOUNT})\\s*€\\s*$`);
const ORIGIN = /^\s*ORIGINE\s*:\s*(.+?)\s*$/;
const RATE = /^\s*1\s*EURO\s*=\s*([\d,]+)\s*$/;
const CARD = /^CB\*(\d{4})\b/;
const TITLE = /relev[ée] mensuel d'op[ée]rations par carte bancaire au (\d{2})\/(\d{2})\/(\d{4})/i;

export function isBanquePopulaireCardStatement(text: string): boolean {
  return /banque populaire/i.test(text) && TITLE.test(text);
}

function euros(s: string): number {
  const neg = s.trim().startsWith("-");
  const n = Number(s.replace(/[^\d,]/g, "").replace(",", "."));
  return neg ? -n : n;
}

function parse(text: string): PdfParseOutcome {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const warnings: string[] = [];

  const title = lines.map((l) => TITLE.exec(l)).find(Boolean) ?? null;
  const periodEnd = title ? isoDate(Number(title[3]), Number(title[2]), Number(title[1])) : null;

  let card: string | null = null;
  const totals: number[] = [];
  type Raw = { date: string; label: string; amount: number; extra: string[] };
  const raws: Raw[] = [];
  let badRows = 0;
  let started = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const c = CARD.exec(t);
    if (c) {
      card = card ?? c[1];
      started = true;
      continue;
    }
    if (!started) continue;
    const tot = TOTAL.exec(t);
    if (tot) {
      totals.push(roundMoney(euros(tot[1])));
      continue;
    }
    const origin = ORIGIN.exec(line);
    const rate = RATE.exec(line);
    if ((origin || rate) && raws.length > 0) {
      raws[raws.length - 1].extra.push(origin ? `origin ${origin[1]}` : `rate ${rate![1]}`);
      continue;
    }
    if (DATE_START.test(t)) {
      const m = ROW.exec(t);
      const date = m ? isoDate(2000 + Number(m[3]), Number(m[2]), Number(m[1])) : null;
      const label = m ? squash(m[4]) : "";
      if (!m || !date || !label) {
        badRows++;
        continue;
      }
      let amount = euros(m[5]);
      if (m[6]) amount = -amount; // a trailing CR would mark a credit (refund); never seen in a sample
      raws.push({ date, label, amount, extra: [] });
    }
  }

  const total = totals.length > 0 ? totals[totals.length - 1] : null;
  if (raws.length === 0) {
    if (total === 0 || (title && started && badRows === 0)) {
      warnings.push("This statement has no transactions.");
      return {
        ok: true,
        statement: {
          bank: "banque_populaire_card",
          bankName: "Banque Populaire (France) card",
          warnings,
          accounts: [
            buildAccount({
              accountRef: card ? `CB ${card}` : "",
              currency: "EUR",
              periodStart: null,
              periodEnd,
              openingBalance: 0,
              closingBalance: total === null ? null : -total,
              transactions: [],
            }),
          ],
        },
      };
    }
    return {
      ok: false,
      failure: { code: "no_transactions", bank: "banque_populaire_card", message: "No Banque Populaire card transaction rows were found." },
    };
  }

  const accountRef = card ? `CB ${card}` : "";
  const transactions: TransactionFingerprint[] = raws.map((r, i) => ({
    bank: "banque_populaire_card",
    accountRef,
    currency: "EUR",
    date: r.date,
    valueDate: null,
    description: r.label,
    rawDescription: squash([r.label, ...r.extra].join(" ")),
    ...moneyFields(-r.amount),
    balance: null,
    reference: null,
    index: i,
  }));

  if (badRows > 0) warnings.push(`${badRows} transaction line(s) could not be read and were skipped.`);
  if (total === null) warnings.push("The statement total was not found: the parse cannot be verified.");
  if (totals.length > 1) {
    const perCard = roundMoney(totals.slice(0, -1).reduce((s, x) => s + x, 0));
    if (totals.length > 2 && perCard !== total) warnings.push("The per-card totals do not add up to the overall total.");
  }

  return {
    ok: true,
    statement: {
      bank: "banque_populaire_card",
      bankName: "Banque Populaire (France) card",
      warnings,
      accounts: [
        buildAccount({
          accountRef,
          currency: "EUR",
          periodStart: null,
          periodEnd,
          openingBalance: 0,
          closingBalance: total === null ? null : roundMoney(-total),
          transactions,
        }),
      ],
    },
  };
}

export const banquePopulaireCardProfile: BankPdfProfile = {
  id: "banque_populaire_card",
  name: "Banque Populaire (France) card",
  detect: isBanquePopulaireCardStatement,
  parse,
};
