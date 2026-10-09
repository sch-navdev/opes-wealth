/**
 * English texts of the private-market liquidity UI (the cash-flow ledger editor and the Expert liquidity
 * panel). The full 9-language set lives in tmp-i18n-pe-ledger.json until it is merged into the i18n files;
 * until a key is merged `t()` returns the key itself and `usePeLiquidityText` falls back to the English below,
 * so the UI never shows raw keys. The three `pe_*` validation codes are also the keys of their messages.
 */
export const PEL_EN = {
  // validation codes from lib/private-equity.ts
  "pe_paid_date_invalid": "A paid capital call needs a valid payment date.",
  "pe_ledger_too_long": "A ledger can hold at most 200 rows.",
  "pe_actual_distribution_invalid": "Each distribution needs a valid date and an amount above zero.",

  // ledger editor
  "pel_ledger_heading": "Cash-flow ledger",
  "pel_ledger_hint": "Record the capital calls you have paid and the distributions you have received, with their dates. Actual cash flows only: projections stay in the fund form.",
  "pel_col_type": "Type",
  "pel_col_date": "Date",
  "pel_col_amount": "Amount",
  "pel_col_kind": "Kind",
  "pel_type_call": "Paid call",
  "pel_type_distribution": "Distribution",
  "pel_kind_income": "Income",
  "pel_kind_return_of_capital": "Return of capital",
  "pel_kind_gain": "Gain",
  "pel_add_call": "Add paid call",
  "pel_add_distribution": "Add distribution",
  "pel_edit_row": "Edit",
  "pel_remove_row": "Remove",
  "pel_row_edit_aria": "Edit the {type} dated {date}",
  "pel_row_remove_aria": "Remove the {type} dated {date}",
  "pel_save_row": "Save",
  "pel_cancel_row": "Cancel",
  "pel_date_label_call": "Date paid",
  "pel_date_label_distribution": "Date received",
  "pel_amount_label": "Amount ({currency})",
  "pel_kind_label": "Kind of distribution",
  "pel_empty_ledger": "No paid calls or distributions recorded yet.",
  "pel_legacy_note": "This fund has an undated distributions total of {amount}. Once you add dated distributions, they replace that total.",
  "pel_pending_note": "Capital calls that are still pending are managed in the fund form and are not listed here.",
  "pel_saving": "Saving…",
  "pel_saved": "Ledger saved.",

  // Expert liquidity panel
  "dlayout_block_expertLiquidity": "Private-market liquidity",
  "pel_title": "Private-market liquidity",
  "pel_desc": "Paid-in capital, unfunded commitment and return ratios per fund, from the dated ledger. Amounts in {currency}.",
  "pel_col_fund": "Fund",
  "pel_col_paid_in": "Paid-in",
  "pel_col_unfunded": "Unfunded",
  "pel_col_nav": "NAV",
  "pel_col_distributed": "Distributed",
  "pel_col_dpi": "DPI",
  "pel_col_rvpi": "RVPI",
  "pel_col_tvpi": "TVPI",
  "pel_col_net_irr": "Net IRR",
  "pel_total": "Portfolio",
  "pel_empty": "No private equity funds yet.",
  "pel_na": "Not available",
  "pel_irr_no_paid_in": "Not available: nothing has been paid in yet.",
  "pel_irr_undated_flows": "Not available: some cash flows have no date.",
  "pel_irr_no_solution": "Not available: the cash flows do not give a return rate.",
  "pel_undated_note": "{n} fund(s) with undated cash flows are left out of the portfolio net IRR.",
  "pel_note": "Actuals only: projected distributions are not included. DPI, RVPI and TVPI are measured on paid-in capital; net IRR uses the dated flows with the NAV as the final value. Portfolio ratios come from the summed amounts, not an average of the funds.",
  "pel_upcoming_title": "Capital calls due in the next 12 months",
  "pel_upcoming_empty": "No capital calls due in the next 12 months.",
  "pel_upcoming_total": "Total due: {amount}",
  "pel_overdue": "Overdue",
} as const;

export type PelKey = keyof typeof PEL_EN;
