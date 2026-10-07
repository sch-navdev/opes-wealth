/**
 * Generic, header-driven parser for OCR'd bank statements (image-only / scanned PDFs).
 *
 * UNVERIFIED AGAINST REAL OCR OUTPUT. This parser knows no bank layout. It finds the transaction
 * table by its HEADER ROW (date / description / debit+credit or amount / balance columns, matched
 * through the spec's keyword aliases, tolerant of OCR noise: accents, case, and an edit distance of
 * 1 on words of 5+ letters), then reads rows below it. A bank profile only supplies a spec of
 * header keywords and labels; any bank-specific claim made by a spec is labelled in its own file.
 *
 * Safety model: OCR can read "1,234.56" as "1,284.56" or drop a separator. This parser NEVER
 * auto-corrects numbers. Every account goes through `buildAccount` -> `reconcile`
 * (opening + movements = closing; each printed running balance follows from the previous one), so
 * a misread figure surfaces as reconciliation status "mismatch", never as a silent "ok". The
 * statement always carries the warning "OCR read: verify every row" and `source: "ocr"`.
 *
 * Row rules (table path):
 *  - date cell parses -> new transaction; empty date cell -> continuation of the previous
 *    description (or, when the row carries an amount, a transaction that inherits the previous date,
 *    flagged by a warning); total / summary / footer rows are skipped;
 *  - the FIRST "balance brought forward"-like row sets the opening balance (later ones, e.g. at the
 *    top of each page, are only cross-checked); the LAST closing-label row sets the closing balance;
 *  - Debit/Credit columns give the sign; a single Amount column takes it from an explicit sign or a
 *    Dr/Cr marker, else from the balance delta (like `fab.ts`); a Dr/Cr marker on a balance means
 *    overdrawn (DR) / in credit (CR);
 *  - a table without a header row but with the same column count as an earlier header reuses it.
 * When no table with a recognisable header exists (or it yields no rows) a `lines` fallback reads
 * right-anchored `date ... amount [balance]` lines, flagged with a warning.
 */
import { parseBankAmount } from "@/lib/banking/csv-profiles";
import { buildAccount, EN_MONTHS, isoDate, moneyFields, roundMoney, sameMoney, squash } from "./shared";
import type { OcrDocument } from "./ocr-types";
import type { PdfBankId, PdfParseOutcome, TransactionFingerprint } from "./types";

export type OcrDateFormat = "DD/MM/YYYY" | "DD-MM-YYYY" | "DD MMM YYYY" | "DD MMM";

export type OcrStatementSpec = {
  bank: PdfBankId;
  bankName: string;
  currencyDefault: string;
  /** Day-first formats accepted; "DD MMM" takes its year from the statement period. */
  dateFormats: OcrDateFormat[];
  /** Normalised (lowercase, accent-free) header keyword phrases per column role. */
  headerAliases: {
    date: string[];
    valueDate?: string[];
    description: string[];
    debit: string[];
    credit: string[];
    amount?: string[];
    balance: string[];
  };
  openingLabels: string[];
  closingLabels: string[];
};

// --- text helpers ---------------------------------------------------------------------

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

function wordMatches(word: string, aliasWord: string): boolean {
  if (word === aliasWord) return true;
  return word.length >= 5 && aliasWord.length >= 5 && editDistanceAtMost1(word, aliasWord);
}

/** Number of alias words matched (all must match), or 0. */
function aliasScore(cellWords: string[], alias: string): number {
  const aw = normalize(alias).split(" ").filter(Boolean);
  if (aw.length === 0) return 0;
  return aw.every((w) => cellWords.some((c) => wordMatches(c, w))) ? aw.length : 0;
}

function bestAliasScore(cellWords: string[], aliases: string[] | undefined): number {
  return Math.max(0, ...(aliases ?? []).map((a) => aliasScore(cellWords, a)));
}

/** Label match on a whole text: normalised phrase contained (word-wise, fuzzy on long words). */
function hasLabel(text: string, labels: string[]): boolean {
  const words = normalize(text).split(" ").filter(Boolean);
  return labels.some((l) => aliasScore(words, l) > 0 && normalize(l).split(" ").length <= words.length);
}

// --- amounts & dates --------------------------------------------------------------------

type Amt = { value: number; marker: "DR" | "CR" | null; explicitSign: boolean };

