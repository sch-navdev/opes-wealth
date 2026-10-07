/**
 * Client-safe building blocks of the transaction fingerprint (no `node:crypto`, so the import
 * dialog can use them). `lib/transactions.ts` hashes these same keys on the server, so the
 * preview's idea of "identical rows" and of the occurrence number is, by construction, the one the
 * stored fingerprints use.
 */
export type TransactionKeyInput = {
  /** ISO YYYY-MM-DD. */
  date: string;
  /** Signed: positive = money in. */
  amount: number;
  description?: string;
};

/** Lower-cases, strips accents, collapses whitespace so cosmetic export differences don't change the hash. */
export function normalizeDescription(raw: string | undefined): string {
  return (raw ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Amount as a fixed 2-decimal string, with -0 normalised, so 12.5 and 12.50 hash alike. */
export function amountKey(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(2);
}

/** What makes two rows "the same payment" before the occurrence counter is applied (currency is per account, so not part of it). */
export function transactionBaseKey(tx: TransactionKeyInput): string {
  return `${tx.date}|${amountKey(tx.amount)}|${normalizeDescription(tx.description)}`;
}

/**
 * Occurrence number of each row among the rows sharing its base key, in input order (0 for the
 * first, 1 for the next identical one, ...). Exactly the counter `fingerprintTransactions` mixes
 * into the hash when no explicit occurrence is given.
 */
export function occurrenceIndexes(txs: TransactionKeyInput[]): number[] {
  const seen = new Map<string, number>();
  return txs.map((tx) => {
    const key = transactionBaseKey(tx);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return n;
  });
}

/** Per row: true when another row of the same list has the same base key (identical date, amount and text). */
export function identicalWithinList(txs: TransactionKeyInput[]): boolean[] {
  const counts = new Map<string, number>();
  const keys = txs.map((tx) => transactionBaseKey(tx));
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return keys.map((k) => (counts.get(k) ?? 0) > 1);
}
