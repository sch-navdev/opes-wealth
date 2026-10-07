/**
 * Commercial Bank of Dubai (CBD) account-statement PDF profile (text layer; the file is usually
 * password protected, see `pdf-text.ts`).
 *
 * Layout facts (pdf-parse output of a real Nov 2025 statement, bilingual EN/AR):
 *  - header: "Statement of Account : <acct>", "Period :DD/MM/YYYY - DD/MM/YYYY", an IBAN glued to
 *    Arabic labels, "Currency<name> - AED", and "Balance Brought FWD<opening>";
 *  - a row is either ONE line `DD/MM/YYYY<description>DD/MM/YYYY<amount><balance>` or a bare
 *    `DD/MM/YYYY` line, then description lines, then `DD/MM/YYYY<amount><balance>` (value date,
 *    amount and balance are glued together with NO separator, e.g. "03/11/20251.0552,631.63");
 *  - there is no debit/credit marker in the text, so the SIGN comes from the running balance
 *    (balance - previous balance), checked against the printed amount to the cent;
 *  - page footers/headers (English and Arabic) repeat on every page and are dropped;
 *  - the closing line is "TURN OVER :<total debits><total credits>" (also glued): used as an
 *    independent check on top of the opening + movements = last balance reconciliation.
 *
 * Only the November 2025 statement (text layer) was available; the Aug/Sep 2025 files of the same
 * account are images (no text layer) and go through OCR instead.
 */
import { buildAccount, isoDate, moneyFields, roundMoney, sameMoney, squash } from "./shared";
import type { BankPdfProfile, PdfParseOutcome, TransactionFingerprint } from "./types";

const AMT = "\\d{1,3}(?:,\\d{3})*\\.\\d{2}";
/** Balances are printed with a trailing minus when overdrawn ("1,111.54-"). */
const BAL = `${AMT}-?`;
const DATE = "\\d{2}/\\d{2}/\\d{4}";
const BARE_DATE = new RegExp(`^(${DATE})$`);
/** value date + amount + balance, glued: used to close a multi-line row. */
const TAIL_ONLY = new RegExp(`^(${DATE})(${AMT})(${BAL})$`);
/** whole row on one line. */
const FULL_ROW = new RegExp(`^(${DATE})(.*?)(${DATE})(${AMT})(${BAL})$`);
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const NOISE =
  /^(Date|Description|Value Date|Debit|Credit|Balance)\s*$|^For fees & charges|^details registered with|^days from the statement|^Commercial Bank of Dubai PSC|^Deira, Dubai|^customercare@|^Page \d+ of \d+$|^\*+END OF STATEMENT/;

/** "1,234.50" -> 1234.5; "1,234.50-" and "-1,234.50" -> -1234.5 (overdrawn balances). */
function num(s: string): number {
  const negative = s.startsWith("-") || s.endsWith("-");
  const n = Number(s.replace(/[,-]/g, ""));
  return negative ? -n : n;
}

function toIso(d: string): string | null {
  const [dd, mm, yyyy] = d.split("/").map(Number);
  return isoDate(yyyy, mm, dd);
}

type Raw = { date: string; valueDate: string; description: string[]; amount: number; balance: number };

