/**
 * HSBC UAE "Composite Statement" OCR parser (image-only statements).
 *
 * Layout facts (from the printed pages, seen visually; NO real Textract output has been seen):
 *  - "Details of Your Accounts": one bordered block per account, titled `CURRENT ACCOUNT <no> IBAN - AE..`
 *    (also `STATEMENT SAV A/C`), then the header `Date | Transaction Details | Deposits | Withdrawals |
 *    Balance (DR=Debit)`, then the currency code above the first balance. An account can continue on the
 *    next page (header repeated, `BALANCE BROUGHT FORWARD` repeated WITHOUT a date, `BALANCE CARRIED
 *    FORWARD` at page ends): those repeats are not transactions. The FIRST B/F is the opening balance.
 *  - Dates are `DDMonYYYY` (no space), printed only on the first transaction of a date: carried forward.
 *  - A transaction is a block of description lines ENDING with a `REF <code>` line that carries the amount
 *    (Deposits or Withdrawals column) and the running balance. It can start at the bottom of one page and
 *    continue at the top of the next.
 *  - After the last transaction: `CLOSING BALANCE`, `Transaction Summary <deposits> <withdrawals>`,
 *    `Transaction Count <n> <n>`: used as an independent cross-check (warnings, never auto-correction).
 *
 * Two input routes feed the same row state machine:
 *  - geometry (`OcrPage.boxes`): visual rows are rebuilt from the boxes (see `ocr-rows.ts`) and each token is
 *    assigned to a column from the header word positions of the block (default fractions when missing);
 *  - lines only: each line is one row; amounts are read from the right end of REF / label lines.
 *
 * Signs: Deposits vs Withdrawals column when known, cross-checked against the balance movement (the
 * movement wins when it contradicts the column, with a warning); `reconcile` is the final safety net.
 */
import { buildAccount, EN_MONTHS, isoDate, moneyFields, roundMoney, sameMoney, squash } from "./shared";
import { boxesToRows, type OcrToken } from "./ocr-rows";
import type { OcrDocument, OcrPage } from "./ocr-types";
import type { PdfAccountStatement, PdfParseOutcome, PdfStatement, TransactionFingerprint } from "./types";

type Col = "dep" | "wd" | "bal";
type Num = { value: number; marker: "DR" | "CR" | null; col: Col | null };
type Row = {
  header: boolean;
  full: string;
  date: string | null;
  desc: string;
  nums: Num[];
  ints: number[];
};

type Cols = { dateEnd: number; descEnd: number; depR: number; wdR: number; balR: number };
const DEFAULT_COLS: Cols = { dateEnd: 0.165, descEnd: 0.49, depR: 0.58, wdR: 0.695, balR: 0.83 };

const CURRENCIES = new Set([
  "AED", "USD", "EUR", "GBP", "CHF", "SAR", "QAR", "KWD", "BHD", "OMR", "JPY", "CAD", "AUD", "SGD", "HKD", "CNY", "INR", "EGP", "JOD", "TRY", "ZAR", "SEK", "NOK", "DKK", "NZD",
]);

const DATE_RE = /^(\d{1,2})\s?([A-Za-z]{3})\s?(\d{4})$/;
const AMT_RE = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/;

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export function parseHsbcDate(raw: string): string | null {
  const m = squash(raw).match(DATE_RE);
  if (!m) return null;
  const month = EN_MONTHS[m[2].toLowerCase()];
  return month ? isoDate(Number(m[3]), month, Number(m[1])) : null;
}

function amountValue(text: string): number {
  const neg = text.startsWith("-");
  const v = Number(text.replace(/[-,]/g, ""));
  return neg ? -v : v;
}

// --- row builders -------------------------------------------------------------------------------

function isHeaderWords(words: string[]): boolean {
  const heads = new Set(
    words.filter((w) => ["deposits", "deposit", "withdrawals", "withdrawal", "balance"].includes(w)).map((w) => w.replace(/s$/, "")),
  ).size;
  if ((words.includes("details") || words.includes("transaction")) && heads >= 1) return true;
  return words.includes("date") && heads >= 2;
}

