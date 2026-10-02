import { createHash } from "node:crypto";

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
};

export type FingerprintedTransaction = ImportTransaction & {
  currency: string;
  description: string;
  fingerprint: string;
};

/** Lower-cases, strips accents, collapses whitespace and long reference digits' spacing so cosmetic export differences don't change the hash. */
export function normalizeDescription(raw: string | undefined): string {
  return (raw ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Amount as a fixed 2-decimal string, with -0 normalised, so 12.5 and 12.50 hash alike. */
function amountKey(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(2);
}

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
    const base = `${tx.date}|${amountKey(tx.amount)}|${normalizeDescription(tx.description)}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return {
      ...tx,
      currency: currency.trim().toUpperCase(),
      description: (tx.description ?? "").trim(),
      fingerprint: transactionFingerprint(tx, currency, occurrence),
    };
  });
}