function parse(text: string): PdfParseOutcome {
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim());
  const acct = text.match(/Acct\. No\.(\d{6,})/)?.[1] ?? text.match(/Statement of Account\s*:\s*(\d{6,})/)?.[1] ?? "";
  const iban = text.match(/IBAN\s*(AE\d{21})/)?.[1] ?? "";
  const period = text.match(new RegExp(`Period\\s*:\\s*(${DATE})\\s*-\\s*(${DATE})`));
  const currency = text.match(/Currency[^\n]*?-\s*([A-Z]{3})/)?.[1] ?? "AED";
  const openingMatch = text.match(new RegExp(`Balance Brought FWD\\s*(-?${BAL})`));
  const opening = openingMatch ? num(openingMatch[1]) : null;
  const turnover = text.match(new RegExp(`TURN OVER\\s*:\\s*(${AMT})(${AMT})`));

  const raws: Raw[] = [];
  let pending: { date: string; description: string[] } | null = null;
  let ended = false;
  for (const line of lines) {
    if (ended || line === "" || ARABIC.test(line) || NOISE.test(line)) {
      if (/^ITEM COUNT|^TURN OVER|^\*+END OF STATEMENT/.test(line)) ended = true;
      continue;
    }
    if (/^ITEM COUNT|^TURN OVER/.test(line)) {
      ended = true;
      continue;
    }
    const bare = line.match(BARE_DATE);
    if (bare) {
      pending = { date: bare[1], description: [] };
      continue;
    }
    if (pending) {
      const tail = line.match(TAIL_ONLY);
      if (tail) {
        raws.push({ date: pending.date, valueDate: tail[1], description: pending.description, amount: num(tail[2]), balance: num(tail[3]) });
        pending = null;
        continue;
      }
    }
    const full = line.match(FULL_ROW);
    if (full) {
      pending = null;
      raws.push({ date: full[1], valueDate: full[3], description: [full[2]], amount: num(full[4]), balance: num(full[5]) });
      continue;
    }
    // A description line of a multi-line row; ignored when no row is open (header text).
    if (pending) pending.description.push(line);
  }

  if (raws.length === 0) {
    return { ok: false, failure: { code: "no_transactions", bank: "cbd", message: "No CBD transaction rows were found." } };
  }

  const warnings: string[] = [];
  const transactions: TransactionFingerprint[] = [];
  let previous = opening;
  raws.forEach((r, index) => {
    // Sign from the balance movement; a row whose printed amount does not match the movement is
    // kept with the movement's sign and flagged by `reconcile` (never silently corrected).
    let signed: number;
    if (previous !== null) {
      const delta = roundMoney(r.balance - previous);
      signed = sameMoney(Math.abs(delta), r.amount) ? delta : delta < 0 ? -r.amount : r.amount;
    } else {
      signed = -r.amount;
      if (index === 0) warnings.push("No opening balance was found: the sign of the first rows could not be checked.");
    }
    previous = r.balance;
    const raw = squash(r.description.join(" "));
    transactions.push({
      bank: "cbd",
      accountRef: iban || acct,
      currency,
      date: toIso(r.date) ?? r.date,
      valueDate: toIso(r.valueDate),
      description: raw,
      rawDescription: raw,
      ...moneyFields(signed),
      balance: r.balance,
      reference: raw.match(/\b([A-Z]{2}\d{14,}|\d{2}OTT\d+|VO\d{10,}|IPP\d{10,})\b/)?.[1] ?? null,
      index,
    });
  });

  const closing = transactions[transactions.length - 1].balance;
  if (turnover) {
    const debits = roundMoney(transactions.reduce((s, t) => s + (t.debit ?? 0), 0));
    const credits = roundMoney(transactions.reduce((s, t) => s + (t.credit ?? 0), 0));
    if (!sameMoney(debits, num(turnover[1])) || !sameMoney(credits, num(turnover[2]))) {
      warnings.push("The statement's printed totals (turn over) do not match the parsed rows.");
    }
  }

  return {
    ok: true,
    statement: {
      bank: "cbd",
      bankName: "Commercial Bank of Dubai (CBD)",
      warnings,
      accounts: [
        buildAccount({
          accountRef: iban || acct,
          currency,
          periodStart: period ? toIso(period[1]) : null,
          periodEnd: period ? toIso(period[2]) : null,
          openingBalance: opening,
          closingBalance: closing,
          transactions,
        }),
      ],
    },
  };
}

export const cbdProfile: BankPdfProfile = {
  id: "cbd",
  name: "Commercial Bank of Dubai (CBD)",
  detect: (text) => /Commercial Bank of Dubai/i.test(text) && /Statement of Account/i.test(text),
  parse,
};