function colsFromHeader(tokens: OcrToken[], prev: Cols): Cols {
  const next = { ...prev };
  const find = (...names: string[]) => tokens.find((t) => names.includes(letters(t.text)));
  const dep = find("deposits", "deposit");
  const wd = find("withdrawals", "withdrawal");
  const bal = find("balance");
  const det = find("transaction", "details");
  if (dep) {
    next.depR = dep.right;
    next.descEnd = dep.left - 0.06;
  }
  if (wd) next.wdR = wd.right;
  if (bal) next.balR = bal.right;
  if (det) next.dateEnd = det.left - 0.015;
  // A header with only some words found keeps ordered, sane anchors.
  if (!(next.depR < next.wdR && next.wdR < next.balR)) return prev;
  return next;
}

function colOf(right: number, c: Cols): Col {
  if (right < (c.depR + c.wdR) / 2) return "dep";
  if (right < (c.wdR + c.balR) / 2) return "wd";
  return "bal";
}

function geometryRows(page: OcrPage, cols: { current: Cols }): Row[] {
  const rows: Row[] = [];
  for (const vr of boxesToRows(page.boxes ?? [])) {
    const full = vr.tokens.map((t) => t.text).join(" ");
    if (isHeaderWords(vr.tokens.map((t) => letters(t.text)))) {
      cols.current = colsFromHeader(vr.tokens, cols.current);
      rows.push({ header: true, full, date: null, desc: "", nums: [], ints: [] });
      continue;
    }
    const c = cols.current;
    const dateParts: string[] = [];
    const descParts: string[] = [];
    const nums: Num[] = [];
    const ints: number[] = [];
    for (const t of vr.tokens) {
      const center = (t.left + t.right) / 2;
      if (center < c.dateEnd) {
        dateParts.push(t.text);
        continue;
      }
      if (center >= c.descEnd) {
        const mark = t.text.match(/^(.*\d)\s*(DR|CR)\.?$/i);
        const body = mark ? mark[1] : t.text;
        if (AMT_RE.test(body)) {
          nums.push({ value: amountValue(body), marker: mark ? (mark[2].toUpperCase() as "DR" | "CR") : null, col: colOf(t.right, c) });
          continue;
        }
        if (/^(DR|CR)\.?$/i.test(t.text) && nums.length > 0 && nums[nums.length - 1].marker === null) {
          nums[nums.length - 1].marker = t.text.slice(0, 2).toUpperCase() as "DR" | "CR";
          continue;
        }
        if (/^\d{1,6}$/.test(t.text)) {
          ints.push(Number(t.text));
          continue;
        }
      }
      descParts.push(t.text);
    }
    const dateText = dateParts.join("");
    let date: string | null = null;
    if (dateText) {
      if (DATE_RE.test(dateText)) date = dateText;
      else descParts.unshift(...dateParts);
    }
    rows.push({ header: false, full, date, desc: squash(descParts.join(" ")), nums, ints });
  }
  return rows;
}

const LABEL_COMPACT = ["broughtforward", "carriedforward", "closingbalance", "transactionsummary", "transactioncount"];

function trailing(s: string): { head: string; nums: Num[] } {
  const nums: Num[] = [];
  let head = s;
  for (let i = 0; i < 3; i++) {
    const m = head.match(/(?:^|\s)(-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})(?:\s*(DR|CR)\.?)?\s*$/i);
    if (!m || m.index === undefined) break;
    nums.unshift({ value: amountValue(m[1]), marker: m[2] ? (m[2].toUpperCase() as "DR" | "CR") : null, col: null });
    head = head.slice(0, m.index).trimEnd();
  }
  return { head, nums };
}

