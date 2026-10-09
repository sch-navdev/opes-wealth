/**
 * English texts of the SCPI tracking UI (`scpi2_*`). The full 9-language set lives in
 * tmp-i18n-scpi.json until it is merged into the i18n files; until a key is merged `t()` returns the
 * key itself and `useScpiText` falls back to the English below, so the UI never shows raw keys.
 * The `scpi2_err_*` validation codes are also the keys of their messages (see lib/scpi.ts).
 */
export const SCPI2_EN = {
  // validation codes from lib/scpi.ts
  "scpi2_err_subscription_date": "The subscription date is not a valid date.",
  "scpi2_err_jouissance_date": "The date income starts is not a valid date.",
  "scpi2_err_jouissance_before_subscription": "Income cannot start before the subscription date.",
  "scpi2_err_revalorisation_invalid": "Each revalorisation needs a valid date and a price above zero.",
  "scpi2_err_revalorisations_too_many": "At most 20 revalorisations can be recorded.",
  "scpi2_err_indicator_invalid": "Each indicator entry needs a valid date and at least one value above zero.",
  "scpi2_err_indicators_too_many": "At most 60 indicator entries can be recorded.",
  "scpi2_err_register_too_long": "The share numbers can hold at most 500 characters.",

  // name combobox
  "scpi2_name_placeholder": "Search an SCPI by name or management company",
  "scpi2_name_search": "Type to search…",
  "scpi2_name_empty": "No SCPI found in the catalog.",
  "scpi2_name_manual": "Not listed, add manually",
  "scpi2_name_manual_label": "Name of the SCPI",
  "scpi2_name_manual_hint": "This name is saved as typed and marked as unverified.",
  "scpi2_name_back": "Choose from the catalog instead",
  "scpi2_verified": "Verified name",
  "scpi2_catalog_checked": "Name and management company checked on {date} against the management company's own site.",
  "scpi2_ref_offer": "The catalog holds prices for this SCPI as of {date}: subscription {subscription}, withdrawal {withdrawal}. Source: {source}",
  "scpi2_ref_apply": "Use these prices",
  "scpi2_ref_dismiss": "Not now",

  // specifications
  "scpi2_subscription_date": "Subscription date",
  "scpi2_enjoyment_delay": "Delay before income starts",
  "scpi2_months": "{months} months",
  "scpi2_register": "Share numbers",
  "scpi2_register_hint": "Free text, for example the share register numbers from your subscription form.",
  "scpi2_reval_heading": "Revalorisations",
  "scpi2_reval_hint": "Each time the management company changes the per-share price, add the new price and its date. The change is calculated from the previous price.",
  "scpi2_reval_add": "Add revalorisation",
  "scpi2_reval_price": "New price per share",
  "scpi2_reval_date": "Effective date",
  "scpi2_reval_total": "Total revalorisation",
  "scpi2_reval_current": "Current subscription price (MDS)",
  "scpi2_ind_heading": "Indicators",
  "scpi2_ind_hint": "VDRec (reconstitution value) and VDRea (realisation value), per share, as published by the management company at a date. VDRea is the appraised value of the buildings plus the net other assets, divided by the number of shares. VDRec is VDRea plus the acquisition costs and the subscription commission, per share.",
  "scpi2_ind_add": "Add indicators",
  "scpi2_ind_asof": "As of",
  "scpi2_ind_vdrec": "VDRec per share",
  "scpi2_ind_vdrea": "VDRea per share",
  "scpi2_ind_source": "Source note",
  "scpi2_ind_source_placeholder": "e.g. annual report 2025",
  "scpi2_ind_empty": "No indicators recorded yet.",
  "scpi2_remove": "Remove",
  "scpi2_div_exceptional": "Exceptional",
  "scpi2_div_exceptional_aria": "Exceptional payment",

  // detail overview card
  "scpi2_card_title": "SCPI indicators",
  "scpi2_card_asof": "As of {date}",
  "scpi2_card_none": "No indicators recorded yet. Add them in the Settings tab, under Indicators.",
  "scpi2_stale": "Older than 12 months",
  "scpi2_mds": "Current subscription price (MDS)",
  "scpi2_pdr": "Withdrawal price (PDR)",
  "scpi2_vdrec": "VDRec",
  "scpi2_vdrea": "VDRea",
  "scpi2_ratio_vdrec": "VDRec / MDS",
  "scpi2_ratio_vdrea": "VDRea / PDR",
  "scpi2_read_above": "Above 100 %",
  "scpi2_read_below": "Below 100 %",
  "scpi2_read_equal": "Equal to 100 %",
  "scpi2_read_note": "Ratios compare two published figures at a date. They describe a position, not a recommendation.",
  "scpi2_source": "Source: {note}",
  "scpi2_sale_vs_purchase": "Sale minus purchase",
  "scpi2_per_share": "Per share",
  "scpi2_total": "Total",
  "scpi2_reval_history": "Revalorisation history",
  "scpi2_dist_heading": "Distribution summary",
  "scpi2_dist_ordinary": "Without exceptional",
  "scpi2_dist_quarter_rate": "Rate for the quarter, annualised",
  "scpi2_dist_none": "No dividends received yet.",
  "scpi2_exceptional_flag": "exceptional",
  "scpi2_unverified_note": "The name of this SCPI was typed manually and is not in the verified catalog.",

  // dashboard block
  "scpi2_block_title": "SCPI",
  "scpi2_block_total": "Total SCPI value",
  "scpi2_block_rate": "Distribution rate, weighted",
  "scpi2_block_rate_hint": "Weighted by capital invested. Uses the dividends received over the last 12 months, else the target rate, else the average of the recorded rates.",
  "scpi2_block_empty": "No SCPI holdings yet.",
  "scpi2_block_holding_header": "Holding",
  "scpi2_block_no_indicator": "No indicators",
  "scpi2_block_open": "Open {name}",
  "scpi2_block_ratios": "VDRec / MDS and VDRea / PDR, as of the indicator date",
} as const;

export type Scpi2Key = keyof typeof SCPI2_EN;
