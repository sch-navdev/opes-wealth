/**
 * HSBC UAE CREDIT CARD statement PDF profile (text layer, not password protected; the HSBC
 * current-account statements are image-only and go through `hsbc.ts` / OCR instead).
 *
 * Layout facts (pdf-parse output of real 2021-2025 statements, English with Arabic labels from
 * 2024 on):
 *  - page 1: card number, statement date (old layout "Statement Date <DD Month YYYY>" or new
 *    layout "From DD Month YY to DD Month YY"), totals; page 2 holds the "Total Outstanding on
 *    Statement Date explained" block: the labels come first, then seven amount lines in this order:
 *    previous statement balance, payments/reversals/other credits, new purchases/cash advances/
 *    other debits, finance charges/interest, fees, VAT, current statement balance. A credit
 *    balance carries a " CR" suffix (glued on the same line, or on the next line for "Opening
 *    Balance");
 *  - "Details of your transactions this month" (repeated on every page with its column headers):
 *    one block per transaction = a line "DD-Mon-YY DD-Mon-YY" (transaction date, posting date;
 *    month "Sept" occurs), description lines, money line(s), and a lone "-" (the VAT column) that
 *    closes the block. Local rows: "<original> <total>" (padded with spaces); credits/payments
 *    carry " CR" on both figures. Foreign rows add "<CCY>/AED <rate>" and "<CCY> <original> <AED>"
 *    then one line per fee ("FOREIGN CURRENCY PROCESSING FEE <fee> <vat>", "STND PROC. FEE ...
 *    <fee> <vat> <total>"): the LAST figure of the LAST money line is the row's total in AED
 *    (fees and VAT included). Fee/charge rows ("LATE CHARGE ASSESSMENT <amt> <vat> <total>",
 *    "FINANCE CHARGES") are ordinary rows; reversals of fees print CR figures;
 *  - several cards (principal + supplementary) can appear on one statement: a line with the card
 *    number then the holder name opens a sub-block. All rows belong to the one statement balance,
 *    so they are returned as ONE account (the principal card, masked);
 *  - "Opening Balance" and the summary hold the previous balance; the summary's last figure is the
 *    new balance.
 *
 * Model: a card statement shows the balance OWED. The repo's signed convention is kept (positive =
 * money in): payments and credits are positive, purchases, fees and interest negative, and the
 * opening/closing balances are the printed balances NEGATED (owed 5,000.00 -> -5,000.00; a "CR"
 * credit balance -> positive), so `reconcile` (opening + rows = closing) proves the parse. The
 * printed totals (payments; purchases + interest + fees + VAT) are a second cross-check that only
 * raises warnings. Numbers are never corrected.
 */
import { buildAccount, isoDate, moneyFields, roundMoney, sameMoney, squash } from "./shared";
import type { BankPdfProfile, PdfParseOutcome, TransactionFingerprint } from "./types";

const AMT = "\\d[\\d,]*\\.\\d{2}";
const TOKEN = `${AMT}(?:\\s*CR)?`;
const MONEY_LINE = new RegExp(`^(?:([A-Za-z].*?)\\s+)?((?:${TOKEN})(?:\\s+${TOKEN})*)\\s*$`);
const TOKEN_G = new RegExp(`(${AMT})(\\s*CR)?`, "g");
const AMOUNT_ONLY = new RegExp(`^(${AMT})(\\s*CR)?$`);
const MON = "[A-Za-z]{3,4}";
const DATE_LINE = new RegExp(`^(\\d{2}-${MON}-\\d{2})\\s+(\\d{2}-${MON}-\\d{2})$`);
const CARD_LINE = /^(\d{4}) (\d{4}) (\d{4}) (\d{4})$/;
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const NOISE =
  /^Credit Card Statement\s*$|^Page \d+ of \d+\s*$|^Details of your transactions this month|^Transaction Date\s*Posting Date|^Total Amount \(AED\)|^Original Amount|^Opening Balance/;
const END = /^Dear Customer|^Glossary|^Important Information/;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const LONG_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** "1,234.50" -> 1234.5 */
function amount(s: string): number {
  return Number(s.replace(/,/g, ""));
}

/** Owed-balance value of a printed figure: positive = owed, " CR" = credit (negative owed). */
function owed(n: string, cr: string | undefined): number {
  return cr ? -amount(n) : amount(n);
}

function shortDate(d: string): string | null {
  const [dd, mon, yy] = d.split("-");
  const m = MONTHS[mon.toLowerCase()];
  return m ? isoDate(2000 + Number(yy), m, Number(dd)) : null;
}

function longDate(day: string, month: string, year: string): string | null {
  const m = LONG_MONTHS[month.toLowerCase()];
  if (!m) return null;
  const y = Number(year);
  return isoDate(year.length === 2 ? 2000 + y : y, m, Number(day));
}

function maskCards(s: string): string {
  return s.replace(/\b(\d{4})[ -](\d{4})[ -](\d{4})[ -](\d{4})\b/g, "•••• •••• •••• $4");
}

type MoneyLine = { prefix: string; tokens: { value: number; cr: boolean }[] };

