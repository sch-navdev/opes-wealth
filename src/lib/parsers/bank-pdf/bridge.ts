/**
 * Bridges parsed PDF statements into the existing CSV-import pipeline types.
 */
import type { ParsedCsvFile } from "@/components/csv-dropzone";
import { getBankProfile, type NormalizedTx, type StatementGroup, type StatementParseResult } from "@/lib/banking/csv-profiles";
import type { ImportTransaction } from "@/lib/transactions";
import type { PdfAccountStatement, PdfBankId, PdfStatement } from "./types";

/** PDF bank id -> bank profile id. hsbc_uae and cbi have PDF-only profiles (no CSV columns). */
const PROFILE_ID: Record<PdfBankId, string> = {
  fab: "fab",
  wio: "wio",
  banque_populaire: "banque_populaire",
  hsbc_uae: "hsbc_uae",
  cbi: "cbi",
  cbd: "cbd",
  hsbc_uae_card: "hsbc_uae_card",
};

export function statementToParseResult(statement: PdfStatement): StatementParseResult {
  const profile = getBankProfile(PROFILE_ID[statement.bank] ?? "");
  if (!profile) throw new Error(`No bank profile for PDF bank "${statement.bank}"`);

  const groups: StatementGroup[] = statement.accounts.map((a) => ({
    accountRef: a.accountRef,
    currency: a.currency,
    rows: a.transactions.map(
      (t): NormalizedTx => ({ date: t.date, description: t.description, amount: t.amount, balance: t.balance }),
    ),
  }));

  return {
    profile,
    delimiter: "",
    groups,
    errors: statement.warnings.map((message) => ({ line: 0, message })),
    skipped: 0,
  };
}

function plain(n: number | null): string {
  return n === null ? "" : n.toFixed(2);
}

export function statementAccountToCsvFile(
  statement: PdfStatement,
  accountIndex: number,
  fileName: string,
): ParsedCsvFile {
  const account = statement.accounts[accountIndex];
  if (!account) throw new Error(`No account at index ${accountIndex}`);
  return {
    fileName,
    headers: ["Date", "Description", "Debit", "Credit", "Balance"],
    rows: account.transactions.map((t) => ({
      Date: t.date,
      Description: t.description,
      Debit: plain(t.debit),
      Credit: plain(t.credit),
      Balance: plain(t.balance),
    })),
  };
}

export function toImportTransactions(account: PdfAccountStatement): ImportTransaction[] {
  return account.transactions.map((t) => ({ date: t.date, amount: t.amount, description: t.description }));
}
