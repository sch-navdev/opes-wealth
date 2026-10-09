/**
 * View-model for the transaction details drawer (`components/transaction-details-sheet.tsx`).
 *
 * Three producers feed it, each knowing a different amount of metadata:
 *  - a stored `transactions` row (date, amount, currency, description, source, fingerprint, created_at);
 *  - a parsed PDF `TransactionFingerprint` (adds value date, original label, reference, balance, bank, account);
 *  - a CSV `NormalizedTx` (date, description, amount, balance).
 * Pure and I/O-free so it is unit-testable.
 */
import type { TransactionFingerprint } from "@/lib/parsers/bank-pdf/types";

export type TransactionDetail = {
  /** Booking date, ISO YYYY-MM-DD. */
  date: string;
  valueDate?: string | null;
  /** Cleaned single-line label. */
  description: string;
  /** The label exactly as the bank printed it (PDF `rawDescription`). */
  originalLabel?: string | null;
  /** Signed: positive = money in. */
  amount: number;
  currency: string;
  /** Running balance after this transaction. */
  balance?: number | null;
  reference?: string | null;
  /** Display name of the bank (or its id when no name is known). */
  bank?: string | null;
  /** Account identifier as printed (IBAN / account number); the drawer shows its tail only. */
  accountRef?: string | null;
  /** `transactions.source` ("csv_import", "pdf_import", ...). */
  source?: string | null;
  /** Name of the statement file the transaction was imported from (migration 0041), when known. */
  sourceFile?: string | null;
  /** Full SHA-256 content fingerprint of the stored row. */
  fingerprint?: string | null;
  /** ISO timestamp of the import (`transactions.created_at`). */
  importedAt?: string | null;
  /** 0-based position within the statement. */
  index?: number | null;
};

/** A stored `transactions` row as selected by the asset page (numeric columns may arrive as strings). */
export type StoredTransactionRow = {
  booked_date: string;
  amount: number | string;
  currency: string;
  description: string | null;
  source: string | null;
  fingerprint: string | null;
  created_at: string | null;
  /** Imported file name; absent until migration 0041 is applied. */
  source_file?: string | null;
};

export function detailFromRow(row: StoredTransactionRow): TransactionDetail {
  return {
    date: row.booked_date,
    description: row.description ?? "",
    amount: Number(row.amount),
    currency: row.currency,
    source: row.source,
    sourceFile: row.source_file ?? null,
    fingerprint: row.fingerprint,
    importedAt: row.created_at,
  };
}

export function detailFromFingerprint(
  tx: TransactionFingerprint,
  opts: { bankName?: string; source?: string; sourceFile?: string } = {},
): TransactionDetail {
  return {
    date: tx.date,
    valueDate: tx.valueDate,
    description: tx.description,
    originalLabel: tx.rawDescription,
    amount: tx.amount,
    currency: tx.currency,
    balance: tx.balance,
    reference: tx.reference,
    bank: opts.bankName ?? tx.bank,
    accountRef: tx.accountRef,
    source: opts.source ?? "pdf_import",
    sourceFile: opts.sourceFile ?? null,
    index: tx.index,
  };
}

export function detailFromNormalized(
  tx: { date: string; description: string; amount: number; balance: number | null },
  opts: { currency: string; bankName?: string; accountRef?: string; source?: string; sourceFile?: string },
): TransactionDetail {
  return {
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    currency: opts.currency,
    balance: tx.balance,
    bank: opts.bankName ?? null,
    accountRef: opts.accountRef || null,
    source: opts.source ?? "csv_import",
    sourceFile: opts.sourceFile ?? null,
  };
}

/** First `length` characters of a fingerprint (lower-case hex), "" when absent. */
export function shortFingerprint(fingerprint: string | null | undefined, length = 8): string {
  if (!fingerprint) return "";
  return fingerprint.slice(0, Math.max(1, length));
}

/** Last four alphanumerics of an account reference ("AE07 0331 1234 5678" -> "5678"), "" when there are none. */
export function accountTail(ref: string | null | undefined): string {
  if (!ref) return "";
  return ref.replace(/[^0-9A-Za-z]/g, "").slice(-4);
}

export type SourceKind = "csv" | "pdf" | "other";

export function sourceKind(source: string | null | undefined): SourceKind {
  if (!source) return "other";
  if (source.startsWith("csv")) return "csv";
  if (source.startsWith("pdf")) return "pdf";
  return "other";
}

export type AmountDirection = "in" | "out" | "zero";

export function amountDirection(amount: number): AmountDirection {
  return amount > 0 ? "in" : amount < 0 ? "out" : "zero";
}
