/**
 * First Abu Dhabi Bank (FAB) account-statement PDF profile.
 *
 * Layout facts (pdf-parse flattens the table):
 *  - header block per sheet: AC-NUM, Currency, IBAN, "Account Statement FROM .. TO ..", totals,
 *    "Closing Book Balance", "Opening balance";
 *  - each transaction starts with `DD MON YYYY<spaces>DD MON YYYY` (booking + value date)
 *    immediately followed (no separator) by the description; the date pair may also sit alone
 *    on a line with the description on the next one;
 *  - the amount column is NOT split into debit/credit, so the SIGN is inferred from the running
 *    balance: sign(balance - previousBalance), checked against the printed amount to the cent;
 *  - descriptions wrap at ~41 chars (often mid-word) on indented continuation lines, and the
 *    continuation of the last row of a sheet can reappear after "Balance brought forward".
 */
import { moneyFields, buildAccount, EN_MONTHS, isoDate, roundMoney, sameMoney, squash } from "./shared";
import type { BankPdfProfile, PdfParseOutcome, TransactionFingerprint } from "./types";

const AMOUNT = "-?\\d[\\d,]*\\.\\d{2}";
const DATE_PAIR = /^\s*(\d{2}) ([A-Za-z]{3}) (\d{4})\s+(\d{2}) ([A-Za-z]{3}) (\d{4})(.*)$/;
const ROW_AMOUNTS = new RegExp(`^(.*?)\\s+(${AMOUNT})\\s+(${AMOUNT})\\s*$`);
/** Printed description column width: a fragment this long was cut by the layout, not by the text. */
const WRAP_WIDTH = 40;

