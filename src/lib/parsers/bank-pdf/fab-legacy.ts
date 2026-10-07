/**
 * Pre-2019 account statements of the bank that became First Abu Dhabi Bank (FAB) in 2017
 * (the "current accounts retail" layout, printed until late 2018).
 *
 * Layout facts (pdf-parse output):
 *  - the column headings come out garbled (non-ASCII glyphs), so detection relies on the two
 *    dated marker lines `DDMonYY BALANCE BROUGHT FORWARD <bal>` and `DDMonYY CLOSING BALANCE <bal>`;
 *  - header values (branch, account number, IBAN as `AE51 0350 ...`, currency name, period
 *    `01-Aug-2018 to 30-Aug-2018`) sit on their own lines after the garbled headings;
 *  - every transaction line is `DDMonYY  DDMonYY  description  amount  balance` (booking date
 *    and value date with two-digit years and no spaces); the amount is printed in either the
 *    Deposits or the Withdrawals column, so, as in the current FAB layout, the SIGN is inferred
 *    from the running balance and checked against the printed amount to the cent;
 *  - a balance marked `DR` (before or after the figure) is overdrawn (negative);
 *  - description continuation lines are indented and carry no amounts;
 *  - a `Summary` line prints the total deposits and total withdrawals.
 */
import { buildAccount, EN_MONTHS, isoDate, moneyFields, roundMoney, sameMoney, squash } from "./shared";
import type { PdfParseOutcome, TransactionFingerprint } from "./types";

const AMT = "\\d[\\d,]*\\.\\d{2}";
const MARK_DATE = "\\d{2}[A-Za-z]{3}\\d{2}";
const OPEN_RE = new RegExp(`^\\s*${MARK_DATE}\\s+BALANCE BROUGHT FORWARD\\s+(?:(DR)\\s*)?(${AMT})(?:\\s*(DR))?\\s*$`, "im");
const CLOSE_RE = new RegExp(`^\\s*${MARK_DATE}\\s+CLOSING BALANCE\\s+(?:(DR)\\s*)?(${AMT})(?:\\s*(DR))?\\s*$`, "im");
const ROW_RE = /^\s*(\d{2})([A-Za-z]{3})(\d{2})\s+(\d{2})([A-Za-z]{3})(\d{2})\s+(.*)$/;
const ROW_AMOUNTS = new RegExp(`^(.*?)\\s+(${AMT})\\s+(?:(DR)\\s*)?(${AMT})(?:\\s*(DR))?\\s*$`);