function parseAmountCell(raw: string): Amt | null {
  const text = raw.trim();
  if (!/\d/.test(text)) return null;
  const m = text.match(/(?:^|[\s\d.,)])(DR|CR)\.?\s*$/i);
  const marker = m ? (m[1].toUpperCase() as "DR" | "CR") : null;
  const body = marker ? text.replace(/(DR|CR)\.?\s*$/i, "") : text;
  const value = parseBankAmount(body);
  if (value === null) return null;
  return { value, marker, explicitSign: value < 0 || /^\s*[-−(]/.test(body) };
}

/** Signed balance: DR marker = overdrawn (negative), CR marker = positive. */
function signedBalance(a: Amt): number {
  if (a.marker === "DR") return -Math.abs(a.value);
  if (a.marker === "CR") return Math.abs(a.value);
  return a.value;
}

type YearContext = { start: string | null; end: string | null; fallbackYear: number | null };

function resolveYear(month: number, ctx: YearContext): number | null {
  const sy = ctx.start ? Number(ctx.start.slice(0, 4)) : null;
  const sm = ctx.start ? Number(ctx.start.slice(5, 7)) : null;
  const ey = ctx.end ? Number(ctx.end.slice(0, 4)) : null;
  if (sy !== null && ey !== null) {
    if (sy === ey) return sy;
    return sm !== null && month >= sm ? sy : ey;
  }
  if (ey !== null) {
    const em = Number(ctx.end?.slice(5, 7));
    return month > em ? ey - 1 : ey;
  }
  if (sy !== null) return sy;
  return ctx.fallbackYear;
}

function parseDateText(raw: string, spec: OcrStatementSpec, ctx: YearContext): { iso: string | null; yearInferred: boolean } {
  const text = squash(raw);
  const numeric = spec.dateFormats.includes("DD/MM/YYYY") || spec.dateFormats.includes("DD-MM-YYYY");
  let m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m && numeric) return { iso: isoDate(+m[3], +m[2], +m[1]), yearInferred: false };
  m = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (m && spec.dateFormats.includes("DD MMM YYYY")) {
    const mo = EN_MONTHS[m[2].slice(0, 3).toLowerCase()];
    return { iso: mo ? isoDate(+m[3], mo, +m[1]) : null, yearInferred: false };
  }
  m = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?$/);
  if (m && spec.dateFormats.includes("DD MMM")) {
    const mo = EN_MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!mo) return { iso: null, yearInferred: false };
    const y = resolveYear(mo, ctx);
    return { iso: y === null ? null : isoDate(y, mo, +m[1]), yearInferred: true };
  }
  return { iso: null, yearInferred: false };
}

// --- table column mapping ------------------------------------------------------------------

type Role = "date" | "valueDate" | "description" | "debit" | "credit" | "amount" | "balance";
type ColumnMap = Partial<Record<Role, number>> & { width: number };

const ROLE_ORDER: Role[] = ["valueDate", "date", "description", "debit", "credit", "amount", "balance"];

function mapHeader(row: string[], spec: OcrStatementSpec): ColumnMap | null {
  const map: ColumnMap = { width: row.length };
  const aliasesFor = (r: Role): string[] | undefined =>
    r === "valueDate" ? spec.headerAliases.valueDate : r === "amount" ? spec.headerAliases.amount : spec.headerAliases[r];
  row.forEach((cell, col) => {
    const words = normalize(cell).split(" ").filter(Boolean);
    if (words.length === 0) return;
    let best: Role | null = null;
    let bestScore = 0;
    for (const role of ROLE_ORDER) {
      if (map[role] !== undefined) continue;
      const s = bestAliasScore(words, aliasesFor(role));
      if (s > bestScore) {
        best = role;
        bestScore = s;
      }
    }
    if (best) map[best] = col;
  });
  const hasMoney = (map.debit !== undefined && map.credit !== undefined) || map.amount !== undefined;
  if (map.date === undefined || map.description === undefined || map.balance === undefined || !hasMoney) return null;
  return map;
}

// --- header-block facts (period, currency, account ref, opening/closing from lines) --------------

const DATE_ANY = String.raw`\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}`;
const AMT_TOKEN = String.raw`-?\(?\d[\d,]*\.\d{2}\)?(?:\s?(?:DR|CR)\b)?`;

function allLines(doc: OcrDocument): string[] {
  return doc.pages.flatMap((p) => p.lines);
}

function findPeriod(lines: string[], spec: OcrStatementSpec): { start: string | null; end: string | null } {
  const re = new RegExp(`(${DATE_ANY})\\s*(?:to|-|–|—|through|until)\\s*(${DATE_ANY})`, "i");
  const noYear: YearContext = { start: null, end: null, fallbackYear: null };
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const a = parseDateText(m[1], { ...spec, dateFormats: ["DD/MM/YYYY", "DD-MM-YYYY", "DD MMM YYYY"] }, noYear).iso;
    const b = parseDateText(m[2], { ...spec, dateFormats: ["DD/MM/YYYY", "DD-MM-YYYY", "DD MMM YYYY"] }, noYear).iso;
    if (a && b) return { start: a, end: b };
  }
  return { start: null, end: null };
}

