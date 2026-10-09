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
