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


## New Keys (Open Finance bank sync, 2026-10-01)

- EN + FR: `bank_status_*`, `bank_last_synced`, `bank_never_synced`, `bank_sync_now`, `bank_disconnect`, `bank_connect*`, `bank_not_configured`, `bank_sample_note`, `bank_choose_bank`, `bank_consent_note`, `bank_map_desc`, `bank_link_and_sync`, `bank_done*` and related dialog strings. Error messages returned by the banking server actions are English-only, like the other server-action errors.


## New Keys (Banking view, UAE bank buttons, statement import, sandbox wording, 2026-10-01)

- EN + FR: `nav_banking`, `banking_*`, `sandbox_tag`, `bank_connect_uae_heading`, `bank_connect_named`, `stmt_*`; the existing `bank_status_sample`, `bank_sample_note` and `bank_done_sample` texts were reworded to "Sandbox".


## New Keys (French bank row, 2026-10-01)

- EN + FR: `bank_connect_fr_heading`, `bank_fr_psd2_note`.


## New Keys (Help chat, 2026-10-01)

- EN + FR: `help_button`, `help_open`, `help_close`, `help_title`, `help_subtitle`, `help_welcome`, `help_placeholder`, `help_send`, `help_thinking`, `help_capture`, `help_capture_hint`, `help_remove_screenshot`, `help_screenshot_alt`, `help_mask_amounts`, `help_privacy_note`, `help_error_generic`, `help_error_rate`, `help_error_not_configured`, `help_error_capture`. The assistant's own replies follow the language the user writes in (the app locale is passed as a hint).


## Nine Languages (2026-10-01)

- **Languages**: English, French (as before) plus Spanish, Italian, German, Arabic, Russian, Hindi and Simplified Chinese. The registry is `lib/locales.ts` (code, native name, short code, `Intl` tag, text direction); `lib/i18n.ts` re-exports `Locale`/`locales` from it.
- **Where strings live**: English + French stay beside their keys in `lib/i18n.ts` (1,090 keys). The seven new languages are one file each in `lib/translations/<code>.ts` (key → text, wired in `translations/index.ts`). `translate()` falls back to the **English** text if a key is missing, never a raw key. Adding a key now means: add `en`+`fr` in `i18n.ts`, then the other seven in their files (or accept the English fallback).
- **Coverage**: every key in the dictionary (UI labels, navigation, all asset categories and their form fields/placeholders, banking, export/report headings, DCC labels, the help chat) was translated for all seven languages; a script check confirmed no missing/extra keys, no empty strings and identical `{placeholders}` for each. **Translated by AI, not reviewed by native speakers or a finance/legal translator** — in particular the French-specific tax/legal DCC terms (IFI, BIC/BNC/BA, nue-propriété, PACS…) and SCPI terms have no real equivalent in several languages and are kept as acronyms or glossed; have each language reviewed before it is promoted to customers. Count placeholders use one form ("{n} accounts"), so plural agreement (Russian, Arabic) is approximate.
- **Switching**: `LanguageSwitcher` is now a dropdown (native language names, compact "EN/FR/…" button) in the dashboard header, the login page, the landing page and a labelled selector on the Settings page. The choice is stored in `localStorage` (`opes_locale`) and applied instantly; `<html lang>` and `dir` follow it (`LanguageProvider`).
- **RTL (Arabic)**: `dir="rtl"` is set on `<html>`; the code base's physical Tailwind classes (`ml-/mr-/pl-/pr-/left-/right-/text-left/text-right/border-l/border-r/rounded-l/rounded-r`) were converted to logical ones (`ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e/rounded-s/rounded-e`) across all components, so layouts mirror; centred overlays (`left-1/2`, dialogs' `left-[50%]`) were deliberately left alone. Charts stay left-to-right. Directional icons (arrows, chevrons) are **not** individually mirrored and some third-party-style widgets may still look off — treat Arabic layout as needing a visual pass.
- **Number, currency and date formats** follow the language through `useLanguage().intlLocale` (en-US, fr-FR, es-ES, it-IT, de-DE, ar-AE — Western digits —, ru-RU, hi-IN with lakh/crore grouping, zh-CN) instead of hard-coded "en-US"/"en-GB". Money in exports written to disk (Excel) is stored as numbers, so the viewer's own locale formats it.
- **DCC PDF**: the on-screen DCC form and its labels exist in all nine languages, but the **PDF** can only be produced in English, French, Spanish, Italian and German: jsPDF's built-in fonts have no Cyrillic, Arabic, Devanagari or CJK glyphs and no Arabic shaping, so embedding fonts (and a shaping engine) would be needed for the other four. The dialog lists only the supported languages and says so (`dcc_pdf_latin_only`).
- **Not translated**: some pages were never put through the dictionary and still show hard-coded English (Settings page headings and profile form, MFA setup, parts of Security and Login). The AI help assistant's replies follow the user's language but its system prompt is English.
- **Cost**: the seven bundles add ~550 KB of source (≈ 150 KB gzipped) to the client JS because they are statically imported; they could be lazy-loaded per language if that matters.


