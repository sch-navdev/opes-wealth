/**
 * FAB (First Abu Dhabi Bank) CREDIT CARD statement PDF profile (text layer, not password
 * protected). The account statements (AccountEStatement) are a different layout handled by `fab.ts`.
 *
 * Layout facts (pdf-parse output of real 2023-2026 statements; the bilingual labels are partly
 * font-encoded gibberish, but the English labels and every figure are plain text):
 *  - page 1 (a block of English labels first, then the values): a header line "<card product>
 *    <statement date DD-MM-YYYY> <payment due date DD-MM-YYYY>"; a card line "NNNN NN** **** NNNN
 *    <current balance> <minimum due>" (already masked by the bank; repeated on every page, a credit
 *    balance carries a glued "CR"); a SIX-figure summary line in label order Previous Balance,
 *    + Purchases/Debits, + Cash Advances, + Finance Charges, - Payments/Credits, Total Payment Due
 *    (the last is the new balance; "CR" glued when it is a credit); a credit-limit line (2 figures);
 *  - transactions (header repeated on every page): "DD-MM-YYYY DD-MM-YYYY <merchant> <city> <country>
 *    <CCY> <original amount> <amount in AED>". Debits print both amounts close together; CREDITS
 *    (payments, refunds, reward redemptions) leave a wide gap before the AED figure (it sits in the
 *    Credit column). Foreign rows show the original currency amount (decimal point or comma, 2 or 3
 *    decimals) and the AED amount; the bank's "VAT ON SERVICE CHARGES" and fee lines are ordinary rows
 *    with their own AED figure. A payment can carry an indented continuation line ("Payment of AED
 *    ... received on ...");
 *  - one section per card (principal "Main Card : ..." and "Supplementary Card : ..." lines followed by
 *    the holder name), each closed by "Total <debits> <credits>"; the summary covers all cards, so all
 *    rows are returned as ONE account (the first card, masked). The summary's Payments figure can
 *    exclude reward credits that the Total rows include, so the Total rows (sum over the sections),
 *    not the summary, are the cross-check for the credit side.
 *
 * Model: a card statement shows the balance OWED. The repo's signed convention is kept (positive =
 * money in): payments and credits positive, purchases, fees and interest negative, and the opening
 * and closing balances are the printed balances NEGATED (owed 5,000.00 -> -5,000.00; "CR" -> positive),
 * so `reconcile` (opening + rows = closing) proves the parse. Printed totals only raise warnings.
 * Numbers are never corrected.
 */
import { buildAccount, isoDate, moneyFields, roundMoney, sameMoney, squash } from "./shared";
import type { BankPdfProfile, PdfParseOutcome, TransactionFingerprint } from "./types";

const AMT = "\\d[\\d,]*\\.\\d{2}";
const FIG = `${AMT}(?:\\s*CR)?`;
const FIG_G = new RegExp(`(${AMT})(\\s*CR)?`, "g");
const DATE = "(\\d{2})-(\\d{2})-(\\d{4})";
const ROW = new RegExp(`^${DATE}\\s+${DATE}\\s+(.*?)\\s+([A-Z]{3})(\\s+)(-?[\\d.,]*\\d)(\\s+)(-?${AMT})(?:\\s*(CR))?\\s*$`);
const DATE_START = new RegExp(`^${DATE}\\s+${DATE}\\s`);
const SUMMARY = new RegExp(`^\\s*(${FIG})\\s+(${FIG})\\s+(${FIG})\\s+(${FIG})\\s+(${FIG})\\s+(${FIG})\\s*$`);
const CARD_LINE = new RegExp(`^(\\d{4} \\d{2}[\\d*]{2} [\\d*]{4} \\d{4})\\s+(${FIG})\\s+(${FIG})\\s*$`);
const HEADER_LINE = new RegExp(`^\\S.*?\\s${DATE}\\s+${DATE}\\s*$`);
const TOTAL_LINE = new RegExp(`^Total\\s+(${AMT})\\s+(${AMT})\\s*$`);
/** Credits leave a wide blank gap between the original and the AED figure. */
const CREDIT_GAP = 15;

