/**
 * Wio Bank (UAE) monthly statement profile.
 *
 * One PDF covers several accounts (current accounts in AED/USD/EUR, savings spaces, a
 * joint account, pockets...). pdf-parse extracts it as:
 *   - a "Summary of Accounts" page (ignored),
 *   - one transaction TABLE per page ("DateRef. NumberDescription ... ()AED"),
 *   - account-details BLOCKS (ACCOUNT HOLDER NAME / CURRENCY / ... / OPENING BALANCE /
 *     CLOSING BALANCE) that are NOT adjacent to the table they describe in extraction order.
 *
 * Each transaction is a single glued run: `DD/MM/YYYY` + `P#########` + description +
 * signed amount + running balance, with NO separator between amount and balance
 * ("-1,000998.34" = -1,000 then 998.34). The split is resolved with balance continuity
 * (previous balance + amount = balance, to the cent), and the tables are matched to the
 * detail blocks the same way: a table continues the active account when its first row
 * follows from the running balance, otherwise it starts the next account whose opening
 * balance it follows from. `reconcile()` (opening + movements = closing) is the final proof.
 */
import type { BankPdfProfile, PdfAccountStatement, PdfParseOutcome, TransactionFingerprint } from "./types";
import { isFabLegacyStatement } from "./fab-legacy";
import { buildAccount, isoDate, moneyFields, roundMoney, sameMoney, squash } from "./shared";

type RawRow = { date: string; reference: string; text: string; extra: string };
type RawTable = { currency: string | null; hasBalance: boolean; rows: RawRow[] };
type DetailBlock = {
  currency: string | null;
  accountNumber: string | null;
  iban: string | null;
  opening: number | null;
  closing: number | null;
  /** Printed "ACCOUNT CLOSURE" date (ISO) of an account that has been closed. */
  closedOn: string | null;
  /** Name of a savings space / deposit ("Papa Fixed Saving Space"); null for a current account (its name is the holder). */
  accountName: string | null;
  /** Printed "ACCOUNT OPENED" date (ISO). */
  openedOn: string | null;
};

const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ROW_RE = /^(\d{2}\/\d{2}\/\d{4})(P\d{9})(.*)$/;
/** Wio always groups thousands with commas and drops trailing zeros ("98.49", "8,077.8"). */
const NUM_RE = /^-?(0|[1-9]\d{0,2}(,\d{3})*)(\.\d{1,2})?$/;
const TAIL_RE = /^(.*?[^-\d.,])?([-\d.,]+)$/;