function findCurrency(lines: string[], fallback: string): string {
  for (const line of lines) {
    const m = line.match(/\b(?:CCY|[Cc]urrency|CURRENCY)\b[\s:.-]*([A-Z]{3})\b/);
    if (m) return m[1];
  }
  return fallback;
}

function findAccountRef(lines: string[]): string {
  for (const line of lines) {
    const iban = line.match(/\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?)\b/);
    if (iban && /iban/i.test(line)) return iban[1].replace(/\s/g, "");
  }
  for (const line of lines) {
    const m = line.match(/\bAccount\s*(?:No\.?|Number)\b[\s:.-]*([0-9][0-9 -]{5,})/i);
    if (m) return m[1].replace(/[^0-9]/g, "");
  }
  return "";
}

/** "<label> ... <amount>" lines outside the table. Returns the first (opening) or last (closing) match. */
function balanceFromLines(lines: string[], labels: string[], which: "first" | "last"): number | null {
  let found: number | null = null;
  for (const line of lines) {
    if (!hasLabel(line, labels)) continue;
    const amounts = [...line.matchAll(new RegExp(AMT_TOKEN, "gi"))].map((m) => parseAmountCell(m[0]));
    const last = amounts.filter((a): a is Amt => a !== null).pop();
    if (!last) continue;
    found = signedBalance(last);
    if (which === "first") return found;
  }
  return found;
}

// --- row building ---------------------------------------------------------------------------------

type Draft = {
  date: string;
  valueDate: string | null;
  fragments: string[];
  amount: number;
  balance: number | null;
};

type Counters = { skipped: number; inheritedDate: number; unreadableDate: number; yearInferred: boolean; bfMismatch: number };

const SUMMARY_ROW = /^(total|totals|grand total|sub total|subtotal|page \d|continued|end of statement|statement summary|summary)\b/;

function toTransactions(
  drafts: Draft[],
  meta: { bank: PdfBankId; accountRef: string; currency: string },
): TransactionFingerprint[] {
  return drafts.map((d, index) => {
    const raw = squash(d.fragments.join(" "));
    return {
      bank: meta.bank,
      accountRef: meta.accountRef,
      currency: meta.currency,
      date: d.date,
      valueDate: d.valueDate,
      description: raw,
      rawDescription: raw,
      ...moneyFields(d.amount),
      balance: d.balance,
      reference: null,
      index,
    };
  });
}

type TableResult = { drafts: Draft[]; opening: number | null; closing: number | null; sawHeader: boolean; notes: string[] };

