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
const PARENT = /VOTRE COMPTE N°\s*(\d{6,})/i;
const TITLE = /relev[ée] mensuel d'op[ée]rations par carte bancaire au (\d{2})\/(\d{2})\/(\d{4})/i;

export function isBanquePopulaireCardStatement(text: string): boolean {
  return /banque populaire/i.test(text) && TITLE.test(text);
}

function euros(s: string): number {
  const neg = s.trim().startsWith("-");
  const n = Number(s.replace(/[^\d,]/g, "").replace(",", "."));
  return neg ? -n : n;
}

/** "27,00 EUR" -> 27 (the purchase amount in its own currency), null when unreadable. */
function originNumber(s: string): number | null {
  const m = /([\d .\u00a0\u202f]*\d),(\d{2})/.exec(s);
  return m ? Number(`${m[1].replace(/\D/g, "")}.${m[2]}`) : null;
}

type GluedRow = { label: string; amount: number; amountRaw: string; expected: number | null };

/**
 * Candidate readings of a glued "<digits><amount>" cell. The page prints the merchant name,
 * location and amount in separate cells that the text layer glues together, so a location ending
 * in digits ("FR SAINT 640207" + "22,00") reads as one number "64020722,00". Each candidate keeps
 * the last k integer digits as the amount and gives the rest back to the label.
 */
function gluedCandidates(raw: string): { amount: number; moved: string }[] {
  const neg = raw.trim().startsWith("-");
  const m = /^-?\s*(\d+),(\d{2})$/.exec(raw.trim());
  if (!m || m[1].length < 4) return [];
  const out: { amount: number; moved: string }[] = [];
  for (let k = m[1].length - 1; k >= 1; k--) {
    const kept = m[1].slice(m[1].length - k);
    if (k > 1 && kept.startsWith("0")) continue;
    const value = Number(`${kept}.${m[2]}`);
    out.push({ amount: neg ? -value : value, moved: m[1].slice(0, m[1].length - k) });
  }
  return out;
}

function applyCandidate(row: GluedRow, c: { amount: number; moved: string }) {
  row.amount = c.amount;
  row.label = squash(`${row.label}${c.moved}`);
}

/**
 * Fix amounts that swallowed digits of the location. First choice: the "ORIGINE" line of the same
 * row (purchase amount / rate) names the real amount. Otherwise a statement whose rows do not add
 * up to the printed total tries the other readings of the suspicious rows (smallest change that
 * reconciles). Nothing is changed when no reading reconciles.
 */
function repairGluedAmounts(raws: GluedRow[], total: number | null) {
  const unresolved: { row: GluedRow; cands: { amount: number; moved: string }[] }[] = [];
  for (const row of raws) {
    const cands = gluedCandidates(row.amountRaw);
    if (cands.length === 0) continue;
    const hit = row.expected != null ? cands.find((c) => Math.abs(c.amount - row.expected!) < 0.011) : undefined;
    if (hit) applyCandidate(row, hit);
    else if (row.expected == null) unresolved.push({ row, cands });
  }
  if (total === null || unresolved.length === 0) return;
  const sum = () => roundMoney(raws.reduce((s, r) => s + r.amount, 0));
  if (sum() === total) return;
  const picked: number[] = unresolved.map(() => -1);
  const search = (i: number): boolean => {
    if (i === unresolved.length) return sum() === total;
    for (const idx of [-1, ...unresolved[i].cands.keys()]) {
      const u = unresolved[i];
      const before = { amount: u.row.amount, label: u.row.label };
      if (idx >= 0) applyCandidate(u.row, u.cands[idx]);
      picked[i] = idx;
      if (search(i + 1)) return true;
      u.row.amount = before.amount;
      u.row.label = before.label;
    }
    return false;
  };
  if (unresolved.length <= 6) search(0);
}

function parse(text: string): PdfParseOutcome {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const warnings: string[] = [];

  const title = lines.map((l) => TITLE.exec(l)).find(Boolean) ?? null;
  const periodEnd = title ? isoDate(Number(title[3]), Number(title[2]), Number(title[1])) : null;

  const parent = lines.map((l) => PARENT.exec(l)).find(Boolean)?.[1];
  let card: string | null = null;
  const totals: number[] = [];
  type Raw = GluedRow & { date: string; extra: string[]; originAmount?: number; rate?: number };
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
      const last = raws[raws.length - 1];
      last.extra.push(origin ? `origin ${origin[1]}` : `rate ${rate![1]}`);
      if (origin) last.originAmount = originNumber(origin[1]) ?? undefined;
      if (rate) last.rate = Number(rate[1].replace(",", "."));
      if (last.originAmount != null && last.rate) last.expected = roundMoney(last.originAmount / last.rate);
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
      raws.push({ date, label, amount, amountRaw: m[5], extra: [], expected: null });
    }
  }

  const total = totals.length > 0 ? totals[totals.length - 1] : null;
  repairGluedAmounts(raws, total);
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
              ...(parent ? { parentRef: parent } : {}),
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
          ...(parent ? { parentRef: parent } : {}),
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
