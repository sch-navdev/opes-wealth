/**
 * English texts of the company bank accounts feature (`cco_*`). The 9-language set lives in
 * `tmp-i18n-companycash.json` until it is merged into the i18n files; until a key is merged `t()` returns the
 * key itself and `useCompanyCashText` falls back to the English below (same pattern as `banking-brokerage-labels.ts`).
 */
export const COMPANY_CASH_EN = {
  cco_section_title: "Company cash",
  cco_section_desc:
    "Bank accounts held by your companies. They are part of your net worth, shown apart from the company's value (a company can be sold without its cash), and they are not counted as personal cash.",
  cco_summary_label: "Company cash",
  cco_summary_note: "In net worth, not personal cash",
  cco_accounts_count: "{n} accounts",
  cco_subtotal: "Subtotal",
  cco_no_accounts: "No bank account is linked to this company yet.",
  cco_add_account: "Add company bank account",
  cco_company_label: "Company (optional)",
  cco_company_none: "None: personal account",
  cco_company_hint:
    "A company account counts in your net worth but not as personal cash, emergency savings or personal expenses.",
  cco_link_change: "Change company",
  cco_link_title: "Link account to a company",
  cco_link_desc: "{account}: choose the company that holds this account, or make it a personal account again.",
  cco_link_save: "Save",
  cco_link_saving: "Saving...",
  cco_open_account: "Open account",
  cco_dash_line: "Company accounts",
  cco_dash_line_note: "{n} accounts, in net worth but not in personal cash",
  cco_dash_open: "See in Companies",
  cco_banking_heading: "Company accounts",
  cco_banking_company: "Company: {company}",
  cco_lookthrough_badge: "Company account",
  cco_err_signed_out: "You must be signed in.",
  cco_err_mfa: "Complete the two-step verification first.",
  cco_err_invalid: "Invalid request.",
  cco_err_account_not_found: "Cash account not found.",
  cco_err_company_not_found: "Company not found.",
  cco_err_co_owned: "A co-owned account cannot be linked to a company here.",
  cco_err_save_failed: "Could not save the change.",
} as const;

export type CompanyCashKey = keyof typeof COMPANY_CASH_EN;
