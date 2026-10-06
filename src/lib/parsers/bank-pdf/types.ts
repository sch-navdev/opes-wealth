/**
 * Types for the bank-statement PDF parsers (`src/lib/parsers/bank-pdf/`).
 *
 * A parser receives the TEXT of a statement (pdf-parse output; extraction itself is
 * server-side, see `src/lib/pdf-text.ts`) and returns a `PdfParseOutcome`. The modules are
 * pure and I/O-free so they run in Vitest on fixture text.
 *
 * Sign convention everywhere: `amount` is SIGNED, positive = money in, negative = money out
 * (the same convention as `NormalizedTx` in `lib/banking/csv-profiles.ts`).
 */

export type PdfBankId = "fab" | "wio" | "banque_populaire" | "hsbc_uae";

/**
 * One transaction as read from a statement. Named after the app's transaction-dedupe concept
 * (`lib/transactions.ts` hashes date|amount|currency|description into the stored fingerprint
 * with node:crypto, server-only); this type is the parser's standardized output and converts
 * to `ImportTransaction` by dropping the metadata (see `bridge.ts`).
 */
export type TransactionFingerprint = {
  bank: PdfBankId;
  /** Account identifier as printed (IBAN or account number); "" when the statement has none. */
  accountRef: string;
  /** ISO 4217 code of this account. */
  currency: string;
  /** Booking date, ISO YYYY-MM-DD. */
  date: string;
  /** Value date, ISO YYYY-MM-DD, null when the statement has no value-date column. */
  valueDate: string | null;
  /** Cleaned single-line label (what the CSV import would show). */
  description: string;
  /** The label exactly as extracted, continuation lines joined with a single space. */
  rawDescription: string;
  /** Signed amount in `currency`: positive = money in. */
  amount: number;
  /** Absolute debit amount (money out) or null. */
  debit: number | null;
  /** Absolute credit amount (money in) or null. */
  credit: number | null;
  /** Running balance after this transaction, null when the statement doesn't print one. */
  balance: number | null;
  /** Bank reference (e.g. Wio "P180166769"), null when absent. */
  reference: string | null;
  /** 0-based position of the transaction within the account's statement. */
  index: number;
};

export type ReconciliationStatus =
  /** opening + sum(amounts) equals the printed closing balance to the cent. */
  | "ok"
  /** The printed totals do not match the parsed rows: do NOT trust the parse blindly. */
  | "mismatch"
  /** Not enough printed figures (opening/closing) to check. */
  | "unverified";

export type Reconciliation = {
  status: ReconciliationStatus;
  openingBalance: number | null;
  closingBalance: number | null;
  /** opening + sum(amounts), null when there is no opening balance. */
  computedClosing: number | null;
  /** computedClosing - closingBalance, rounded to cents (0 when ok), null when unverified. */
  difference: number | null;
  /** Rows whose printed running balance disagrees with the previous balance + their amount. */
  brokenBalanceRows: number[];
};

export type PdfAccountStatement = {
  accountRef: string;
  currency: string;
  /** Statement period, ISO dates, null when not printed. */
  periodStart: string | null;
  periodEnd: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  transactions: TransactionFingerprint[];
  reconciliation: Reconciliation;
};

export type PdfStatement = {
  bank: PdfBankId;
  bankName: string;
  accounts: PdfAccountStatement[];
  /** Human-readable notes (skipped lines, reconciliation mismatches...). Never contain amounts of other accounts. */
  warnings: string[];
};

/** Why a PDF could not be turned into transactions. The UI maps each code to a translated message. */
export type PdfFailureCode =
  /** The PDF is password protected. */
  | "encrypted"
  /** Pages are images (scanned / printed-to-image): there is no text layer, OCR would be needed. */
  | "scanned"
  /** The bank is recognised but its statement body is not extractable text (image-only layout). */
  | "image_only"
  /** The file has a text layer but no known bank layout matched. */
  | "unsupported"
  /** A known bank layout matched but no transaction rows were found. */
  | "no_transactions"
  /** The file is not a readable PDF (corrupt, wrong type, empty). */
  | "unreadable"
  /** Larger than the accepted size. */
  | "too_large";

export type PdfParseFailure = {
  code: PdfFailureCode;
  /** Set when the bank was recognised (`image_only`, `no_transactions`). */
  bank?: PdfBankId;
  /** Developer-facing English message (the UI shows the translated one for `code`). */
  message: string;
};

export type PdfParseOutcome =
  | { ok: true; statement: PdfStatement }
  | { ok: false; failure: PdfParseFailure };

/** A bank profile: fingerprint + parser. One file per bank in `src/lib/parsers/bank-pdf/`. */
export type BankPdfProfile = {
  id: PdfBankId;
  name: string;
  /** True when the text is recognisably this bank's statement (cheap, order-independent substring checks). */
  detect: (text: string) => boolean;
  /** Parses the text; only called after `detect` returned true. */
  parse: (text: string) => PdfParseOutcome;
};