function parseTables(doc: OcrDocument, spec: OcrStatementSpec, ctx: YearContext, counters: Counters): TableResult {
  const drafts: Draft[] = [];
  let opening: number | null = null;
  let closing: number | null = null;
  let sawHeader = false;
  let current: ColumnMap | null = null;
  const notes: string[] = [];
  let previousBalance: number | null = null;

  const cellOf = (row: string[], col: number | undefined): string => (col === undefined ? "" : (row[col] ?? "").trim());

  doc.pages.forEach((page, pageNo) => {
    for (const table of page.tables) {
      let startRow = 0;
      let map: ColumnMap | null = null;
      for (let r = 0; r < table.rows.length; r++) {
        const m = mapHeader(table.rows[r], spec);
        if (m) {
          map = m;
          startRow = r + 1;
          break;
        }
      }
      if (map) {
        sawHeader = true;
        current = map;
      } else if (current && table.rows[0] && table.rows[0].length === current.width) {
        map = current;
        notes.push(`Table on page ${pageNo + 1} has no header row; the previous column layout was reused.`);
      } else {
        continue;
      }

      for (let r = startRow; r < table.rows.length; r++) {
        const row = table.rows[r];
        const rowText = squash(row.join(" "));
        if (!rowText) continue;
        if (mapHeader(row, spec)) continue; // repeated header row

        const dateText = cellOf(row, map.date);
        const desc = cellOf(row, map.description);
        const balAmt = parseAmountCell(cellOf(row, map.balance));
        const isOpening = hasLabel(rowText, spec.openingLabels);
        const isClosing = hasLabel(rowText, spec.closingLabels);

        if (isOpening || isClosing) {
          let bal = balAmt;
          if (!bal) {
            for (let c = row.length - 1; c >= 0 && !bal; c--) {
              if (/\d[\d,]*\.\d{2}/.test(row[c] ?? "")) bal = parseAmountCell(row[c]);
            }
          }
          if (!bal) continue;
          const value = signedBalance(bal);
          if (isOpening && !isClosing) {
            if (opening === null && drafts.length === 0) opening = value;
            else if (previousBalance !== null && !sameMoney(previousBalance, value)) {
              counters.bfMismatch++;
              notes.push(`A balance-brought-forward row (page ${pageNo + 1}) does not equal the previous running balance.`);
            }
          } else {
            closing = value;
          }
          continue;
        }

        const parsedDate = dateText ? parseDateText(dateText, spec, ctx) : { iso: null, yearInferred: false };
        const debit = map.debit !== undefined ? parseAmountCell(cellOf(row, map.debit)) : null;
        const credit = map.credit !== undefined ? parseAmountCell(cellOf(row, map.credit)) : null;
        const single = map.amount !== undefined ? parseAmountCell(cellOf(row, map.amount)) : null;
        const hasMoney = !!(debit || credit || single);

        if (!dateText) {
          if (SUMMARY_ROW.test(normalize(rowText))) continue;
          if (!hasMoney) {
            // continuation of the previous description
            if (desc && drafts.length > 0) drafts[drafts.length - 1].fragments.push(desc);
            else if (desc) counters.skipped++;
            continue;
          }
        } else if (!parsedDate.iso) {
          if (!hasMoney) {
            if (desc && drafts.length > 0) drafts[drafts.length - 1].fragments.push(desc);
            continue;
          }
          counters.unreadableDate++;
          counters.skipped++;
          continue;
        }

        if (!hasMoney) continue;

        let date = parsedDate.iso;
        if (!date) {
          const prev = drafts[drafts.length - 1];
          if (!prev) {
            counters.skipped++;
            continue;
          }
          date = prev.date;
          counters.inheritedDate++;
        }
        if (parsedDate.yearInferred) counters.yearInferred = true;

        let amount: number | null = null;
        if (map.debit !== undefined && map.credit !== undefined && (debit || credit) && !single) {
          if (debit && credit && !sameMoney(debit.value, 0) && !sameMoney(credit.value, 0)) {
            counters.skipped++;
            notes.push(`A row with both a debit and a credit was skipped (page ${pageNo + 1}).`);
            continue;
          }
          if (debit && !sameMoney(debit.value, 0)) amount = -Math.abs(debit.value);
          else if (credit) amount = Math.abs(credit.value);
          else amount = 0;
        } else if (single) {
          const mag = Math.abs(single.value);
          if (single.marker) amount = single.marker === "DR" ? -mag : mag;
          else if (single.explicitSign) amount = single.value;
          else if (balAmt && previousBalance !== null) {
            amount = roundMoney(signedBalance(balAmt) - previousBalance) < 0 ? -mag : mag;
          } else if (balAmt && opening !== null) {
            amount = roundMoney(signedBalance(balAmt) - opening) < 0 ? -mag : mag;
          } else {
            amount = -mag;
            notes.push("An amount's sign could not be derived from a balance; assumed a debit.");
          }
        }
        if (amount === null) {
          counters.skipped++;
          continue;
        }
        const balance = balAmt ? signedBalance(balAmt) : null;
        const valueDate = map.valueDate !== undefined ? parseDateText(cellOf(row, map.valueDate), spec, ctx).iso : null;
        drafts.push({ date, valueDate, fragments: desc ? [desc] : [], amount, balance });
        previousBalance = balance ?? (previousBalance !== null ? roundMoney(previousBalance + amount) : null);
      }
      if (previousBalance === null && opening !== null) previousBalance = opening;
    }
  });
  return { drafts, opening, closing, sawHeader, notes };
}