function lineRow(line: string): Row {
  const s = squash(line);
  let date: string | null = null;
  let rest = s;
  const dm = s.match(/^(\d{1,2}\s?[A-Za-z]{3}\s?\d{4})(?=\s|$)\s*(.*)$/);
  if (dm && parseHsbcDate(dm[1])) {
    date = dm[1];
    rest = dm[2];
  }
  const compact = letters(rest);
  const isHeader =
    isHeaderWords(rest.split(/\s+/).map(letters)) || /^transaction details$/i.test(rest);
  if (isHeader) return { header: true, full: s, date: null, desc: "", nums: [], ints: [] };

  const labelish = /^REF\b/i.test(rest) || LABEL_COMPACT.some((l) => compact.includes(l));
  const ints: number[] = [];
  if (compact.includes("transactioncount")) {
    const im = rest.match(/(\d+)(?:\s+(\d+))?\s*$/);
    if (im) {
      ints.push(Number(im[1]));
      if (im[2] !== undefined) ints.push(Number(im[2]));
    }
    return { header: false, full: s, date, desc: rest.replace(/[\d\s]+$/, "").trim(), nums: [], ints };
  }
  const t = trailing(rest);
  if (labelish) return { header: false, full: s, date, desc: t.head, nums: t.nums, ints };
  if (t.head === "" && t.nums.length > 0) return { header: false, full: s, date, desc: "", nums: t.nums, ints };
  if (/^\d{1,6}(?:\s+\d{1,6})?$/.test(rest)) {
    return { header: false, full: s, date, desc: "", nums: [], ints: rest.split(/\s+/).map(Number) };
  }
  return { header: false, full: s, date, desc: rest, nums: [], ints };
}

// --- state machine ------------------------------------------------------------------------------

type Draft = { date: string; desc: string; raw: string; amount: number; balance: number | null; ref: string | null };
type Acct = {
  num: string;
  iban: string | null;
  currency: string | null;
  opening: number | null;
  openingDate: string | null;
  closing: number | null;
  sawBF: boolean;
  running: number | null;
  lastDate: string | null;
  drafts: Draft[];
  summary: { dep: number | null; wd: number | null };
  counts: { dep: number; wd: number } | null;
  sawDR: boolean;
  blk: { desc: string[]; raw: string[]; ref: string | null; date: string | null };
};

const freshBlock = () => ({ desc: [] as string[], raw: [] as string[], ref: null as string | null, date: null as string | null });

function newAcct(num: string): Acct {
  return {
    num,
    iban: null,
    currency: null,
    opening: null,
    openingDate: null,
    closing: null,
    sawBF: false,
    running: null,
    lastDate: null,
    drafts: [],
    summary: { dep: null, wd: null },
    counts: null,
    sawDR: false,
    blk: freshBlock(),
  };
}

function signed(n: Num): number {
  if (n.marker === "DR") return -Math.abs(n.value);
  if (n.marker === "CR") return Math.abs(n.value);
  return n.value;
}

function ibanOf(text: string): string | null {
  const m = text.match(/IBAN\s*[-:]?\s*(.*)$/i);
  if (!m) return null;
  let acc = "";
  for (const tok of m[1].split(/\s+/)) {
    if (!/^[A-Z0-9]+$/i.test(tok) || acc.length + tok.length > 34) break;
    acc += tok.toUpperCase();
  }
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,}$/.test(acc) ? acc : null;
}

function titleOf(row: Row): { num: string; iban: string | null } | null {
  if (/\d[\d,]*\.\d{2}/.test(row.full)) return null;
  const m = row.full.match(/\b(\d{3}-\d{6}-\d{3})\b/);
  if (!m) return null;
  const iban = ibanOf(row.full);
  if (!iban && !/^(current account|statement sav|sav|call account|deposit|account)/i.test(row.full)) return null;
  return { num: m[1], iban };
}

export type HsbcParseResult = {
  accounts: PdfAccountStatement[];
  warnings: string[];
  sawStructure: boolean;
  summaryZero: boolean;
};