function toNum(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function parseDmy(s: string): string | null {
  const m = DATE_RE.exec(s);
  return m ? isoDate(Number(m[3]), Number(m[2]), Number(m[1])) : null;
}

function parseMoney(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim();
  return /^-?[\d,]+(\.\d+)?$/.test(t) ? roundMoney(toNum(t)) : null;
}

/** Every position of `tail` that splits into a format-valid amount | balance. */
function formatSplits(tail: string): { amount: number; balance: number }[] {
  const out: { amount: number; balance: number }[] = [];
  for (let p = 1; p < tail.length; p++) {
    const left = tail.slice(0, p);
    const right = tail.slice(p);
    if (NUM_RE.test(left) && NUM_RE.test(right)) out.push({ amount: toNum(left), balance: toNum(right) });
  }
  return out;
}

type Resolved = {
  description: string;
  amount: number;
  /** Running balance after the row; null for the first-generation layout without a balance column and no opening. */
  balance: number | null;
  /** True when previous + amount = balance held (or there was no previous balance to test). */
  continuous: boolean;
  /** More than one split was valid. */
  ambiguous: boolean;
};

/**
 * Splits `description + amount + balance`. Prefers the unique split that satisfies balance
 * continuity; when the description itself ends in digits the leading digits of the numeric
 * tail are given back to the description.
 */
function resolveRow(prev: number | null, text: string): Resolved | null {
  const m = TAIL_RE.exec(text);
  if (!m) return null;
  const baseDesc = m[1] ?? "";
  const tail = m[2];
  let formatFallback: Resolved | null = null;
  for (let i = 0; i < tail.length - 2; i++) {
    const description = baseDesc + tail.slice(0, i);
    const splits = formatSplits(tail.slice(i));
    if (splits.length === 0) continue;
    if (prev !== null) {
      const good = splits.filter((s) => sameMoney(prev + s.amount, s.balance));
      if (good.length > 0) {
        return { description, ...good[0], continuous: true, ambiguous: good.length > 1 };
      }
    }
    if (formatFallback === null) {
      formatFallback = { description, ...splits[0], continuous: prev === null, ambiguous: splits.length > 1 };
    }
  }
  return formatFallback;
}

/**
 * Account-details blocks. The label order differs between statement generations (the holder
 * name leads in 2025+ and trails in 2023-24), so a block is the run of `LABEL / value` pairs
 * that ends when a label repeats.
 */
const BLOCK_LABELS = ["CURRENCY", "ACCOUNT NUMBER", "IBAN", "OPENING BALANCE", "CLOSING BALANCE", "ACCOUNT CLOSURE", "ACCOUNT TYPE", "ACCOUNT NAME", "ACCOUNT OPENED"] as const;

function parseBlocks(lines: string[]): DetailBlock[] {
  const blocks: DetailBlock[] = [];
  let cur: Partial<Record<(typeof BLOCK_LABELS)[number], string>> | null = null;
  const flush = () => {
    if (cur && (cur["OPENING BALANCE"] !== undefined || cur["CLOSING BALANCE"] !== undefined)) {
      blocks.push({
        currency: /^[A-Z]{3}$/.test(cur.CURRENCY ?? "") ? (cur.CURRENCY as string) : null,
        accountNumber: /^\d+$/.test(cur["ACCOUNT NUMBER"] ?? "") ? (cur["ACCOUNT NUMBER"] as string) : null,
        iban: /^[A-Z]{2}\d{10,32}$/.test(cur.IBAN ?? "") ? (cur.IBAN as string) : null,
        opening: parseMoney(cur["OPENING BALANCE"]),
        closing: parseMoney(cur["CLOSING BALANCE"]),
        closedOn: parseDmy(cur["ACCOUNT CLOSURE"] ?? ""),
        accountName: cur["ACCOUNT TYPE"] && !/^current[ _]account$/i.test(cur["ACCOUNT TYPE"]) && cur["ACCOUNT NAME"] ? squash(cur["ACCOUNT NAME"]) : null,
        openedOn: parseDmy(cur["ACCOUNT OPENED"] ?? ""),
      });
    }
    cur = null;
  };
  for (let i = 0; i < lines.length - 1; i++) {
    const label = lines[i].trim() as (typeof BLOCK_LABELS)[number];
    if (!(BLOCK_LABELS as readonly string[]).includes(label)) continue;
    if (cur && cur[label] !== undefined) flush();
    cur ??= {};
    cur[label] = lines[i + 1].trim();
    i++;
  }
  flush();
  return blocks;
}

type SummaryAccount = {
  ref: string;
  currency: string;
  closing: number;
  openedOn: string | null;
  closedOn: string | null;
  /** Name of a savings space; null for a current account. */
  name: string | null;
};

/**
 * "Summary of Accounts" (current accounts: IBAN, rate, opened, then "closing CCY") and "Summary of Savings" (name +
 * account number + rate, opened, closure, then "closing CCY"). It lists EVERY account of the customer, including the
 * ones that had no transaction in the month and so have no detail block or table: those still exist, with that balance.
 */
function parseSummary(lines: string[]): SummaryAccount[] {
  const out: SummaryAccount[] = [];
  let section: "accounts" | "savings" | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^Summary of Accounts/.test(line)) section = "accounts";
    else if (/^Summary of Savings/.test(line)) section = "savings";
    else if (/^(ACCOUNT STATEMENT|Please review|DateRef)/.test(line)) section = null;
    if (!section) continue;
    const amount = /^(-?[\d,]+(?:\.\d+)?)\s+([A-Z]{3})$/.exec((lines[i + 1] ?? "").trim());
    if (!amount) continue;
    const closing = parseMoney(amount[1]);
    if (closing === null) continue;
    if (section === "accounts") {
      const m = /^([A-Z]{2}\d{21})\d+(?:\.\d+)?%(\d{2}\/\d{2}\/\d{4})$/.exec(line);
      if (m) out.push({ ref: m[1], currency: amount[2], closing, openedOn: parseDmy(m[2]), closedOn: null, name: null });
    } else {
      const m = /^(.+?)(\d{10})\d+(?:\.\d+)?%(\d{2}\/\d{2}\/\d{4})(\d{2}\/\d{2}\/\d{4})?$/.exec(line);
      if (m) out.push({ ref: m[2], currency: amount[2], closing, openedOn: parseDmy(m[3]), closedOn: m[4] ? parseDmy(m[4]) : null, name: squash(m[1]) });
    }
  }
  return out;
}