function parseLinesFallback(doc: OcrDocument, spec: OcrStatementSpec, ctx: YearContext, counters: Counters): Draft[] {
  const dateTok = String.raw`(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3}(?![A-Za-z]))`;
  const re = new RegExp(`^(${dateTok})(?:\\s+(${dateTok}))?\\s+(.*?)\\s+(${AMT_TOKEN})(?:\\s+(${AMT_TOKEN}))?\\s*$`, "i");
  const drafts: Draft[] = [];
  let previous: number | null = balanceFromLines(allLines(doc), spec.openingLabels, "first");
  for (const line of allLines(doc)) {
    const m = line.match(re);
    if (!m) continue;
    if (hasLabel(line, spec.openingLabels) || hasLabel(line, spec.closingLabels)) continue;
    const date = parseDateText(m[1], spec, ctx);
    if (!date.iso) {
      counters.skipped++;
      continue;
    }
    if (date.yearInferred) counters.yearInferred = true;
    const valueDate = m[2] ? parseDateText(m[2], spec, ctx).iso : null;
    const first = parseAmountCell(m[4]);
    const second = m[5] ? parseAmountCell(m[5]) : null;
    if (!first) {
      counters.skipped++;
      continue;
    }
    const mag = Math.abs(first.value);
    let amount: number;
    let balance: number | null = null;
    if (second) {
      balance = signedBalance(second);
      if (first.marker) amount = first.marker === "DR" ? -mag : mag;
      else if (first.explicitSign) amount = first.value;
      else if (previous !== null) amount = roundMoney(balance - previous) < 0 ? -mag : mag;
      else amount = -mag;
    } else if (first.marker) {
      amount = first.marker === "DR" ? -mag : mag;
    } else if (first.explicitSign) {
      amount = first.value;
    } else {
      counters.skipped++; // unsigned lone amount: direction unknowable
      continue;
    }
    drafts.push({ date: date.iso, valueDate, fragments: [m[3]], amount, balance });
    previous = balance ?? (previous !== null ? roundMoney(previous + amount) : null);
  }
  return drafts;
}

// --- entry point ------------------------------------------------------------------------------------

export function parseOcrTableStatement(doc: OcrDocument, spec: OcrStatementSpec): PdfParseOutcome {
  const lines = allLines(doc);
  const period = findPeriod(lines, spec);
  const fallbackYear = lines.join(" ").match(/\b(20\d{2})\b/)?.[1];
  const ctx: YearContext = { start: period.start, end: period.end, fallbackYear: fallbackYear ? Number(fallbackYear) : null };
  const counters: Counters = { skipped: 0, inheritedDate: 0, unreadableDate: 0, yearInferred: false, bfMismatch: 0 };
  const warnings: string[] = ["OCR read: verify every row against the original statement."];

  const tableResult = parseTables(doc, spec, ctx, counters);
  let drafts = tableResult.drafts;
  let usedFallback = false;
  if (drafts.length === 0) {
    drafts = parseLinesFallback(doc, spec, ctx, counters);
    usedFallback = drafts.length > 0;
  }

  if (drafts.length === 0) {
    return {
      ok: false,
      failure: {
        code: "no_transactions",
        bank: spec.bank,
        message: `${spec.bankName} statement recognised via OCR but no transaction rows were found.`,
      },
    };
  }

  if (usedFallback) {
    warnings.push(
      tableResult.sawHeader
        ? "The OCR table yielded no rows; rows were read from plain text lines instead (less reliable)."
        : "No transaction table was detected by OCR; rows were read from plain text lines instead (less reliable).",
    );
  }
  warnings.push(...new Set(tableResult.notes));
  if (counters.skipped > 0) warnings.push(`${counters.skipped} row(s) could not be read and were skipped.`);
  if (counters.unreadableDate > 0) warnings.push(`${counters.unreadableDate} row(s) had an unreadable date.`);
  if (counters.inheritedDate > 0) warnings.push(`${counters.inheritedDate} row(s) had no date and took the previous row's date.`);
  if (counters.yearInferred) warnings.push("Row dates without a year took the year from the statement period.");

  const currency = findCurrency(lines, spec.currencyDefault);
  const accountRef = findAccountRef(lines);
  const openingBalance = tableResult.opening ?? balanceFromLines(lines, spec.openingLabels, "first");
  const closingBalance = tableResult.closing ?? balanceFromLines(lines, spec.closingLabels, "last");
  if (openingBalance === null) warnings.push("Opening balance not found; the first row cannot be verified.");
  if (closingBalance === null) warnings.push("Closing balance not found; the statement total cannot be verified.");

  const transactions = toTransactions(drafts, { bank: spec.bank, accountRef, currency });
  const account = buildAccount({
    accountRef,
    currency,
    periodStart: period.start,
    periodEnd: period.end,
    openingBalance,
    closingBalance,
    transactions,
  });
  const rec = account.reconciliation;
  if (rec.status === "mismatch") {
    warnings.push(
      `Reconciliation mismatch: ${rec.brokenBalanceRows.length} row(s) break the running balance` +
        (rec.difference !== null ? `; opening + movements differs from the closing balance by ${rec.difference}.` : "."),
    );
  }

  return {
    ok: true,
    statement: { bank: spec.bank, bankName: spec.bankName, accounts: [account], warnings, source: "ocr" },
  };
}
