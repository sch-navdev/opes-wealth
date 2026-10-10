/**
 * Pure helpers behind the multi-file statement import (`components/bank-statement-batch.tsx`) and
 * shared with the single-file dialog: file classification, the file cap, the OCR page estimate, the
 * chronological import order, and the WITHIN-BATCH duplicate / overlap check. No I/O, no React.
 */
import { computeRunningBalance, type ParsedBankCsvRow, type ParsedTransactionRow } from "@/lib/bank-csv";
import { accountTail, routeGroup, type BankProfileId, type RoutableAccount, type StatementGroup } from "@/lib/banking/csv-profiles";
import { skipKey } from "@/lib/banking/skipped-accounts";
import { occurrenceIndexes, transactionBaseKey } from "@/lib/transaction-keys";

/** Most files one batch accepts; the rest of a larger selection is dropped with a message. */
export const MAX_BATCH_FILES = 30;
/** Textract pages assumed for a scanned statement whose page count is not known (a typical statement). */
export const OCR_PAGES_PER_STATEMENT = 3;
/** Per-file size limit of the PDF reader (same as `readBankStatementPdf`). */
export const MAX_STATEMENT_PDF_BYTES = 5 * 1024 * 1024;

/** Target value meaning "do not import this group". */
export const NONE = "__none__";
/** Target value meaning "create a new Cash account for this group when importing". */
export const NEW = "__new__";

export type StatementTargetAccount = RoutableAccount & { nativeValue: number };

export type GroupState = {
  target: string;
  remember: boolean;
  /** Pre-selected because it is the only Cash account in the group's currency (and no other bank / account number). */
  autoPicked?: boolean;
  /** Left out because the user chose "never import this account" earlier; the dialog says so and offers to change it. */
  skippedByPreference?: boolean;
  /** The user ticked "never import this account" on this import. */
  neverImport?: boolean;
};

export type BatchFileKind = "csv" | "pdf" | "unsupported";

/** `.pdf` is read on the server, `.csv` / `.txt` on the client, anything else is not a statement file. */
export function classifyFile(name: string): BatchFileKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return "csv";
  return "unsupported";
}

export type BatchStatus =
  | "queued"
  | "reading"
  | "ready"
  | "needs_password"
  | "needs_ocr"
  | "unsupported"
  | "not_statement"
  | "failed";

/** Applies the file cap: the files kept and how many were dropped. */
export function capFiles<T>(files: T[], max = MAX_BATCH_FILES): { kept: T[]; dropped: number } {
  return { kept: files.slice(0, max), dropped: Math.max(0, files.length - max) };
}

/** Estimated Textract pages for scanned statements: the known page count, else about 3 per statement. */
export function estimateOcrPages(files: { pages?: number }[]): number {
  return files.reduce((n, f) => n + (f.pages && f.pages > 0 ? f.pages : OCR_PAGES_PER_STATEMENT), 0);
}

/** Rows → one balance point per day: the file's own running balance when every row has one, else derived from the amounts anchored on the account's current balance (same rule as the single-account CSV import). */
export function toBalanceRows(group: StatementGroup, currentValue: number): ParsedBankCsvRow[] {
  const sorted = [...group.rows].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length > 0 && sorted.every((r) => r.balance !== null)) {
    const byDate = new Map<string, ParsedBankCsvRow>();
    for (const r of sorted) {
      // Later rows of the same day overwrite: the last balance is the day's closing balance.
      byDate.set(r.date, { recorded_date: r.date, value: r.balance as number, description: r.description || undefined });
    }
    return Array.from(byDate.values());
  }
  const transactions: ParsedTransactionRow[] = sorted.map((r) => ({
    recorded_date: r.date,
    amount: r.amount,
    description: r.description || undefined,
  }));
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  const starting = Math.round((currentValue - total) * 100) / 100;
  return computeRunningBalance(transactions, starting);
}

/** A group's rows as import / check payload (same order as the file, which is what the fingerprint occurrence numbering uses). */
export function toImportTx(group: StatementGroup) {
  return group.rows.map((r) => ({ date: r.date, amount: r.amount, description: r.description }));
}

/** Initial target of a group: remembered route first, else the only Cash account in the group's currency (never a guess between several). */
export function initialGroupState(
  group: StatementGroup,
  id: BankProfileId,
  accounts: RoutableAccount[],
  skipped?: ReadonlySet<string>,
): GroupState {
  const route = routeGroup(group, id, accounts);
  if (route.kind === "matched") return { target: route.assetId, remember: true };
  const key = skipKey(id, group);
  if (key && skipped?.has(key)) return { target: NONE, remember: false, skippedByPreference: true, neverImport: true };
  // Only an account that could be this one: it carries no other bank's layout and no other account number.
  const tail = accountTail(group.accountRef);
  const candidates = accounts.filter(
    (a) =>
      a.currency.toUpperCase() === group.currency.toUpperCase() &&
      (!a.bankProfile || a.bankProfile === id) &&
      (!a.accountRef || !tail || accountTail(a.accountRef) === tail),
  );
  if (candidates.length === 1) return { target: candidates[0].id, remember: true, autoPicked: true };
  // A recognised statement for an account Opes does not have yet: offer to create it, never to guess another bank's account.
  if (id && tail) return { target: NEW, remember: true };
  return { target: NONE, remember: true };
}