function num(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function fabDate(d: string, mon: string, y: string): string | null {
  const m = EN_MONTHS[mon.toLowerCase()];
  return m ? isoDate(Number(y), m, Number(d)) : null;
}

type RawRow = {
  date: string | null;
  valueDate: string | null;
  fragments: string[];
  amount: number | null;
  balance: number | null;
};

/** Glue between wrapped fragments: mid-word cuts (fragment at the column width) re-join without a space. */
function glue(prevFragment: string, next: string): string {
  if (/^[,:;]/.test(next)) return "";
  if (prevFragment.length >= WRAP_WIDTH && /^[A-Za-z0-9]/.test(next) && /[A-Za-z0-9]$/.test(prevFragment)) return "";
  return " ";
}

function joinRow(fragments: string[]): string {
  let out = "";
  let prevFrag = "";
  for (const raw of fragments) {
    const frag = raw.trim();
    if (!frag) continue;
    out = out ? `${out}${glue(prevFrag, frag)}${frag}` : frag;
    prevFrag = frag;
  }
  return squash(out);
}

function labelOf(fragments: string[], joined: string): string {
  const comma = joined.indexOf(",");
  if (comma > 0) return squash(joined.slice(0, comma));
  const first = fragments.map((f) => f.trim()).find((f) => f);
  return squash(first ?? joined);
}

export const fabProfile: BankPdfProfile = {
  id: "fab",
  name: "First Abu Dhabi Bank (FAB)",

  detect(text) {
    const bank = /First\s+Abu\s+Dhabi\s+Bank/i.test(text) || /\bFAB\b/.test(text);
    const named = bank && (/Account Statement FROM/i.test(text) || /AC-NUM/.test(text));
    // Older statements (2018-2022) do not print the bank name: the AC-NUM + FROM/TO + IBAN block is unique to FAB.
    const anonymous = /AC-NUM/.test(text) && /Account Statement FROM/i.test(text) && /^\s*IBAN\s+AE/m.test(text);
    return named || anonymous;
  },

  parse(text): PdfParseOutcome {
    const warnings: string[] = [];
    const lines = text.split(/\r?\n/);

    const ibanMatch = text.match(/^\s*IBAN\s+([A-Z]{2}[A-Z0-9-]*)/m);
    const accountRef = ibanMatch ? ibanMatch[1].replace(/[^A-Za-z0-9]/g, "").toUpperCase() : "";
    const currency = text.match(/^\s*Currency\s*([A-Z]{3})\b/m)?.[1] ?? "AED";
    const period = text.match(/FROM\s+(\d{2}) ([A-Za-z]{3}) (\d{4})\s+TO\s+(\d{2}) ([A-Za-z]{3}) (\d{4})/);
    const periodStart = period ? fabDate(period[1], period[2], period[3]) : null;
    const periodEnd = period ? fabDate(period[4], period[5], period[6]) : null;
    const openMatch = text.match(new RegExp(`^\\s*Opening balance\\s+(${AMOUNT})`, "im"));
    const closeMatch =
      text.match(new RegExp(`^\\s*Closing Book Balance\\s+(${AMOUNT})`, "im")) ??
      text.match(new RegExp(`^\\s*Closing Statement Balance\\s+(${AMOUNT})`, "im"));
    const openingBalance = openMatch ? num(openMatch[1]) : null;
    const closingBalance = closeMatch ? num(closeMatch[1]) : null;

    // --- collect raw rows --------------------------------------------------------------
    const rows: RawRow[] = [];
    let current: RawRow | null = null; // row still open for fragments
    let seenOpening = false;

    const feed = (row: RawRow, content: string) => {
      if (row.amount === null) {
        const m = content.match(ROW_AMOUNTS);
        if (m) {
          if (m[1].trim()) row.fragments.push(m[1]);
          row.amount = num(m[2]);
          row.balance = num(m[3]);
          return;
        }
      }
      if (content.trim()) row.fragments.push(content);
    };

    for (const line of lines) {
      const t = line.trim();
      if (!seenOpening) {
        if (/^Opening balance\b/i.test(t)) seenOpening = true;
        continue;
      }
      if (/^Balance carried forward\b/i.test(t) || /^Closing Statement Balance\b/i.test(t) || /^\*{3}/.test(t)) {
        current = null;
        continue;
      }
      if (/^DATEVALUE/i.test(t)) {
        current = null;
        continue;
      }
      if (/^Balance brought forward\b/i.test(t)) {
        current = rows.length > 0 ? rows[rows.length - 1] : null;
        continue;
      }
      const m = line.match(DATE_PAIR);
      if (m) {
        const row: RawRow = {
          date: fabDate(m[1], m[2], m[3]),
          valueDate: fabDate(m[4], m[5], m[6]),
          fragments: [],
          amount: null,
          balance: null,
        };
        rows.push(row);
        current = row;
        if (m[7].trim()) feed(row, m[7]);
        continue;
      }
      if (current && t) feed(current, line);
    }

    // --- sign inference + build -------------------------------------------------------
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
      let signed = abs;
      if (previous !== null) {
        const delta = roundMoney(row.balance - previous);
        signed = delta < 0 ? -abs : abs;
        if (!sameMoney(Math.abs(delta), abs)) {
          warnings.push(`Row ${index}: running balance movement does not equal the printed amount.`);
        }
      } else {
        signed = -abs;
      }
      const joined = joinRow(row.fragments);
      const reference = joined.match(/(?:FAB|IPP) Ref:\s*([A-Za-z0-9]+)/)?.[1] ?? null;
      transactions.push({
        bank: "fab",
        accountRef,
        currency,
        date: row.date,
        valueDate: row.valueDate,
        description: labelOf(row.fragments, joined),
        rawDescription: joined,
        ...moneyFields(signed),
        balance: row.balance,
        reference,
        index,
      });
      previous = row.balance;
    }

    if (transactions.length === 0) {
      return {
        ok: false,
        failure: { code: "no_transactions", bank: "fab", message: "FAB statement recognised but no transaction rows were found." },
      };
    }

    // --- printed totals cross-check -----------------------------------------------------
    const debits = transactions.filter((t) => t.amount < 0);
    const credits = transactions.filter((t) => t.amount > 0);
    const debitSum = roundMoney(debits.reduce((s, t) => s + (t.debit ?? 0), 0));
    const creditSum = roundMoney(credits.reduce((s, t) => s + (t.credit ?? 0), 0));
    const printedDebit = text.match(new RegExp(`Tot\\. Debit Amnt\\.\\s*:\\s*(${AMOUNT})`, "i"))?.[1];
    const printedCredit = text.match(new RegExp(`Tot\\. Credit Amnt\\.\\s*:\\s*(${AMOUNT})`, "i"))?.[1];
    // FAB leaves reversed pairs (a debit cancelled by an equal credit) out of its printed totals: the same
    // surplus on both sides is that quirk, not a parse error (the running balances still chain to the cent).
    const dDiff = printedDebit === undefined ? 0 : roundMoney(debitSum - num(printedDebit));
    const cDiff = printedCredit === undefined ? 0 : roundMoney(creditSum - num(printedCredit));
    const reversalPairs = dDiff > 0 && sameMoney(dDiff, cDiff);
    const check = (label: string, printed: string | undefined, actual: number, isCount: boolean) => {
      if (printed === undefined) return;
      const p = num(printed);
      if (isCount ? p !== actual : !sameMoney(p, actual)) warnings.push(`Printed ${label} does not match the parsed rows.`);
    };
    if (!reversalPairs) {
      check("debit count", text.match(/Total Debit Txns\s*:\s*(\d+)/i)?.[1], debits.length, true);
      check("credit count", text.match(/Total Credit Txns\s*:\s*(\d+)/i)?.[1], credits.length, true);
      check("debit total", printedDebit, debitSum, false);
      check("credit total", printedCredit, creditSum, false);
    }

    const account = buildAccount({ accountRef, currency, periodStart, periodEnd, openingBalance, closingBalance, transactions });
    if (account.reconciliation.status === "mismatch") warnings.push("Reconciliation mismatch: opening + movements does not equal the closing balance.");

    return { ok: true, statement: { bank: "fab", bankName: "First Abu Dhabi Bank (FAB)", accounts: [account], warnings } };
  },
};