function moneyLine(line: string): MoneyLine | null {
  const m = line.match(MONEY_LINE);
  if (!m) return null;
  const tokens = [...m[2].matchAll(TOKEN_G)].map((t) => ({ value: amount(t[1]), cr: !!t[2] }));
  return { prefix: (m[1] ?? "").trim(), tokens };
}

type Raw = { date: string; posted: string; desc: string[]; money: MoneyLine[] };

type Summary = {
  previous: number;
  payments: number;
  purchases: number;
  interest: number;
  fees: number;
  vat: number;
  closing: number;
};

/** The seven amount lines after "Total Outstanding on Statement Date explained". */
function readSummary(lines: string[]): Summary | null {
  const start = lines.findIndex((l) => /^Total Outstanding on Statement Date explained/.test(l));
  if (start < 0) return null;
  const vals: number[] = [];
  for (let i = start + 1; i < lines.length && vals.length < 7; i++) {
    if (/^Page \d+ of \d+/.test(lines[i]) && vals.length > 0) break;
    const m = lines[i].match(AMOUNT_ONLY);
    if (m) vals.push(owed(m[1], m[2]));
  }
  if (vals.length < 7) return null;
  const [previous, payments, purchases, interest, fees, vat, closing] = vals;
  return { previous, payments, purchases, interest, fees, vat, closing };
}

