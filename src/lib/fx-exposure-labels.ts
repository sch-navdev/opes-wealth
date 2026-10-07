/**
 * English texts of the Global exposure (FX) bar (`fxbar_*`). The full 9-language set lives in
 * .tmp-fxbar-keys.json until it is merged into the i18n files; until a key is merged `t()` returns the key
 * itself and `useFxBarText` falls back to the English below, so the UI never shows raw keys.
 */
export const FXBAR_EN = {
  "fxbar_title": "Global exposure",
  "fxbar_subtitle": "How your net worth is spread across the currencies you hold",
  "fxbar_base_group": "Base currency",
  "fxbar_base_chip_aria": "Show amounts in {currency}",
  "fxbar_more": "Other currencies",
  "fxbar_net_worth": "Net worth",
  "fxbar_international": "International exposure",
  "fxbar_international_desc": "Share of net worth held in currencies other than {currency}",
  "fxbar_expand": "Show details",
  "fxbar_collapse": "Hide details",
  "fxbar_peg_label": "Group AED and USD (pegged)",
  "fxbar_peg_hint": "The dirham is pegged to the US dollar at 3.6725, so the two are shown as one block.",
  "fxbar_distribution_aria": "Share of net worth by holding currency",
  "fxbar_breakdown_title": "Net assets by currency",
  "fxbar_breakdown_desc": "Net position per holding currency, shown in {currency}, with its share of net worth.",
  "fxbar_exposure_title": "Assets and liabilities by currency",
  "fxbar_col_currency": "Currency",
  "fxbar_col_assets": "Assets",
  "fxbar_col_liabilities": "Liabilities",
  "fxbar_col_net": "Net position",
  "fxbar_col_share": "Share",
  "fxbar_total": "Total",
  "fxbar_base_tag": "Base",
  "fxbar_concentrated": "Concentrated in {currency}: {share} of net worth",
  "fxbar_hedge_label": "About natural hedging",
  "fxbar_hedge_text": "A liability in a currency offsets assets held in that same currency, so the net position can be smaller than the assets alone. This is information, not a recommendation.",
  "fxbar_gross_note": "Net worth is zero or negative, so shares are based on gross exposure (assets plus liabilities).",
  "fxbar_no_liabilities": "No liabilities recorded: the net position equals the assets in every currency.",
  "fxbar_empty": "No holdings to show yet."
} as const;

export type FxBarKey = keyof typeof FXBAR_EN;
