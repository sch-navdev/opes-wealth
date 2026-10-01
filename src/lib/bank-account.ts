/**
 * Bank accounts added from the "Cash & bank" card (the dedicated Add account
 * dialog). Checking / savings / term-deposit / other accounts are Cash assets;
 * a credit card is a debt, so it is stored as a standalone liability (balance
 * owed) and never inflates Cash.
 *
 * Metadata written on the asset (jsonb): `institution_name`, `bank_key` (the
 * registry key, absent for a bank outside the list), `account_type`,
 * `account_ref` (last digits / IBAN tail) and — for banks that have a CSV
 * statement profile — `bank_profile`, the same keys the statement importer
 * reads to route transactions to the right account.
 */
export const BANK_ACCOUNT_TYPES = ["checking", "savings", "credit_card", "term_deposit", "other"] as const;

export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export function isBankAccountType(value: unknown): value is BankAccountType {
  return typeof value === "string" && (BANK_ACCOUNT_TYPES as readonly string[]).includes(value);
}

/** Select value for a bank that isn't in the registry (the name is typed in). */
export const OTHER_BANK = "__other__";
