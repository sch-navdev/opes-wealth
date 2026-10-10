/**
 * English texts of the stale-balance marker (`bank_asof_*`) and the Brokerage page (`brokerage_page_*`,
 * `nav_brokerage`). The full 9-language set lives in `tmp-i18n-banking.json` until it is merged into
 * the i18n files; until a key is merged `t()` returns the key itself and `useBankingText` falls back to
 * the English below, so the UI never shows raw keys (same pattern as `cash-flow-labels.ts`).
 */
export const BANKING_EN = {
  nav_brokerage: "Brokerage",
  bank_asof_label: "Balance as of {date}",
  bank_asof_unknown: "Balance date unknown",
  bank_asof_stale: "Stale: {n} days old",
  bank_asof_group_stale: "{n} out of date",
  back_to_banking: "Back to Banking",
  tx_edit: "Edit transaction",
  tx_delete: "Delete transaction",
  tx_delete_title: "Delete this transaction?",
  tx_delete_body: "Only this transaction is removed. The recorded balances do not change. Importing the same statement again would add it back unless you untick it in the preview.",
  tx_save: "Save",
  tx_cancel: "Cancel",
  tx_edit_date: "Date",
  tx_edit_desc: "Description",
  tx_edit_amount: "Amount (negative = money out)",
  tx_action_failed: "Could not save the change: {error}",
  bank_detail_total: "Total balance of this bank",
  bank_detail_accounts: "Accounts ({n})",
  bank_detail_analyse: "Open account and analyse",
  bank_detail_transactions: "Transactions of all accounts",
  bank_detail_filter: "Account",
  bank_detail_all_accounts: "All accounts",
  bank_detail_no_transactions: "No transactions stored for these accounts yet. Import a statement to see them.",
  bank_detail_more: "Show more ({n})",
  bank_detail_truncated: "Only the most recent transactions are listed here; open an account for its full history.",
  bank_show_closed: "Show closed accounts ({n})",
  bank_hide_closed: "Hide closed accounts",
  bank_closed_badge: "Closed {date}",
  bank_asof_legend:
    "Each balance shows the date it is as of. A balance more than one month (31 days) old is shown in red and marked Stale: import a newer statement or refresh the account.",
  brokerage_page_title: "Brokerage",
  brokerage_page_subtitle: "Your brokerage accounts and their holdings, valued in your Base Currency.",
  brokerage_page_total: "Total brokerage value",
  brokerage_page_accounts_count: "{n} accounts",
  brokerage_page_account_holdings: "{n} holdings",
  brokerage_page_other_account: "Other holdings",
  brokerage_page_prices_updated: "Prices updated {date}",
  brokerage_page_prices_unknown: "Prices not refreshed yet",
  brokerage_page_empty: "No brokerage accounts yet.",
  brokerage_page_empty_hint:
    "Import a broker trade file (Add Investments on the dashboard) and your accounts and holdings appear here.",
  brokerage_page_to_dashboard: "Go to the dashboard",
} as const;

export type BankingKey = keyof typeof BANKING_EN;
