/**
 * Wio Bank credit card statement ("CREDIT STATEMENT", text layer).
 *
 * Layout facts (pdf-parse output of real 2026 statements):
 *  - "CREDIT STATEMENT", "FROM  TO dd/mm/yyyydd/mm/yyyy" (the two dates glued), "ACCOUNT NUMBER <digits>": the
 *    credit account, stable while the card numbers on the rows may change;
 *  - an "Account summary" block (it can sit in the middle of the transaction pages): balance from last statement,
 *    purchases, interest, fees, payments and credits, closing balance (total to pay). Some statements print each
 *    figure BEFORE its label, so both orders are read;
 *  - rows "dd/mm/yyyyP<reference><description>" with an optional "Rate: ..." line (foreign purchases) and the
 *    amount on the last line: "****<card><signed amount>" for purchases and fees, "<description>+<amount>" for
 *    repayments. The printed sign is already the cash effect: "-" is money spent, "+" is a payment in.
 *
 * Model: repo convention (positive = money in). The card balance is MINUS what is owed: opening = -balance from the
 * last statement, closing = -closing balance, so `reconcile` (opening + rows = closing) proves the parse. Rows that
 * cannot be read are counted and warned about, never guessed.
 */
import { buildAccount, isoDate, moneyFields, roundMoney, squash } from "./shared";
import type { BankPdfProfile, PdfParseOutcome, TransactionFingerprint } from "./types";

const NUM = "[+-]?\\d{1,3}(?:,\\d{3})*\\.\\d{2}|[+-]?\\d+\\.\\d{2}";
const ROW_START = /^(\d{2})\/(\d{2})\/(\d{4})(P\d+)(.*)$/;
const AMOUNT_END = new RegExp(`^(.*?)(?:\\*{4}\\d{4})?([+-]\\d{1,3}(?:,\\d{3})*\\.\\d{2}|[+-]\\d+\\.\\d{2})$`);
const PERIOD = /FROM\s*TO\s*(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2})\/(\d{2})\/(\d{4})/;
const ACCOUNT = /ACCOUNT NUMBER\s*(\d{6,})/;

function money(s: string): number {
  return Number(s.replace(/[+,]/g, ""));
}

/** A summary figure printed after its label ("Label0.00") or before it ("0.00Label"). */
function summaryFigure(text: string, label: string): number | null {
  const after = new RegExp(`${label}\\s*(${NUM})`, "i").exec(text);
  if (after) return money(after[1]);
  const before = new RegExp(`(${NUM})\\s*${label}`, "i").exec(text);
  return before ? money(before[1]) : null;
}

export function isWioCardStatement(text: string): boolean {
  return /CREDIT STATEMENT/.test(text) && /Wio/i.test(text) && /Account summary/i.test(text);
}

function parse(text: string): PdfParseOutcome {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const warnings: string[] = [];

  const period = PERIOD.exec(text);
  const periodStart = period ? isoDate(Number(period[3]), Number(period[2]), Number(period[1])) : null;
  const periodEnd = period ? isoDate(Number(period[6]), Number(period[5]), Number(period[4])) : null;
  const accountRef = ACCOUNT.exec(text)?.[1] ?? "";
  const owedBefore = summaryFigure(text, "Balance from last statement");
  const owedAfter = summaryFigure(text, "Closing balance \\(Total to pay\\)");

  type Raw = { date: string; ref: string; label: string; extra: string[]; amount: number };
  const raws: Raw[] = [];
  let badRows = 0;
  let open: { date: string; ref: string; label: string; extra: string[] } | null = null;

  const finish = (head: string, amountText: string) => {
    if (!open) return;
    const label = squash([open.label, head].filter(Boolean).join(" "));
    raws.push({ date: open.date, ref: open.ref, label, extra: open.extra, amount: money(amountText) });
    open = null;
  };

  for (const line of lines) {
    if (!line) continue;
    const start = ROW_START.exec(line);
    if (start) {
      if (open) badRows++; // the previous row never got its amount
      const date = isoDate(Number(start[3]), Number(start[2]), Number(start[1]));
      if (!date) {
        badRows++;
        open = null;
        continue;
      }
      open = { date, ref: start[4], label: "", extra: [] };
      const rest = start[5];
      const end = AMOUNT_END.exec(rest);
      if (end) {
        open.label = squash(end[1]);
        finish("", end[2]);
      } else {
        open.label = squash(rest);
      }
      continue;
    }
    if (!open) continue;
    if (/^Rate\s*:/i.test(line)) {
      open.extra.push(line);
      continue;
    }
    const end = AMOUNT_END.exec(line);
    if (end && /^(\*{4}\d{4})?[+-]/.test(line.slice(end[1].length))) {
      finish(squash(end[1]), end[2]);
      continue;
    }
    // Page furniture between a row start and its amount means the row could not be completed.
    if (/Wio, PJSC|Page\s+of|Standard Terms|DateRef/i.test(line)) {
      badRows++;
      open = null;
    }
  }
  if (open) badRows++;

  const opening = owedBefore === null ? null : roundMoney(-owedBefore);
  const closing = owedAfter === null ? null : roundMoney(-owedAfter);

  if (raws.length === 0) {
    if (closing === 0 && opening === 0) {
      warnings.push("This statement has no transactions.");
      return {
        ok: true,
        statement: { bank: "wio_card", bankName: "Wio Bank credit card", warnings, accounts: [buildAccount({ accountRef, currency: "AED", periodStart, periodEnd, openingBalance: 0, closingBalance: 0, transactions: [] })] },
      };
    }
    return { ok: false, failure: { code: "no_transactions", bank: "wio_card", message: "No Wio credit card transaction rows were found." } };
  }

  const transactions: TransactionFingerprint[] = raws.map((r, i) => ({
    bank: "wio_card",
    accountRef,
    currency: "AED",
    date: r.date,
    valueDate: null,
    description: r.label,
    rawDescription: squash([r.label, ...r.extra].join(" ")),
    ...moneyFields(r.amount),
    balance: null,
    reference: r.ref,
    index: i,
  }));

  if (badRows > 0) warnings.push(`${badRows} transaction line(s) could not be read and were skipped.`);
  if (opening === null || closing === null) warnings.push("The statement balances were not found: the parse cannot be verified.");

  return {
    ok: true,
    statement: {
      bank: "wio_card",
      bankName: "Wio Bank credit card",
      warnings,
      accounts: [buildAccount({ accountRef, currency: "AED", periodStart, periodEnd, openingBalance: opening, closingBalance: closing, transactions })],
    },
  };
}

export const wioCardProfile: BankPdfProfile = {
  id: "wio_card",
  name: "Wio Bank credit card",
  detect: isWioCardStatement,
  parse,
};
