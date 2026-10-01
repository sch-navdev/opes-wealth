[[PROJECT_TRACKER|← Project Tracker]]

# Localization

**Status:** Partial — architecture built and applied to the asset details page + dashboard chrome; most forms/dialogs not yet wired.

## English/French Toggle

- **Trigger**: `asset-detail-view.tsx`'s three tab labels were hardcoded French (`Aperçu`/`Analyse`/`Paramètres`) while every other string in the app was already English — a leftover from an earlier task, not an intentional partial localization. Rather than just renaming the three strings, built a real toggle since the request asked for one.
- `src/lib/i18n.ts` — a plain `Record<key, {en, fr}>` dictionary (`translate(locale, key, vars?)`, with `{placeholder}` substitution for the handful of strings that interpolate a value, e.g. `converted_note`, `registration_fee`, `duration_months`, `net_equity_share`). No external i18n library — the app's total string surface didn't justify one.
- `src/context/language-context.tsx` — `LanguageProvider`/`useLanguage()`, same shape as [[Privacy-Mode|Privacy Mode]]'s `PrivacyProvider` (state + `localStorage` persistence under `opes_locale`, defaults to `"en"`). Mounted in the root `layout.tsx` (not just the dashboard layout) so `/login` and the marketing page can use it too, though neither is translated yet.
- `src/components/language-switcher.tsx` — a small `EN`/`FR` toggle button, dropped into `dashboard-header-controls.tsx` next to the Privacy toggle.
- `src/components/translated-text.tsx` — a `<T k="..." />` client component so Server Components (like `dashboard/page.tsx`) can render a translated string without becoming Client Components themselves; it renders nothing but the translated text via `useLanguage()` internally.

## What's translated
- `asset-detail-view.tsx` (the actual target of this task) — fully: header card, Refresh Valuation dialog, all three tabs (Overview/Analysis/Settings — the correct English forms of the three original French labels) and every card/label/status string inside them.
- `dashboard/page.tsx` + `dashboard-header-controls.tsx` — header chrome (Welcome back, Portfolio heading/subtitle, Profile Settings, Sign Out, Net Worth).

## What's NOT translated yet (flagged, not silently skipped)
`add-asset-dialog.tsx`, `real-estate-fields.tsx`, `profile-form.tsx`, `country-combobox.tsx`, `portfolio-table.tsx`, the settings/login/MFA pages. These are large forms (~2,000 combined lines) with no existing French content — translating them was out of scope for fixing the original 3-string leftover and would be a substantial follow-up task in its own right if the product actually needs full bilingual support, rather than just the asset details page.

**Exception**: the two new category-specific sub-forms added for [[Portfolio-Dashboard|Vehicles & Private Equity]] (`vehicle-fields.tsx`, `private-equity-fields.tsx`) — new work rather than a retrofit, so they were built translated from the start via `useLanguage()`, even though the `add-asset-dialog.tsx` chrome around them (Name/Category/Quantity/Value labels, dialog title) is still English-only per the note above.

## New Keys (Vehicles & Private Equity Forms)
`i18n.ts` gained placeholder and validation-error keys alongside the existing read-only-display keys (`vehicle_details`, `make`, `model`, `vehicle_year`, `vin`, `private_equity_details`, `entity_name`, `share_class`, `ownership_percentage`): `vehicle_make_placeholder`/`vehicle_model_placeholder`/`vehicle_year_placeholder`/`vehicle_vin_placeholder`, `vehicle_make_required`/`vehicle_model_required`/`vehicle_year_required`/`vehicle_vin_required`, `entity_name_placeholder`/`share_class_placeholder`, `entity_name_required`/`share_class_required`/`ownership_percentage_required`/`ownership_percentage_range`. The validators in `lib/vehicles.ts`/`lib/private-equity.ts` return these as translation-key strings (not raw English text), so the calling form can `t()` them directly — verified both languages render correctly in-browser (English and French error messages both confirmed).