function parseTables(lines: string[]): RawTable[] {
  const tables: RawTable[] = [];
  let cur: RawTable | null = null;
  for (const line of lines) {
    if (/^Date\s*Ref\.?\s*Number\s*Description/.test(line)) {
      // First-generation statements (Nov 2023) have a Fees/Amount layout with no balance column.
      cur = { currency: null, hasBalance: false, rows: [] };
      tables.push(cur);
      continue;
    }
    const head = /^\(\)\s*([A-Z]{3})\s*$/.exec(line);
    if (head && cur && cur.rows.length === 0) {
      cur.currency = head[1];
      cur.hasBalance = true;
      continue;
    }
    if (!cur) continue;
    if (/^(Please review|This is a digital stamp|ACCOUNT HOLDER NAME|ACCOUNT STATEMENT)/.test(line)) {
      cur = null;
      continue;
    }
    const r = ROW_RE.exec(line);
    if (r) {
      cur.rows.push({ date: r[1], reference: r[2], text: r[3], extra: "" });
    } else if (line.trim() && cur.rows.length > 0) {
      // Wrapped description line.
      const last = cur.rows[cur.rows.length - 1];
      last.extra = squash(`${last.extra} ${line}`);
    }
  }
  return tables;
}

/** Resolves one row of a table: with a balance column by continuity, otherwise amount only. */
function resolveFor(table: RawTable, prev: number | null, text: string): Resolved | null {
  if (table.hasBalance) return resolveRow(prev, text);
  const m = TAIL_RE.exec(text);
  if (!m || !NUM_RE.test(m[2])) return null;
  const amount = toNum(m[2]);
  return {
    description: m[1] ?? "",
    amount,
    balance: prev === null ? null : roundMoney(prev + amount),
    continuous: true,
    ambiguous: false,
  };
}

function fits(prev: number | null, table: RawTable): boolean {
  if (!table.hasBalance || prev === null) return false;
  const r = resolveFor(table, prev, table.rows[0].text);
  return r !== null && r.continuous;
}

/** True when every row of the table chains from the block's opening balance and ends on its closing balance. */
function endsAtClosing(block: DetailBlock, table: RawTable): boolean {
  if (block.opening === null || block.closing === null) return false;
  let prev = block.opening;
  for (const row of table.rows) {
    const r = resolveFor(table, prev, row.text);
    if (!r || !r.continuous || r.balance === null) return false;
    prev = roundMoney(r.balance);
  }
  return sameMoney(prev, block.closing);
}

type Active = {
  block: DetailBlock;
  rows: TransactionFingerprint[];
  running: number | null;
  closed: boolean;
  started: boolean;
};

/**
 * A First Abu Dhabi Bank account statement prints an `AC-NUM` line and an `Account Statement FROM ..
 * TO ..` header, which a Wio statement never does. Any free-text mention of "Wio" (a transfer
 * description, a beneficiary name) in such a statement must not make Wio claim it.
 */
function looksLikeFabStatement(text: string): boolean {
  return (/AC-NUM/.test(text) && /Account\s+Statement\s+FROM/i.test(text)) || isFabLegacyStatement(text);
}

function detect(text: string): boolean {
  if (looksLikeFabStatement(text)) return false;
  return (/Wio Bank/i.test(text) || (/Summary of Accounts/.test(text) && /Wio/i.test(text) && /CBUAE/.test(text))) &&
    /ACCOUNT STATEMENT/.test(text);
}