## New Keys (Add bank account + Liabilities group, 2026-10-01)

- All nine languages: `bank_account_*` (dialog title/desc, bank, type and the five type labels, name, balance/amount owed, as-of, reference + hint, credit limit, card note, save/saving, errors) and `liabilities_*` (empty state, column headers, property-loan / off-plan / capital-call types, auto-included note, standalone).


## REIT vs SCPI Terminology (2026-10-01)

- "SCPI" is the French vehicle; elsewhere the asset class is a REIT or its local form. The category and its mentions now use: **English REIT, Spanish SOCIMI, Italian SIIQ, German/Russian/Hindi/Chinese REIT, Arabic "صندوق استثمار عقاري (REIT)"** (category label; "REIT" in running text), and **French keeps SCPI**. Keys changed (all nine languages): `category_scpi`, `scpi_details`, `export_xlsx_desc`, `dcc_derived_note`, `dcc_nature_scpi`, `dcc_ifi_rights`. The Excel export's sheets are now "REIT" / "REIT Dividends". The assistant's knowledge base mentions both names.
- **Caveats**: the internal category name in the database stays `SCPI` (it is the lookup key; only the displayed label changed) and so do code identifiers (`scpi_*` keys). An SCPI is **not legally identical to a REIT** (unlisted, French civil-partnership regime, own fee/withdrawal mechanics), so the SCPI-specific field labels (jouissance date, withdrawal value, TDVM, nue-propriété/usufruct) were left as they were. SOCIMI and SIIQ are the closest local equivalents, not exact legal matches — have the terminology confirmed by a local professional.
- New key `pdf_page_of` ("Page {n} / {total}") in all nine languages.

## OW9 keys and the global bank list (2026-10-02)

- **52 new keys in all nine languages** (en/fr in `lib/i18n.ts`, the other seven in `lib/translations/*.ts`): `stmt_imported_tx`, `broker_via_sharesight_*`, `category_exotic_assets`, `exotic_*` (details, fields, condition/box-papers options, refresh/status/validation) and `passive_*` (card, modal, four sources, seven projection methods, disclaimer). Same caveat as before: AI-made, not native-reviewed; REIT/SCPI naming follows each language's existing convention (SOCIMI/SCPI in Spanish, REIT/SCPI elsewhere).
- **Global bank expansion** (`lib/banking/institutions.ts`): `BankCountry` is now AE, FR, **GB, US, ES, DE, IT**; 7 UK banks + Revolut UK, 7 US, 8 Spanish, 4 German and 2 Italian banks added (`BANK_COUNTRIES` fixes the display order). They are `provider: "psd2"` (the DB CHECK on `bank_connections.provider` stays `altareq|psd2`; US aggregators are the equivalent route), `hasCsvProfile: false`, `dedicated: false` — selectable in Add bank account and in the sandbox connect picker, with logos, but **no CSV statement profile and no live connection** (needs a real export / an aggregator). Country group headings come from `Intl.DisplayNames`, so they are translated in every language with no new keys; bank names are proper nouns and are not translated. Cash & Bank card grouping uses the same list.