export function parseHsbcComposite(doc: OcrDocument): HsbcParseResult {
  const warnings: string[] = [];
  const accounts = new Map<string, Acct>();
  const order: Acct[] = [];
  let cur: Acct | null = null;
  let pendingTitle: { num: string; iban: string | null } | null = null;
  let inBlock = false;
  let awaiting: "summary" | "count" | null = null;
  let statementDate: string | null = null;
  let headers = 0;
  const counters = { dropped: 0, noDate: 0, unsigned: 0, signFromBalance: 0, repeatedBfDiffers: 0 };

  const label = (a: Acct) => (a.num ? `account ending ${a.num.slice(-4)}` : "account");

  const dropPending = (a: Acct) => {
    if (a.blk.desc.length > 0 || a.blk.ref !== null) counters.dropped++;
    a.blk = freshBlock();
  };

  const startBlock = () => {
    headers++;
    const pt = pendingTitle;
    pendingTitle = null;
    if (pt) {
      let a = accounts.get(pt.num);
      if (!a) {
        a = newAcct(pt.num);
        accounts.set(pt.num, a);
        order.push(a);
      }
      if (pt.iban && !a.iban) a.iban = pt.iban;
      if (cur && cur !== a) dropPending(cur);
      cur = a;
    } else if (!cur) {
      cur = newAcct("");
      accounts.set("", cur);
      order.push(cur);
    }
    inBlock = true;
    awaiting = null;
  };

  const endBlock = () => {
    if (cur) dropPending(cur);
    inBlock = false;
  };

  const closeTxn = (a: Acct, amt: Num, bal: Num | null) => {
    const mag = Math.abs(amt.value);
    const balance = bal ? signed(bal) : null;
    if (bal?.marker === "DR") a.sawDR = true;
    const colSign = amt.marker === "DR" ? -1 : amt.marker === "CR" ? 1 : amt.col === "dep" ? 1 : amt.col === "wd" ? -1 : null;
    const delta = balance !== null && a.running !== null ? roundMoney(balance - a.running) : null;
    let sign: number | null = null;
    if (delta !== null && sameMoney(Math.abs(delta), mag)) {
      sign = delta < 0 ? -1 : 1;
      if (colSign !== null && colSign !== sign) counters.signFromBalance++;
    } else if (colSign !== null) {
      sign = colSign;
    } else if (delta !== null) {
      sign = delta < 0 ? -1 : 1;
    }
    if (sign === null) {
      counters.unsigned++;
      a.blk = freshBlock();
      return;
    }
    const date = a.blk.date ?? a.lastDate ?? a.openingDate ?? statementDate;
    if (!date) {
      counters.noDate++;
      a.blk = freshBlock();
      return;
    }
    const amount = roundMoney(sign * mag);
    a.drafts.push({
      date,
      desc: squash(a.blk.desc.join(" ")),
      raw: squash(a.blk.raw.join(" ")),
      amount,
      balance,
      ref: a.blk.ref,
    });
    a.running = balance ?? (a.running !== null ? roundMoney(a.running + amount) : null);
    a.lastDate = date;
    a.blk = freshBlock();
  };

  const handle = (row: Row) => {
    if (row.header) {
      startBlock();
      return;
    }
    const sd = row.full.match(/statement\s*date\D{0,6}(\d{1,2}\s?[A-Za-z]{3}\s?\d{4})/i);
    if (sd && !statementDate) statementDate = parseHsbcDate(sd[1]);

    if (awaiting && cur && row.desc === "" && row.date === null && (row.nums.length > 0 || row.ints.length > 0)) {
      if (awaiting === "summary" && row.nums.length >= 2) cur.summary = { dep: row.nums[0].value, wd: row.nums[1].value };
      if (awaiting === "count" && row.ints.length >= 2) cur.counts = { dep: row.ints[0], wd: row.ints[1] };
      awaiting = null;
      return;
    }
    awaiting = null;

    const title = titleOf(row);
    if (title) {
      pendingTitle = title;
      if (inBlock && cur && cur.num !== title.num) endBlock();
      return;
    }
    if (!inBlock || !cur) return;
    const a = cur;

    const compact = letters(row.full);
    if ((compact === "" && row.nums.length === 0) || /drdebit/.test(compact) || /^(date|deposits|withdrawals|balance)(drdebit)?$/.test(compact) || compact.includes("systemgenerated")) return;
    if (/^[A-Z]{3}$/.test(row.full) && CURRENCIES.has(row.full)) {
      if (!a.currency) a.currency = row.full;
      return;
    }
    const last = row.nums.length > 0 ? row.nums[row.nums.length - 1] : null;

    if (compact.includes("carriedforward")) return;
    if (compact.includes("broughtforward") || compact.includes("balancebf")) {
      if (!last) return;
      const v = signed(last);
      if (last.marker === "DR") a.sawDR = true;
      if (!a.sawBF) {
        a.sawBF = true;
        a.opening = v;
        a.running = v;
        a.openingDate = row.date ? parseHsbcDate(row.date) : null;
      } else if (a.running !== null && !sameMoney(a.running, v)) {
        counters.repeatedBfDiffers++;
      }
      return;
    }
    if (compact.includes("closingbalance")) {
      if (last) {
        a.closing = signed(last);
        if (last.marker === "DR") a.sawDR = true;
      }
      dropPending(a);
      return;
    }
    if (compact.includes("transactionsummary")) {
      if (row.nums.length >= 2) a.summary = { dep: row.nums[0].value, wd: row.nums[1].value };
      else if (row.nums.length === 1 && row.nums[0].col === "dep") a.summary.dep = row.nums[0].value;
      else if (row.nums.length === 1 && row.nums[0].col === "wd") a.summary.wd = row.nums[0].value;
      else awaiting = "summary";
      return;
    }
    if (compact.includes("transactioncount")) {
      if (row.ints.length >= 2) a.counts = { dep: row.ints[0], wd: row.ints[1] };
      else awaiting = "count";
      endBlock();
      return;
    }

    if (row.date) {
      const d = parseHsbcDate(row.date);
      if (d && a.blk.date === null) a.blk.date = d;
    }
    const refm = row.desc.match(/^REF\b[\s:.-]*(.*)$/i);
    if (refm) {
      a.blk.ref = refm[1].trim() || null;
      a.blk.raw.push(row.desc);
    } else if (row.desc) {
      a.blk.desc.push(row.desc);
      a.blk.raw.push(row.desc);
    }

    let amt: Num | null = null;
    let bal: Num | null = null;
    if (row.nums.length >= 2) {
      amt = row.nums[0].col === "bal" ? { ...row.nums[0], col: null } : row.nums[0];
      bal = row.nums[row.nums.length - 1];
    } else if (row.nums.length === 1 && row.nums[0].col !== "bal") {
      amt = row.nums[0];
    }
    if (amt) closeTxn(a, amt, bal);
  };

  const cols = { current: DEFAULT_COLS };
  for (const page of doc.pages) {
    const rows = page.boxes && page.boxes.length > 0 ? geometryRows(page, cols) : page.lines.map(lineRow);
    // A new page starts outside any block (page-top furniture is not transaction text); its repeated header
    // re-enters the block of the same account. A page without any header keeps the block open.
    if (rows.some((r) => r.header)) inBlock = false;
    for (const row of rows) handle(row);
  }
  if (cur) dropPending(cur);

  // --- assemble ---
  const built: PdfAccountStatement[] = [];
  let summaryZero = true;
  for (const a of order) {
    if (a.drafts.length === 0 && a.opening === null && a.closing === null) continue;
    const ref = a.iban ?? a.num;
    let currency = a.currency;
    if (!currency) {
      currency = "AED";
      warnings.push(`Currency of ${label(a)} was not read; AED assumed.`);
    }
    const txs: TransactionFingerprint[] = a.drafts.map((d, i) => ({
      bank: "hsbc_uae",
      accountRef: ref,
      currency: currency as string,
      date: d.date,
      valueDate: null,
      description: d.desc || d.ref || "HSBC transaction",
      rawDescription: d.raw,
      ...moneyFields(d.amount),
      balance: d.balance,
      reference: d.ref,
      index: i,
    }));
    const account = buildAccount({
      accountRef: ref,
      currency,
      periodStart: txs[0]?.date ?? a.openingDate,
      periodEnd: txs[txs.length - 1]?.date ?? statementDate,
      openingBalance: a.opening,
      closingBalance: a.closing,
      transactions: txs,
    });
    built.push(account);

    if (a.opening === null) warnings.push(`Opening balance of ${label(a)} not found; its first row cannot be verified.`);
    if (a.closing === null) warnings.push(`Closing balance of ${label(a)} not found; its total cannot be verified.`);
    if (a.sawDR) warnings.push(`${label(a)}: a balance is marked DR (overdrawn) and was read as negative.`);
    const rec = account.reconciliation;
    if (rec.status === "mismatch") {
      warnings.push(
        `Reconciliation mismatch on ${label(a)}: ${rec.brokenBalanceRows.length} row(s) break the running balance` +
          (rec.difference !== null ? `; opening + movements differs from the closing balance by ${rec.difference}.` : "."),
      );
    }
    if (a.counts) {
      if (a.counts.dep > 0 || a.counts.wd > 0) summaryZero = false;
      const dep = txs.filter((t) => t.amount > 0).length;
      const wd = txs.filter((t) => t.amount < 0).length;
      if (dep !== a.counts.dep || wd !== a.counts.wd) {
        warnings.push(
          `Transaction count of ${label(a)} differs from the printed summary: read ${dep} deposit(s) and ${wd} withdrawal(s), the statement says ${a.counts.dep} and ${a.counts.wd}.`,
        );
      }
    } else if (txs.length > 0) {
      summaryZero = false;
    }
    if (a.summary.dep !== null || a.summary.wd !== null) {
      const dep = roundMoney(txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0));
      const wd = roundMoney(-txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));
      if ((a.summary.dep !== null && !sameMoney(dep, a.summary.dep)) || (a.summary.wd !== null && !sameMoney(wd, a.summary.wd))) {
        warnings.push(`Deposit/withdrawal totals of ${label(a)} differ from the printed Transaction Summary.`);
      }
    }
  }

  if (counters.dropped > 0) warnings.push(`${counters.dropped} unfinished transaction text block(s) without an amount were dropped.`);
  if (counters.unsigned > 0) warnings.push(`${counters.unsigned} row(s) were skipped because their direction (deposit or withdrawal) could not be read.`);
  if (counters.noDate > 0) warnings.push(`${counters.noDate} row(s) were skipped because no date could be determined.`);
  if (counters.signFromBalance > 0) warnings.push(`${counters.signFromBalance} row(s): the deposit/withdrawal column disagreed with the balance movement; the balance movement was used.`);
  if (counters.repeatedBfDiffers > 0) warnings.push(`${counters.repeatedBfDiffers} repeated "balance brought forward" line(s) differ from the running balance.`);

  return { accounts: built, warnings, sawStructure: headers > 0 && built.length > 0, summaryZero };
}

export function hsbcCompositeOutcome(doc: OcrDocument): PdfParseOutcome | null {
  const r = parseHsbcComposite(doc);
  if (!r.sawStructure) return null;
  const total = r.accounts.reduce((s, a) => s + a.transactions.length, 0);
  const warnings = ["OCR read: verify every row against the original statement.", ...r.warnings];
  if (total === 0) {
    const clean = r.summaryZero && r.accounts.every((a) => a.reconciliation.status !== "mismatch");
    if (!clean) {
      return {
        ok: false,
        failure: {
          code: "no_transactions",
          bank: "hsbc_uae",
          message: "HSBC UAE statement recognised via OCR but no transaction rows were read although the statement lists movements.",
        },
      };
    }
    warnings.push("No transactions were found: the statement lists no movements for the period.");
  }
  const statement: PdfStatement = { bank: "hsbc_uae", bankName: "HSBC UAE", accounts: r.accounts, warnings, source: "ocr" };
  return { ok: true, statement };
}
