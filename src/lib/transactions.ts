import { createHash } from "node:crypto";
import { amountKey, normalizeDescription, transactionBaseKey } from "@/lib/transaction-keys";

export { normalizeDescription };

/**
 * Transaction fingerprinting for CSV / statement imports (server-only: uses
 * `node:crypto`). A fingerprint is the SHA-256 of the transaction's booked
 * date, signed amount, currency and normalised description, so re-importing
 * the same (or an overlapping) export produces the same fingerprints and the
 * `transactions` upsert (`unique (profile_id, fingerprint)`, migration 0022)
 * skips them instead of duplicating.
 *
 * Two genuinely identical payments on one day (same amount, same text) inside
 * ONE file must both be kept, so identical tuples within a batch get an
 * occurrence counter (`#0`, `#1`, …) mixed into the hash. A later import of the
 * same file reproduces the same counters, so it still dedupes exactly.
 */
export type ImportTransaction = {
  /** ISO YYYY-MM-DD. */
  date: string;
  /** Signed: positive = money in. */
  amount: number;
  description?: string;
  /**
   * Optional explicit occurrence number (see `occurrenceIndexes` in transaction-keys.ts). The import
   * dialog sends it when only a SELECTION of a file's rows is imported, so each row keeps the
   * fingerprint it has when the whole file is imported (and the duplicate check agrees).
   */
  occurrence?: number;
};

export type FingerprintedTransaction = ImportTransaction & {
  currency: string;
  description: string;
  fingerprint: string;
};

export function transactionFingerprint(
  tx: ImportTransaction,
  currency: string,
  occurrence = 0,
): string {
  return createHash("sha256")
    .update(
      [
        tx.date,
        amountKey(tx.amount),
        currency.trim().toUpperCase(),
        normalizeDescription(tx.description),
        occurrence,
      ].join("|"),
    )
    .digest("hex");
}

/** Fingerprints a whole batch, numbering identical tuples so they stay distinct. */
export function fingerprintTransactions(
  txs: ImportTransaction[],
  currency: string,
): FingerprintedTransaction[] {
  const seen = new Map<string, number>();
  return txs.map((tx) => {
    let occurrence: number;
    if (typeof tx.occurrence === "number" && Number.isInteger(tx.occurrence) && tx.occurrence >= 0) {
      occurrence = tx.occurrence;
    } else {
      const base = transactionBaseKey(tx);
      occurrence = seen.get(base) ?? 0;
      seen.set(base, occurrence + 1);
    }
    return {
      ...tx,
      currency: currency.trim().toUpperCase(),
      description: (tx.description ?? "").trim(),
      fingerprint: transactionFingerprint(tx, currency, occurrence),
    };
  });
}