## New Keys (CSV Bank Uploads dropzone + mapping UI)
`i18n.ts` gained a "CSV Bank Uploads (Settings tab)" section: `import_bank_history`, `import_bank_history_desc`, `csv_dropzone_cta`/`csv_dropzone_subtext`, `csv_dropzone_error_type`/`csv_dropzone_error_empty`, `csv_selected_file`/`csv_choose_different_file`, `csv_map_columns`/`csv_map_columns_desc`, `csv_date_column`/`csv_balance_column`/`csv_date_format`/`csv_select_column`, `csv_preview_rows`/`csv_row_errors`/`csv_no_valid_rows` (interpolate `{n}`), `csv_import_button`/`csv_importing`/`csv_import_success` (interpolate `{n}`), `csv_cancel`/`csv_done`. Consumed via `useLanguage()`'s `t()` in the new `src/components/csv-import-dialog.tsx` — see [[CSV-Bank-Uploads|CSV Bank Uploads]]. Both languages verified live in-browser (French, the session's active locale, confirmed rendering correctly end-to-end).

## New Keys (Refresh from DARI — Live Pricing, Phase 1 Step 9)
`i18n.ts` gained a "Live Pricing — Refresh from DARI" section: `refresh_from_dari`, `refresh_from_dari_notice` (the placeholder-data disclaimer shown in the confirmation dialog), `dari_fetching`, `dari_last_updated`. Consumed via `useLanguage()`'s `t()` in `asset-detail-view.tsx`'s new confirmation dialog — see [[Market-Data-Integration|Market Data Integration]]. Verified live in French (the session's active locale).

## New Keys (Equities & Crypto Live Pricing, Phase 1 Step 9)
`i18n.ts` gained a "Live Pricing — Equities & Crypto" section: `ticker_symbol`/`ticker_symbol_required`/`ticker_symbol_equity_placeholder`/`ticker_symbol_crypto_placeholder`, `equity_details`/`exchange`/`equity_exchange_placeholder`, `crypto_details`/`coingecko_id`/`coingecko_id_placeholder`/`coingecko_id_hint`/`crypto_coingecko_id_required`, `refresh_market_price`, `unit_price`/`last_updated`/`no_market_price_yet`/`market_price_updated` (interpolates `{price}`), and eight `market_price_error_*` keys — one per error `code` the `refresh-market-price` Edge Function can return (`invalid_request`, `invalid_symbol`, `unsupported_currency`, `provider_not_configured`, `timeout`, `rate_limited`, `invalid_response`, `network_error`). That last group is a step further than the DARI/CSV precedents: those show a raw English error string from the server/adapter as-is, while this feature maps the Edge Function's typed error `code` to a localized key client-side (`MARKET_PRICE_ERROR_KEYS` in `asset-detail-view.tsx`), so every failure mode is genuinely bilingual, not just the happy path. Verified live in French for the Add Asset dialog's new fields; the error-state strings themselves weren't click-tested live (see [[Live-Pricing|Live Pricing]]'s "What's verified" section for why) but were curl-verified to correctly map to every code above.

## New Keys (Broker Trade Import, Phase 2)
`i18n.ts` gained the full Add Investments dialog's strings: `add_investments`/`add_investments_desc`, the three method cards (`method_upload_broker*`/`method_upload_file*`/`method_manual_trade*`), dropzone/preview/result strings (`investments_dropzone_*`, `holding_*`, `investments_import_button`/`investments_importing`, `investments_result_*`), generic-CSV column-mapping labels (`column_*`, reused from the shared "map your own columns" pattern), the manual-trade form's own dedicated labels (`investments_manual_side`/`investments_manual_date`/`investments_manual_quantity`/`investments_manual_price` — initially the form reused `column_*` labels like "Buy/Sell Column," which read oddly with no actual column involved; caught during live verification and given dedicated keys instead), and the chart (`portfolio_performance_title`/`portfolio_performance_empty`). See [[Broker-Trade-Import|Broker Trade Import]]. Verified live in both English and French (Add Investments dialog, all three method paths, dark and light mode).

## Updated Keys (Broker Trade Import bugfix, 2026-09-28)
`method_upload_file_desc` ("Any CSV — you map the columns yourself." → "Any CSV or Excel file — you map the columns yourself.") and `investments_dropzone_error_csv_only` ("Only .csv files are accepted here." → "Only .csv and .xlsx files are accepted here.") updated in both English and French, now that "Upload via file" accepts `.xlsx` as well as `.csv` — see [[Broker-Trade-Import|Broker Trade Import]].