function num(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function legacyDate(d: string, mon: string, yy: string): string | null {
  const m = EN_MONTHS[mon.toLowerCase()];
  return m ? isoDate(2000 + Number(yy), m, Number(d)) : null;
}

/** True for the pre-2019 layout (works on the whole extracted text). */
export function isFabLegacyStatement(text: string): boolean {
  return OPEN_RE.test(text) && CLOSE_RE.test(text) && /\bAE\d{2}[ \d]{18,40}\b/.test(text);
}

type Raw = { date: string | null; valueDate: string | null; fragments: string[]; amount: number | null; balance: number | null };

export function parseFabLegacy(text: string): PdfParseOutcome {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/);

  const openM = OPEN_RE.exec(text);
  const closeM = CLOSE_RE.exec(text);
  const openingBalance = openM ? roundMoney(openM[1] || openM[3] ? -num(openM[2]) : num(openM[2])) : null;
  const closingBalance = closeM ? roundMoney(closeM[1] || closeM[3] ? -num(closeM[2]) : num(closeM[2])) : null;

  const ibanM = /^\s*(AE\d{2}(?: ?\d{3,4}){4,6})\s*$/m.exec(text);
  const accountRef = ibanM ? ibanM[1].replace(/\s+/g, "") : "";
  const currency = /^\s*UAE Dirham\b/im.test(text) ? "AED" : /^\s*(?:US|United States) Dollar\b/im.test(text) ? "USD" : "AED";
  const per = /(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4})/.exec(text);
  const periodStart = per ? legacyDate(per[1], per[2], per[3].slice(2)) : null;
  const periodEnd = per ? legacyDate(per[4], per[5], per[6].slice(2)) : null;

  // --- raw rows: between the brought-forward and closing-balance lines -------------------------
  const rows: Raw[] = [];
  let current: Raw | null = null;
  let inBody = false;
  for (const line of lines) {
    if (!inBody) {
      if (OPEN_RE.test(line)) inBody = true;
      continue;
    }
    if (CLOSE_RE.test(line)) break;
    const m = ROW_RE.exec(line);
    if (m) {
      const row: Raw = {
        date: legacyDate(m[1], m[2], m[3]),
        valueDate: legacyDate(m[4], m[5], m[6]),
        fragments: [],
        amount: null,
        balance: null,
      };
      rows.push(row);
      current = row;
      feed(row, m[7]);
      continue;
    }
    if (current && line.trim()) feed(current, line);
  }

  function feed(row: Raw, content: string) {
    if (row.amount === null) {
      const a = ROW_AMOUNTS.exec(content);
      if (a) {
        if (a[1].trim()) row.fragments.push(a[1]);
        row.amount = num(a[2]);
        row.balance = roundMoney(a[3] || a[5] ? -num(a[4]) : num(a[4]));
        return;
      }
    }
    if (content.trim()) row.fragments.push(content);
  }

  // --- sign inference ------------------------------------------------------------------------
  const transactions: TransactionFingerprint[] = [];
  let previous: number | null = openingBalance;
  if (openingBalance === null) warnings.push("Opening balance not found; the first row's sign cannot be verified.");
  for (const row of rows) {
    if (row.amount === null || row.balance === null || row.date === null) {
      warnings.push(`Skipped an incomplete transaction row near position ${transactions.length}.`);
      continue;
    }
    const index = transactions.length;
    const abs = roundMoney(Math.abs(row.amount));
    let signed = -abs;
    if (previous !== null) {
      const delta = roundMoney(row.balance - previous);
      signed = delta < 0 ? -abs : abs;
      if (!sameMoney(Math.abs(delta), abs)) warnings.push(`Row ${index}: running balance movement does not equal the printed amount.`);
    }
    const joined = squash(row.fragments.map((f) => f.trim()).filter(Boolean).join(" "));
    transactions.push({
      bank: "fab",
      accountRef,
      currency,
      date: row.date,
      valueDate: row.valueDate,
      description: squash((row.fragments[0] ?? joined).trim()),
      rawDescription: joined,
      ...moneyFields(signed),
      balance: row.balance,
      reference: joined.match(/\btxn\.ref\.no:\s*([A-Za-z0-9]+)/i)?.[1] ?? null,
      index,
    });
    previous = row.balance;
  }

  if (transactions.length === 0) {
    if (openingBalance !== null && closingBalance !== null && sameMoney(openingBalance, closingBalance)) {
      warnings.push("This statement has no transactions.");
      return {
        ok: true,
        statement: {
          bank: "fab",
          bankName: "First Abu Dhabi Bank (FAB)",
          accounts: [buildAccount({ accountRef, currency, periodStart, periodEnd, openingBalance, closingBalance, transactions: [] })],
          warnings,
        },
      };
    }
    return {
      ok: false,
      failure: { code: "no_transactions", bank: "fab", message: "FAB statement recognised but no transaction rows were found." },
    };
  }

  // --- printed totals cross-check (Summary line: total deposits, total withdrawals) ---------
  const sumLine = lines.find((l) => /^\s*Summary/i.test(l));
  const sumAmts = sumLine ? [...sumLine.matchAll(new RegExp(AMT, "g"))].map((x) => num(x[0])) : [];
  if (sumAmts.length >= 2) {
    const credits = roundMoney(transactions.reduce((s, t) => s + (t.credit ?? 0), 0));
    const debits = roundMoney(transactions.reduce((s, t) => s + (t.debit ?? 0), 0));
    if (!sameMoney(credits, sumAmts[0])) warnings.push("Printed deposit total does not match the parsed rows.");
    if (!sameMoney(debits, sumAmts[1])) warnings.push("Printed withdrawal total does not match the parsed rows.");
  }

  const account = buildAccount({ accountRef, currency, periodStart, periodEnd, openingBalance, closingBalance, transactions });
  if (account.reconciliation.status === "mismatch") warnings.push("Reconciliation mismatch: opening + movements does not equal the closing balance.");
  return { ok: true, statement: { bank: "fab", bankName: "First Abu Dhabi Bank (FAB)", accounts: [account], warnings } };
}
