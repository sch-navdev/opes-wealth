/**
 * "Never import this account" preference of the statement import. An account is identified by the
 * bank layout, the last four characters of the account reference printed on the statement and its
 * currency, e.g. `wio|1317|AED`. Stored per device in localStorage (like the other import
 * preferences): the import dialog reads it to leave those accounts out and to say so.
 */
import { accountTail, type BankProfileId } from "@/lib/banking/csv-profiles";

export const SKIPPED_ACCOUNTS_STORAGE_KEY = "opes-stmt-skipped-accounts";

/** Stable key of a statement account, or null when the statement carries no account reference (nothing to recognise it by). */
export function skipKey(profileId: BankProfileId | "", group: { accountRef: string; currency: string }): string | null {
  const tail = accountTail(group.accountRef);
  if (!profileId || tail.length < 3) return null;
  return `${profileId}|${tail}|${group.currency.toUpperCase()}`;
}

export function readSkippedAccounts(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SKIPPED_ACCOUNTS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Adds or removes one account from the preference; returns the new set (unchanged when storage is unavailable). */
export function setAccountSkipped(key: string, skipped: boolean): Set<string> {
  const set = readSkippedAccounts();
  if (skipped) set.add(key);
  else set.delete(key);
  try {
    window.localStorage.setItem(SKIPPED_ACCOUNTS_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Private mode / blocked storage: the preference simply is not kept.
  }
  return set;
}