## New Keys (Per-Trade Review Table, 2026-09-28)
`i18n.ts` gained keys for the Broker Trade Import's new per-trade editable table (replacing the old aggregated-holdings preview): `investments_review_heading`, `investments_review_desc`, `investments_trades_selected` (interpolates `{selected}`/`{total}`), `investments_delete_selected`, and column headers `trade_instrument`/`trade_date`/`trade_type`/`trade_quantity`/`trade_price`/`trade_exchange_rate`/`trade_brokerage`. Reused the existing `side_buy`/`side_sell` keys for the per-row Buy/Sell select rather than adding new ones. See [[Broker-Trade-Import|Broker Trade Import]].

## New Keys (Historical Purchase & Valuation Dates, 2026-09-28)
`purchase_date` (Add/Edit Asset dialog's new mandatory field) and `valuation_date` (the manual Refresh Valuation dialog's new date picker) added in both English and French. See [[Portfolio-Dashboard|Portfolio Dashboard]].


## New Keys (OW7: Security, Explorer/Projection, Precious Metals, Crypto Wallet, 2026-10-01)

- EN + FR added to `src/lib/i18n.ts`: `security_*` and `nav_security` (Security page), `category_cards_*`, `explorer_*`, `timeline_*`, `view_*`, `projection_*` (category cards, explorer dialog, Historical/Projection and Grouped/Individual toggles), `metal_*`, `category_precious_metals`, `refresh_metal_spot`, `quantity_pieces` (Precious Metals), `crypto_source_*`/`crypto_wallet_*`/`crypto_exchange_*`/`crypto_chain_*`, `sync_wallet`, `wallet_*` (Crypto wallet sync). The server-action error strings on the Security page (`revokeSession`) are English-only, like the other server-action errors.


## New Keys (Chart Range, Combined View, Invested Capital, 2026-10-01)

- EN + FR: `timeline_combined`, `range_label`, `range_all`, `chart_show_invested`, `chart_invested`, `projection_invested_note`.


## New Keys (Custom Range, Category Sorting, 2026-10-01)

- EN + FR: `range_from`, `range_to`, `range_reset`, `range_swapped`, `category_sort_label`, `category_sort_share`, `category_sort_alpha`.


## New Keys (Cash & Bank card, Liabilities, parsed preview, 2026-10-01)

- EN + FR: `cash_bank_*`, `liability_*` (incl. `liability_linked_loan*`), `currency_label`, `csv_parsed_*`.


## New Keys (Companies module, Private Equity commitment & capital calls, 2026-10-01)

- EN + FR: `nav_companies`, `category_companies`, `companies_*`, `company_*` (incl. entity-type labels), and `pe_*` (lifecycle stages, commitment, called/unfunded, schedule generator, call statuses, liability switch and its caveat, validation messages).


## New Keys (Private Equity projections & manual override, 2026-10-01)

- EN + FR: `pe_mode_*`, `pe_presets`/`pe_preset_*`, `pe_expected_*`, `pe_dist_*`, `pe_shape_*`, `pe_generate_lifecycle`, `pe_manual_*`, `pe_add_*`, `pe_returns_*`, `pe_cash_flows_heading`, `pe_chart_*`, `pe_projection_*`, `pe_distribution_invalid`, `pe_multiple_invalid`; `pe_calls_desc` reworded for the full lifecycle.


## New Keys (SCPI, Reports & Exports, DCC document, 2026-10-01)

- EN + FR: `yes`/`no`, `scpi_*`, `reports_*`, `export_xlsx*`, `dcc_*` — UI strings of the DCC dialog and every label of the generated PDF (field names, section titles, table headers, the 17 objectives, tax lines, warning text, signature labels), the latter rendered in the language chosen in the dialog rather than the UI language.

## Related
- [[Privacy-Mode|Privacy Mode]] — the context/provider pattern this reuses
- [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] — `asset-detail-view.tsx`, the file this task's tab labels came from
- [[CSV-Bank-Uploads|CSV Bank Uploads]] — the dropzone + column-mapping UI that consumes an earlier batch of keys
- [[Market-Data-Integration|Market Data Integration]] — the Refresh from DARI dialog that consumes an earlier batch of keys
- [[Live-Pricing|Live Pricing]] — the Equities/Crypto ticker fields and Refresh Market Price flow that consume an earlier batch of keys
- [[Broker-Trade-Import|Broker Trade Import]] — the Add Investments dialog and Portfolio Performance chart that consume the newest keys
