/**
 * Helpers shared by every bank PDF profile: cent arithmetic, month tables, and the
 * reconciliation that proves a parse is complete (opening + movements = closing, and
 * every printed running balance follows from the previous one).
 */
import type { PdfAccountStatement, Reconciliation, TransactionFingerprint } from "./types";

export const CENT = 0.005;

/** Rounds to 2 decimals (cents), normalising -0. */
export function roundMoney(n: number): number {
  const r = Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

export function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) < CENT;
}

/** Valid calendar date -> ISO, else null. */
export function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** English three-letter month (any case) -> 1..12. */
export const EN_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Collapses whitespace runs to single spaces and trims. */
export function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Builds the debit/credit/amount fields from a signed amount. */
export function moneyFields(amount: number): Pick<TransactionFingerprint, "amount" | "debit" | "credit"> {
  const a = roundMoney(amount);
  return { amount: a, debit: a < 0 ? roundMoney(-a) : null, credit: a > 0 ? a : null };
}

/**
 * Checks a parsed account: (1) every row that carries a running balance must equal the
 * previous balance (the opening balance for the first) plus its amount; (2) opening + all
 * amounts must equal the printed closing balance. Returns the reconciliation record the
 * UI shows ("verified to the cent") and tests assert on.
 */
export function reconcile(
  openingBalance: number | null,
  closingBalance: number | null,
  transactions: TransactionFingerprint[],
): Reconciliation {
  const brokenBalanceRows: number[] = [];
  let previous = openingBalance;
  transactions.forEach((tx, i) => {
    if (tx.balance !== null && previous !== null && !sameMoney(previous + tx.amount, tx.balance)) {
      brokenBalanceRows.push(i);
    }
    previous = tx.balance !== null ? tx.balance : previous !== null ? roundMoney(previous + tx.amount) : null;
  });

  const sum = roundMoney(transactions.reduce((s, t) => s + t.amount, 0));
  const computedClosing = openingBalance === null ? null : roundMoney(openingBalance + sum);
  if (computedClosing === null || closingBalance === null) {
    return {
      status: brokenBalanceRows.length > 0 ? "mismatch" : "unverified",
      openingBalance,
      closingBalance,
      computedClosing,
      difference: null,
      brokenBalanceRows,
    };
  }
  const difference = roundMoney(computedClosing - closingBalance);
  return {
    status: sameMoney(difference, 0) && brokenBalanceRows.length === 0 ? "ok" : "mismatch",
    openingBalance,
    closingBalance,
    computedClosing,
    difference,
    brokenBalanceRows,
  };
}

/** Assembles an account record with its reconciliation. */
export function buildAccount(input: {
  accountRef: string;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  transactions: TransactionFingerprint[];
  closedOn?: string | null;
  accountName?: string;
  openedOn?: string;
  parentRef?: string;
}): PdfAccountStatement {
  return { ...input, reconciliation: reconcile(input.openingBalance, input.closingBalance, input.transactions) };
}