/** The dates a group covers: its rows, else its printed balances. */
export function groupPeriod(group: StatementGroup): { start: string; end: string } | null {
  const dates = [...group.rows.map((r) => r.date), ...(group.balances ?? []).map((b) => b.date)].sort();
  return dates.length > 0 ? { start: dates[0], end: dates[dates.length - 1] } : null;
}

/**
 * Anchor balances for the groups of ONE target account that have no running balance of their own,
 * walking from the newest statement back (the newest ends on the account's current value, each older
 * one ends where the next one starts). Returns the balance rows per group key.
 * `groups` must be given oldest first.
 */
export function chainBalanceRows(
  groups: { key: string; group: StatementGroup }[],
  currentValue: number,
): Map<string, ParsedBankCsvRow[]> {
  const out = new Map<string, ParsedBankCsvRow[]>();
  let anchor = currentValue;
  for (let i = groups.length - 1; i >= 0; i--) {
    const { key, group } = groups[i];
    const rows = toBalanceRows(group, anchor);
    out.set(key, rows);
    if (rows.length > 0) {
      const sorted = [...group.rows].sort((a, b) => a.date.localeCompare(b.date));
      const total = sorted.reduce((s, r) => s + r.amount, 0);
      const ownBalances = sorted.length > 0 && sorted.every((r) => r.balance !== null);
      anchor = ownBalances
        ? Math.round(((sorted[0].balance as number) - sorted[0].amount) * 100) / 100
        : Math.round((anchor - total) * 100) / 100;
    }
  }
  return out;
}

export type BatchGroupInput = {
  /** Unique key of the group, e.g. "3:0" (file 3, group 0). */
  key: string;
  fileId: number;
  fileName: string;
  /** Target account id (or a `new:` key shared by groups that will create the SAME new account); null = not imported. */
  targetKey: string | null;
  start: string | null;
  end: string | null;
  rows: { date: string; amount: number; description?: string }[];
};

export type BatchGroupCheck = {
  /** Per row: the same payment already appears in an EARLIER statement of this batch for the same account. */
  duplicate: boolean[];
  /** Other files whose period overlaps this one for the same account. */
  overlapWith: string[];
};

/** Oldest statement period first (start, then end, then file order): the order the batch is imported in. */
export function chronologicalOrder<T extends { start: string | null; end: string | null; fileId: number }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      (a.start ?? "9999").localeCompare(b.start ?? "9999") ||
      (a.end ?? "9999").localeCompare(b.end ?? "9999") ||
      a.fileId - b.fileId,
  );
}

/**
 * WITHIN-BATCH duplicate check, on top of the stored-transaction check. For every group routed to the same
 * account, in chronological order, a row is a duplicate when an earlier statement of the batch already holds
 * the same date + amount + description (compared like the stored fingerprint: normalised description, and
 * counted, so two genuinely identical payments in ONE file both survive while an overlapping statement's
 * copy of them does not). Groups of one file are never compared with each other. Also lists, per group, the
 * other files whose period overlaps it for the same account.
 */
export function findBatchDuplicates(groups: BatchGroupInput[]): Map<string, BatchGroupCheck> {
  const result = new Map<string, BatchGroupCheck>();
  const seen = new Map<string, Map<string, number>>();
  const processed: BatchGroupInput[] = [];

  for (const g of chronologicalOrder(groups)) {
    const check: BatchGroupCheck = { duplicate: g.rows.map(() => false), overlapWith: [] };
    result.set(g.key, check);
    if (g.targetKey === null) continue;

    const counts = seen.get(g.targetKey) ?? new Map<string, number>();
    const occurrences = occurrenceIndexes(g.rows);
    const own = new Map<string, number>();
    g.rows.forEach((row, j) => {
      const base = transactionBaseKey(row);
      // An earlier FILE holds this payment at least occurrence+1 times: this copy is a repeat of it.
      check.duplicate[j] = occurrences[j] < (counts.get(base) ?? 0);
      own.set(base, Math.max(own.get(base) ?? 0, occurrences[j] + 1));
    });
    for (const [base, n] of own) counts.set(base, Math.max(counts.get(base) ?? 0, n));
    seen.set(g.targetKey, counts);

    for (const other of processed) {
      if (other.targetKey !== g.targetKey || other.fileId === g.fileId) continue;
      if (!g.start || !g.end || !other.start || !other.end) continue;
      if (g.start <= other.end && other.start <= g.end && !check.overlapWith.includes(other.fileName)) {
        check.overlapWith.push(other.fileName);
        const otherCheck = result.get(other.key);
        if (otherCheck && !otherCheck.overlapWith.includes(g.fileName)) otherCheck.overlapWith.push(g.fileName);
      }
    }
    processed.push(g);
  }
  return result;
}