function parse(text: string): PdfParseOutcome {
  // A CR flag printed alone on the next line belongs to the figure before it.
  const joined = text.replace(/\r\n/g, "\n").replace(new RegExp(`(${AMT})[ \\t]*\\n[ \\t]*CR[ \\t]*(?=\\n)`, "g"), "$1 CR");
  const lines = joined.split("\n").map((l) => l.trim());
  const warnings: string[] = [];

  const cardNo = text.match(/Credit Card Number\s*\n?\s*(\d{4})[ -](\d{4})[ -](\d{4})[ -](\d{4})/);
  const accountRef = cardNo ? `${cardNo[1]}${cardNo[2].slice(0, 2)}******${cardNo[4]}` : "";

  // Statement period: "From 03 February 25 to 02 March 25" (new) or "Statement Date" + date (old).
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  const range = joined.match(/From\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})\s+to\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})/);
  if (range) {
    periodStart = longDate(range[1], range[2], range[3]);
    periodEnd = longDate(range[4], range[5], range[6]);
  } else {
    const at = lines.findIndex((l) => /Statement Date/.test(l) && /Payment Due Date/.test(l));
    for (let i = at; at >= 0 && i < Math.min(lines.length, at + 6); i++) {
      const d = lines[i].match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
      if (d) {
        periodEnd = longDate(d[1], d[2], d[3]);
        break;
      }
    }
  }

  const summary = readSummary(lines);
  const openLine = lines.findIndex((l) => /^Opening Balance\s*$/.test(l));
  let openingOwed: number | null = null;
  if (openLine >= 0) {
    for (let i = openLine + 1; i < Math.min(lines.length, openLine + 3); i++) {
      const m = lines[i].match(AMOUNT_ONLY);
      if (m) {
        openingOwed = owed(m[1], m[2]);
        break;
      }
    }
  }
  if (summary && openingOwed !== null && !sameMoney(summary.previous, openingOwed)) {
    warnings.push("The statement's Opening Balance line differs from the previous balance in its summary.");
  }
  const previousOwed = summary ? summary.previous : openingOwed;

  // Transaction blocks.
  const first = lines.findIndex((l) => /^Details of your transactions this month/.test(l));
  const raws: Raw[] = [];
  let cur: Raw | null = null;
  let skipHolder = false;
  const close = () => {
    if (cur) raws.push(cur);
    cur = null;
  };
  for (let i = first < 0 ? lines.length : first; i < lines.length; i++) {
    const line = lines[i];
    if (END.test(line)) {
      close();
      break;
    }
    if (line === "" || ARABIC.test(line) || NOISE.test(line)) continue;
    const dl = line.match(DATE_LINE);
    if (dl) {
      close();
      skipHolder = false;
      cur = { date: dl[1], posted: dl[2], desc: [], money: [] };
      continue;
    }
    if (CARD_LINE.test(line)) {
      close();
      skipHolder = true;
      continue;
    }
    if (skipHolder) {
      skipHolder = false;
      continue; // card holder name under a card number
    }
    if (!cur) continue;
    if (line === "-") {
      close();
      continue;
    }
    const ml = moneyLine(line);
    if (ml) cur.money.push(ml);
    else cur.desc.push(line);
  }
  close();

  if (raws.length === 0) {
    if (summary && sameMoney(summary.previous, summary.closing) && sameMoney(summary.payments, 0) && sameMoney(summary.purchases, 0)) {
      warnings.push("This statement has no transactions.");
      return {
        ok: true,
        statement: {
          bank: "hsbc_uae_card",
          bankName: "HSBC UAE credit card",
          warnings,
          accounts: [
            buildAccount({
              accountRef,
              currency: "AED",
              periodStart,
              periodEnd,
              openingBalance: -summary.previous || 0,
              closingBalance: -summary.closing || 0,
              transactions: [],
            }),
          ],
        },
      };
    }
    return { ok: false, failure: { code: "no_transactions", bank: "hsbc_uae_card", message: "No HSBC credit card transaction rows were found." } };
  }

  const transactions: TransactionFingerprint[] = [];
  let badRows = 0;
  // Per printed column: the bank files a row's fee lines under Fees/VAT and its base figure under Payments or Purchases.
  let basePay = 0;
  let basePurch = 0;
  let feeParts = 0;
  let dropped = 0;
  for (const r of raws) {
    const last = r.money[r.money.length - 1];
    if (!last) {
      dropped++;
      continue;
    }
    const total = last.tokens[last.tokens.length - 1];
    const signedOwed = total.cr ? -total.value : total.value;
    {
      const bt = r.money[0].tokens;
      // "<amount> <vat> <total>" on a single line is a fee/charge row: all of it is Fees/VAT.
      const feeRow = bt.length >= 3 && r.money.length === 1;
      const bl = bt[bt.length - 1];
      const bv = feeRow ? 0 : bl.cr ? -bl.value : bl.value;
      if (bv < 0) basePay += -bv;
      else basePurch += bv;
      feeParts += signedOwed - bv;
    }

    // Internal check: base figure + fee lines (fee + VAT) must equal the printed total.
    const base = r.money[0];
    if (r.money.length > 1) {
      const baseTokens = base.tokens;
      const bt = baseTokens[baseTokens.length - 1];
      let expected = bt.cr ? -bt.value : bt.value;
      r.money.slice(1).forEach((m, k) => {
        const take = k === r.money.length - 2 && m.tokens.length >= 3 ? m.tokens.slice(0, m.tokens.length - 1) : m.tokens;
        for (const t of take) expected += t.cr ? -t.value : t.value;
      });
      if (!sameMoney(expected, signedOwed)) badRows++;
    } else if (base.tokens.length === 3) {
      const [a, b, c] = base.tokens.map((t) => (t.cr ? -t.value : t.value));
      if (!sameMoney(a + b, c)) badRows++;
    }

    const rawParts = [...r.desc, ...r.money.map((m) => `${m.prefix} ${m.tokens.map((t) => t.value.toFixed(2) + (t.cr ? " CR" : "")).join(" ")}`.trim())];
    const merchant = squash(maskCards(r.desc.filter((d) => !/^[A-Z]{3}\/[A-Z]{3}\s/.test(d)).join(" ")));
    const foreign = r.money.find((m) => /^[A-Z]{3}$/.test(m.prefix));
    const description = foreign ? `${merchant} (${foreign.prefix} ${foreign.tokens[0].value.toFixed(2)})`.trim() : merchant;
    const date = shortDate(r.date);
    if (!date) {
      dropped++;
      continue;
    }
    const idx = transactions.length;
    transactions.push({
      bank: "hsbc_uae_card",
      accountRef,
      currency: "AED",
      date,
      valueDate: shortDate(r.posted),
      description,
      rawDescription: squash(maskCards(rawParts.join(" "))),
      ...moneyFields(-signedOwed),
      balance: null,
      reference: null,
      index: idx,
    });
  }

  if (dropped > 0) warnings.push(`${dropped} transaction block(s) could not be read and were skipped.`);
  if (badRows > 0) warnings.push(`${badRows} transaction(s) whose fee lines do not add up to the printed total.`);
  if (!summary) warnings.push("The statement summary (previous and current balance) was not found: the parse cannot be verified.");

  let opening: number | null = previousOwed === null ? null : roundMoney(-previousOwed);
  if (opening !== null && Object.is(opening, -0)) opening = 0;
  const closing = summary ? roundMoney(-summary.closing) : null;

  if (summary) {
    if (!sameMoney(roundMoney(basePay), summary.payments)) {
      warnings.push("The statement's printed total of payments and credits does not match the parsed rows.");
    }
    if (!sameMoney(roundMoney(basePurch), summary.purchases + summary.interest)) {
      warnings.push("The statement's printed total of purchases and interest does not match the parsed rows.");
    }
    if (!sameMoney(roundMoney(feeParts), summary.fees + summary.vat)) {
      warnings.push("The statement's printed total of fees and VAT does not match the parsed rows.");
    }
  }

  return {
    ok: true,
    statement: {
      bank: "hsbc_uae_card",
      bankName: "HSBC UAE credit card",
      warnings,
      accounts: [
        buildAccount({
          accountRef,
          currency: "AED",
          periodStart,
          periodEnd,
          openingBalance: opening,
          closingBalance: closing,
          transactions,
        }),
      ],
    },
  };
}

export const hsbcCardProfile: BankPdfProfile = {
  id: "hsbc_uae_card",
  name: "HSBC UAE credit card",
  detect(text) {
    return (
      /HSBC/i.test(text) &&
      /Credit Card Number/i.test(text) &&
      /Total Outstanding on Statement Date/i.test(text) &&
      /Details of your transactions this month/i.test(text)
    );
  },
  parse,
};