function parse(text: string): PdfParseOutcome {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
  const warnings: string[] = [];
  const periodM = /FROM\s*(\d{2}\/\d{2}\/\d{4})\s*TO\s*(\d{2}\/\d{2}\/\d{4})/.exec(text);
  const periodStart = periodM ? parseDmy(periodM[1]) : null;
  const periodEnd = periodM ? parseDmy(periodM[2]) : null;

  const tables = parseTables(lines).filter((t) => t.rows.length > 0);
  const blocks = parseBlocks(lines);

  if (tables.length === 0) {
    return {
      ok: false,
      failure: { code: "no_transactions", bank: "wio", message: "Wio statement recognised but no transaction rows were found." },
    };
  }

  const accounts: Active[] = blocks.map((block) => ({
    block,
    rows: [],
    running: block.opening,
    closed: false,
    started: false,
  }));
  const orphans: Active[] = [];

  let k = -1;
  for (const table of tables) {
    let target: Active | null = null;
    const cur = k >= 0 ? accounts[k] : null;
    const matchesCcy = (a: Active) => a.block.currency === null || table.currency === null || a.block.currency === table.currency;
    const continues = !!cur && cur.started && matchesCcy(cur) && fits(cur.running, table);
    if (cur && continues && !cur.closed) {
      target = cur;
    } else {
      // Prefer an account the whole table takes from its opening balance to its closing balance.
      let j = accounts.findIndex((a, idx) => idx > k && !a.started && matchesCcy(a) && endsAtClosing(a.block, table));
      if (j < 0 && cur && continues) {
        // The previous account sat on its closing balance at the page break but carries on.
        target = cur;
      } else if (j < 0) {
        j = accounts.findIndex((a, idx) => idx > k && !a.started && matchesCcy(a) && fits(a.block.opening, table));
      }
      if (j < 0 && !target) {
        j = accounts.findIndex((a, idx) => idx > k && !a.started && matchesCcy(a));
        if (j >= 0) warnings.push(`A ${table.currency ?? ""} table could not be matched to an account by balance continuity.`);
      }
      if (j >= 0) {
        k = j;
        target = accounts[j];
      }
    }
    if (!target) {
      warnings.push("A transaction table could not be matched to any account block.");
      target = {
        block: { currency: table.currency, accountNumber: null, iban: null, opening: null, closing: null, closedOn: null, accountName: null, openedOn: null },
        rows: [],
        running: null,
        closed: false,
        started: false,
      };
      orphans.push(target);
    }
    target.started = true;

    for (const row of table.rows) {
      const date = parseDmy(row.date);
      const res = resolveFor(table, target.running, row.text);
      if (!date || !res) {
        warnings.push(`Row ${target.rows.length} of an account could not be parsed.`);
        continue;
      }
      if (!res.continuous || res.ambiguous) {
        warnings.push(
          `Row ${target.rows.length} of an account: ${res.continuous ? "ambiguous" : "unverifiable"} amount/balance split.`,
        );
      }
      const description = squash(`${res.description} ${row.extra}`);
      target.rows.push({
        bank: "wio",
        accountRef: target.block.iban ?? target.block.accountNumber ?? "",
        currency: target.block.currency ?? table.currency ?? "AED",
        date,
        valueDate: null,
        description,
        rawDescription: description,
        ...moneyFields(res.amount),
        balance: table.hasBalance && res.balance !== null ? roundMoney(res.balance) : null,
        reference: row.reference,
        index: target.rows.length,
      });
      target.running = res.balance === null ? null : roundMoney(res.balance);
    }
    target.closed = target.block.closing !== null && target.running !== null && sameMoney(target.running, target.block.closing);
  }

  const outAccounts: PdfAccountStatement[] = [...accounts, ...orphans]
    .filter((a) => a.rows.length > 0)
    .map((a) =>
      buildAccount({
        accountRef: a.block.iban ?? a.block.accountNumber ?? "",
        currency: a.block.currency ?? a.rows[0].currency,
        periodStart,
        periodEnd,
        openingBalance: a.block.opening,
        closingBalance: a.block.closing,
        transactions: a.rows,
        // The printed "ACCOUNT CLOSURE" of a fixed deposit that is still open is its MATURITY date (in the
        // future, balance not zero): only a date inside the statement period on an emptied account is a closure.
        ...(a.block.accountName ? { accountName: a.block.accountName } : {}),
        ...(a.block.openedOn ? { openedOn: a.block.openedOn } : {}),
        ...(a.block.closedOn && periodEnd && a.block.closedOn <= periodEnd && (a.block.closing === 0 || a.block.closing === null)
          ? { closedOn: a.block.closedOn }
          : {}),
      }),
    );

  // Accounts the summary lists but that had no transaction this month: they still exist, on the printed balance.
  // Without this a quiet account (a EUR account with no movement) would look abandoned.
  const seen = new Set(outAccounts.map((a) => a.accountRef));
  for (const s of parseSummary(lines)) {
    // A closed account with no movement is not an account to create from this statement.
    if (seen.has(s.ref) || s.closedOn || (periodEnd && s.openedOn && s.openedOn > periodEnd)) continue;
    seen.add(s.ref);
    outAccounts.push(
      buildAccount({
        accountRef: s.ref,
        currency: s.currency,
        periodStart,
        periodEnd,
        openingBalance: s.closing,
        closingBalance: s.closing,
        transactions: [],
        ...(s.name ? { accountName: s.name } : {}),
        ...(s.openedOn ? { openedOn: s.openedOn } : {}),
        ...(s.closedOn && periodEnd && s.closedOn <= periodEnd && s.closing === 0 ? { closedOn: s.closedOn } : {}),
      }),
    );
  }

  outAccounts.forEach((a, i) => {
    if (a.reconciliation.status === "mismatch") {
      warnings.push(`Account ${i + 1} (${a.currency}) does not reconcile to its printed closing balance.`);
    }
  });

  if (outAccounts.length === 0) {
    return {
      ok: false,
      failure: { code: "no_transactions", bank: "wio", message: "Wio statement recognised but no transaction rows were found." },
    };
  }
  return { ok: true, statement: { bank: "wio", bankName: "Wio Bank", accounts: outAccounts, warnings } };
}

export const wioProfile: BankPdfProfile = { id: "wio", name: "Wio Bank", detect, parse };