## OW10 keys (2026-10-02)

- **51 new keys in all nine languages:** `category_startups`, `startup_*` (form, card, round ledger, option/strike wording, validation) and the exotic wine/art additions (`exotic_kind*`, `exotic_producer/vintage/region/bottles/artist/title/medium`, hints and validation). Same caveat: AI-made, not native-reviewed. "SAFE" is kept as the English acronym everywhere; BSPCE is French-specific and kept as is.

## OW11 keys (2026-10-02)

- **34 new keys in all nine languages** for co-ownership: `owners_*` (form, summary, seven validation messages), `change_pending_*` and `approvals_*` (header panel and field names). Same caveat: AI-made, not native-reviewed. The server returns validation errors as keys (`owners_*`, `change_pending_exists`), which the modal translates.


## Full coverage for the seven overlay languages (2026-10-06)
- **Gap closed:** the base dictionary (`src/lib/i18n.ts`, `{en, fr}` per key) had **98 keys** missing from **each** of ar, de, es, hi, it, ru and zh, all added since the last coverage fill: the UI tier selector and Preferences card, the bento header, the CSV upload card and grid columns, the Basic overview, the Expert panels (raw data, private equity, tax/depreciation, currency heatmap) and the sparkline labels. They were translated into all seven languages and appended to `src/lib/translations/*.ts` under the comment `// 2026-10-06 coverage fill: ...`. Placeholders (`{name}`, `{n}`, `{pct}`, `{tier}`) were checked programmatically against the English text.
- **Guard:** `translations.test.ts` now **fails** if any overlay language lacks a base key (`translates every base key (100% coverage)`, which lists the missing keys), so every new dictionary key must be translated into all seven languages when it is added. `translate()` still falls back to English as a safety net. To relax this, change that one test back to reporting only.
- **Terminology** reused from each overlay file (Net Worth, Private Equity, Real Estate, Vehicles, Commitment/Called/Distributions). Tier names (Basic/Standard/Professional/Expert) and "Base Currency" had no earlier entries, so wording is new: de Basis/Standard/Professional/Experte, es Básico/Estándar/Profesional/Experto, it Base/Standard/Professionale/Esperto, ar أساسي/قياسي/احترافي/خبير, hi बेसिक/स्टैंडर्ड/प्रोफ़ेशनल/एक्सपर्ट, zh 基础/标准/专业/专家, ru Базовый/Стандартный/Профессиональный/Эксперт. NAV, DPI, TVPI and IRR stay Latin (es uses VL and TIR where the file already did).
- **Caveats:** the translations are machine-written, not reviewed by native speakers; a native check of ar, hi and ru in particular is worthwhile before relying on them with clients. Existing es and it files address the user informally (tú / tu) in places while de is formal (Sie); the new strings follow each file's existing mix. RTL layout of the new Arabic strings was not checked in a browser.

## Related
- [[Privacy-Mode|Privacy Mode]] — the context/provider pattern this reuses
- [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] — `asset-detail-view.tsx`, the file this task's tab labels came from
- [[CSV-Bank-Uploads|CSV Bank Uploads]] — the dropzone + column-mapping UI that consumes an earlier batch of keys
- [[Market-Data-Integration|Market Data Integration]] — the Refresh from DARI dialog that consumes an earlier batch of keys
- [[Live-Pricing|Live Pricing]] — the Equities/Crypto ticker fields and Refresh Market Price flow that consume an earlier batch of keys
- [[Broker-Trade-Import|Broker Trade Import]] — the Add Investments dialog and Portfolio Performance chart that consume the newest keys