function amount(s: string): number {
  return Number(s.replace(/,/g, ""));
}

/** Owed-balance value of a printed figure: positive = owed, " CR" = credit (negative owed). */
function owed(n: string, cr: string | undefined): number {
  return cr ? -amount(n) : amount(n);
}

function figures(s: string): number[] {
  return [...s.matchAll(FIG_G)].map((m) => owed(m[1], m[2]));
}

function maskCards(s: string): string {
  return s.replace(/\b\d{4}[ -]?\d{2}[\d*]{2}[ -]?[\d*]{4}[ -]?(\d{4})\b/g, "•••• •••• •••• $1");
}

function dmy(d: string, m: string, y: string): string | null {
  return isoDate(Number(y), Number(m), Number(d));
}

type Row = { tx: TransactionFingerprint; credit: boolean };

function parse(text: string): PdfParseOutcome {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  const warnings: string[] = [];

  let accountRef = "";
  let periodEnd: string | null = null;
  let summary: number[] | null = null;
  let currentBalance: number | null = null;
  for (const raw of rawLines) {
    const line = raw.trim();
    if (!accountRef) {
      const c = line.match(CARD_LINE);
      if (c) {
        accountRef = c[1].replace(/ /g, "");
        currentBalance = figures(c[2])[0];
      }
    }
    if (!summary && SUMMARY.test(line)) summary = figures(line);
    if (!periodEnd && !DATE_START.test(line)) {
      const h = line.match(HEADER_LINE);
      if (h) periodEnd = dmy(h[1], h[2], h[3]);
    }
  }
  if (summary && summary.length !== 6) summary = null;

  const rows: Row[] = [];
  const totals: { debit: number; credit: number }[] = [];
  let dropped = 0;
  let aedMismatch = 0;
  for (const raw of rawLines) {
    const line = raw.trim();
    const tot = line.match(TOTAL_LINE);
    if (tot) {
      totals.push({ debit: amount(tot[1]), credit: amount(tot[2]) });
      continue;
    }
    if (DATE_START.test(line)) {
      const m = line.match(ROW);
      const date = m ? dmy(m[1], m[2], m[3]) : null;
      if (!m || !date) {
        dropped++;
        continue;
      }
      const posted = dmy(m[4], m[5], m[6]);
      const ccy = m[8];
      const orig = m[10].replace(/^(-?)([.,])/, "$10$2");
      const gap = m[11].length;
      const printed = m[12];
      const total = amount(printed.replace("-", ""));
      const isCredit = gap >= CREDIT_GAP || !!m[13] || printed.startsWith("-");
      if (ccy === "AED" && !sameMoney(amount(orig), total)) aedMismatch++;

      const parts = m[7].split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
      if (parts.length > 1 && /^[A-Z]{2,3}$/.test(parts[parts.length - 1])) parts.pop();
      const merchant = squash(maskCards(parts.join(" ")));
      const description = ccy === "AED" ? merchant : `${merchant} (${ccy} ${orig})`;
      const idx = rows.length;
      rows.push({
        credit: isCredit,
        tx: {
          bank: "fab_card",
          accountRef,
          currency: "AED",
          date,
          valueDate: posted,
          description,
          rawDescription: squash(maskCards(line.replace(/^\d{2}-\d{2}-\d{4}\s+\d{2}-\d{2}-\d{4}\s+/, ""))),
          ...moneyFields(isCredit ? total : -total),
          balance: null,
          reference: null,
          index: idx,
        },
      });
      continue;
    }
    // Indented continuation of the previous row (payment allocation note): kept in rawDescription only.
    if (rows.length > 0 && /^ {8,}\S/.test(raw) && /^(?:[A-Za-z]|\d{2}-\d{2}-\d{4}\s+[A-Za-z])/.test(line) && !/^Total\b/.test(line)) {
      const tx = rows[rows.length - 1].tx;
      tx.rawDescription = squash(`${tx.rawDescription} ${maskCards(line)}`);
    }
  }

  const previousOwed = summary ? summary[0] : null;
  const closingOwed = summary ? summary[5] : currentBalance;
  const opening = previousOwed === null ? null : roundMoney(-previousOwed) || 0;
  const closing = closingOwed === null ? null : roundMoney(-closingOwed) || 0;

  if (rows.length === 0) {
    const zeroTotals = totals.every((t) => sameMoney(t.debit, 0) && sameMoney(t.credit, 0));
    if (summary && dropped === 0 && sameMoney(summary[0], summary[5]) && zeroTotals && [1, 2, 3, 4].every((i) => sameMoney(summary![i], 0))) {
      warnings.push("This statement has no transactions.");
      return {
        ok: true,
        statement: {
          bank: "fab_card",
          bankName: "First Abu Dhabi Bank credit card",
          warnings,
          accounts: [
            buildAccount({ accountRef, currency: "AED", periodStart: null, periodEnd, openingBalance: opening, closingBalance: closing, transactions: [] }),
          ],
        },
      };
    }
    return { ok: false, failure: { code: "no_transactions", bank: "fab_card", message: "No FAB credit card transaction rows were found." } };
  }

  if (dropped > 0) warnings.push(`${dropped} transaction line(s) could not be read and were skipped.`);
  if (aedMismatch > 0) warnings.push(`${aedMismatch} AED transaction(s) whose original and AED amounts differ.`);
  if (!summary) warnings.push("The statement summary (previous balance and total payment due) was not found: the parse cannot be verified.");
  if (summary && currentBalance !== null && !sameMoney(currentBalance, summary[5])) {
    warnings.push("The statement's current balance differs from the total payment due in its summary.");
  }

  const debits = roundMoney(rows.filter((r) => !r.credit).reduce((s, r) => s + r.tx.debit!, 0));
  const credits = roundMoney(rows.filter((r) => r.credit).reduce((s, r) => s + r.tx.credit!, 0));
  if (totals.length > 0) {
    const td = roundMoney(totals.reduce((s, t) => s + t.debit, 0));
    const tc = roundMoney(totals.reduce((s, t) => s + t.credit, 0));
    if (!sameMoney(debits, td)) warnings.push("The statement's printed total of debits does not match the parsed rows.");
    if (!sameMoney(credits, tc)) warnings.push("The statement's printed total of credits does not match the parsed rows.");
  } else {
    warnings.push("The statement's Total line was not found: debit and credit totals could not be checked.");
  }
  if (summary && !sameMoney(debits, roundMoney(summary[1] + summary[2] + summary[3]))) {
    warnings.push("The statement's printed purchases, cash advances and finance charges do not match the parsed debits.");
  }

  return {
    ok: true,
    statement: {
      bank: "fab_card",
      bankName: "First Abu Dhabi Bank credit card",
      warnings,
      accounts: [
        buildAccount({
          accountRef,
          currency: "AED",
          periodStart: null,
          periodEnd,
          openingBalance: opening,
          closingBalance: closing,
          transactions: rows.map((r) => r.tx),
        }),
      ],
    },
  };
}

export const fabCardProfile: BankPdfProfile = {
  id: "fab_card",
  name: "First Abu Dhabi Bank credit card",
  detect(text) {
    return (
      /Main Card Number/.test(text) &&
      /Summary Details/.test(text) &&
      /Total Payment Due/.test(text) &&
      /Available Credit Limit/.test(text) &&
      (/\bFAB\b/.test(text) || /First\s+Abu\s+Dhabi\s+Bank/i.test(text) || /bankfab/i.test(text))
    );
  },
  parse,
};
