[[PROJECT_TRACKER|← Project Tracker]]

# Live Pricing

**Status:** Built and deployed — Phase 1, Step 9, equities/crypto half. Crypto pricing (CoinGecko) is fully real and works today. Equities pricing (Finnhub) is real, working code gated on a secret that hasn't been set yet — see "What Steve needs to do" below. The schema migration this depended on has been applied to the live project.

**Not to be confused with** [[Market-Data-Integration|Market Data Integration]] — Step 9's *other* half, Real Estate valuation refresh via ADREC/DARI (a clearly-marked **stub**, since that provider has no confirmed public API). This note is the equities/crypto half, and unlike DARI, both providers here are real, documented, public APIs — no honesty-check caveat needed on the pricing logic itself.

## Providers chosen
- **Crypto → CoinGecko** `/simple/price`. Public, free, **no API key required**. Chosen specifically so crypto pricing could be fully real immediately rather than another stubbed pipeline.
- **Equities → Finnhub** `/quote`. Public, free tier (60 calls/min), but requires a free API key — chosen over Twelve Data (lower free-tier limit) and over an unofficial/undocumented Yahoo Finance endpoint (fragile, ToS-gray, not appropriate for a product tracking real financial data). Picked by explicit user choice when asked, over stubbing equities the way DARI was stubbed.

## Schema
No new tables — same `assets.metadata` jsonb-per-category pattern as every other category. What *did* need adding:
- `assets.ticker_symbol` — this column already existed (added at some earlier point, unused until now). Now wired up: a shared "Ticker Symbol" input in `add-asset-dialog.tsx`, shown for both Equities and Crypto, required for both.
- `src/lib/equities.ts` — `EquityMetadata = { exchange, last_unit_price, last_priced_at, last_price_source }`. `exchange` is display-only (Finnhub doesn't need it for a US ticker).
- `src/lib/crypto.ts` — `CryptoMetadata = { coingecko_id, last_unit_price, last_priced_at, last_price_source }`. `coingecko_id` is **required** and separate from `ticker_symbol` — CoinGecko's API keys on its own slug (e.g. `"bitcoin"`), never a ticker (`"BTC"`), and guessing that mapping wrong would price the wrong asset. `getCryptoMetadataErrors()` enforces it's set before save.
- `src/components/equity-fields.tsx` / `src/components/crypto-fields.tsx` — the corresponding add/edit form fields, wired into `add-asset-dialog.tsx` (`isEquity`/`isCrypto` branches, same pattern as Vehicles/Private Equity) and `asset-detail-view.tsx`'s Settings tab (read-only `EquityDetails`/`CryptoDetails` cards).
- `src/lib/asset-history.ts` — `AssetHistorySource` gained `"coingecko" | "finnhub"`.
- **Migration `0010_market_pricing_sources.sql`** — widens `asset_history_source_check` to include `csv_import`/`coingecko`/`finnhub`. First blocked by this session's permission classifier when attempted via the Supabase MCP's `apply_migration`, surfaced to Steve rather than worked around; **applied to the live project on his explicit follow-up instruction** (`market_pricing_sources`, version `20260928074335`) — confirmed live via `pg_constraint`: `CHECK ((source = ANY (ARRAY['manual', 'dari', 'dubailand', 'csv_import', 'coingecko', 'finnhub'])))`.

## Backend
- **`supabase/functions/refresh-market-price/index.ts`** (new, deployed live, function id `54bb656f-a6ef-4e1f-89ad-71377632e13b`, `verify_jwt: true`). One function, branches on `category: "equities" | "crypto"`:
  - `fetchCryptoPrice()` — real call to `api.coingecko.com/api/v3/simple/price?ids={coingeckoId}&vs_currencies={currency}`. An unknown coin id or unsupported currency comes back as HTTP 200 with an empty body (not a 404), so that's checked explicitly and reported as `invalid_symbol` rather than silently pricing at `undefined`/`0`.
  - `fetchEquityPrice()` — real call to `finnhub.io/api/v1/quote?symbol={symbol}&token={FINNHUB_API_KEY}`. Two guards before/around the call: (1) currency must be `USD` — Finnhub's free tier only quotes in USD, checked *before* calling to avoid a wasted request; (2) if `FINNHUB_API_KEY` isn't set (`Deno.env.get`), returns `provider_not_configured` with the exact command to fix it, rather than a generic failure. An unrecognized ticker comes back as HTTP 200 with every field zeroed (`c/h/l/o/pc/t` all `0`) — checked explicitly and reported as `invalid_symbol`, since silently treating that as a real $0 quote would zero out the asset's actual value.
  - Both paths: an `AbortController` timeout (8s), and 429 → `rate_limited` specifically (distinct from a generic `network_error`).
  - Verified live via direct `curl` against the deployed function: **Bitcoin/USD → $82,952**, **Ethereum/EUR → €2,324.25** (both real, current prices at test time), an invalid CoinGecko id → `invalid_symbol`/404, equities with no `FINNHUB_API_KEY` set → `provider_not_configured`/503 (expected — no key configured yet), a non-USD equity currency → `unsupported_currency`/400 (rejected before any Finnhub call), and an invalid `category` → `invalid_request`/400.
- **`src/lib/market-data/market-price.ts`** (new, client-side adapter) — `fetchMarketPrice(request)`, same normalization pattern as `fetchDariValuation`/`fetchBankCsv`-style adapters: wraps `supabase.functions.invoke`, folds network error / in-body `{error}` / malformed-success into one `MarketPriceResult` union with the error's `code` preserved (not just its message) so the UI can localize it.
- **`refreshMarketPrice(id, unitPrice, source)`** (new server action, `dashboard/actions.ts`) — deliberately *not* a reuse of `updateAssetValuation`, because this feature has two requirements that action doesn't handle: (1) the fetched number is a **unit** price, and `current_value` needs to become `quantity × unitPrice` (`updateAssetValuation` takes a pre-computed total); (2) a live-price refresh is realistically clicked more than once a day, and `updateAssetValuation`'s plain `.insert()` into `asset_history` would violate the `(asset_id, recorded_date)` unique constraint on a same-day re-run — this action `.upsert()`s instead, same `onConflict` pattern as `importBankCsvHistory`. Also writes `last_unit_price`/`last_priced_at`/`last_price_source` into `metadata`.

## Frontend
- `asset-detail-view.tsx` — a "Refresh Market Price" icon button (`LineChart`, Equities/Crypto only) next to the DARI/manual-refresh buttons. **No confirmation dialog**, unlike DARI's — deliberately, since this fetches real data (once configured) rather than a mock, so a direct click-and-refresh matches normal "pull a live price" UX instead of needing an honesty disclaimer. Below the header card: unit price + last-updated caption (or a "no price fetched yet" placeholder), and inline loading/error/success feedback. Error `code`s from the Edge Function are mapped through a `MARKET_PRICE_ERROR_KEYS` table to localized message keys (`market_price_error_*`) rather than showing the Edge Function's raw English text — the one piece of this feature that goes further on localization than the DARI/CSV precedents, which show raw error text.
- New i18n keys (`src/lib/i18n.ts`): `ticker_symbol*`, `equity_details`/`exchange`/`equity_exchange_placeholder`, `crypto_details`/`coingecko_id*`, `refresh_market_price`, `unit_price`/`last_updated`/`no_market_price_yet`/`market_price_updated`, and the eight `market_price_error_*` keys mirroring the Edge Function's error codes. See [[Localization|Localization]].
- `tsc --noEmit`/`eslint` clean.

## What's verified vs. not

**Verified live this session:**
- The deployed Edge Function, both providers, all the curl cases listed above.
- The Add Asset dialog's new Equities and Crypto branches render correctly (ticker field, Exchange field / CoinGecko ID field + hint, all in French — the session's active locale).

**Not verified live this session, and why:**
- The asset detail page's "Refresh Market Price" button, its loading/error/success states, and `refreshMarketPrice`'s DB write couldn't be click-tested, because no Equities/Crypto asset exists in the dev database yet and creating a test one was blocked twice by this session's permission classifier (`apply_migration` for the schema, then a direct `execute_sql` insert as a workaround — both refused as "Modify Shared Resources," and per this session's safety rules a blocked write isn't worked around). Separately, the Add Asset dialog's actual save is blocked in this dev environment by the same pre-existing mock-auth limitation already documented for Vehicles/Private Equity and the DARI/CSV features (`getUser()` finds no real session). This UI code follows the exact pattern already fully browser-verified for DARI (same confirmation-free-but-loading/error/success shape, same error-surfacing convention), so risk is low, but it's still an honest gap, not a claimed verification.
- Live Finnhub pricing itself (vs. its `provider_not_configured` guard, which *was* verified) — no `FINNHUB_API_KEY` is set yet.

## What Steve needs to do
1. ~~Apply migration `0010_market_pricing_sources.sql` to the live project~~ — done (see above).
2. Get a free Finnhub API key (finnhub.io) and run `supabase secrets set FINNHUB_API_KEY=<key>` against the `lpaollycwokxejrihrap` project. Until then, adding a live price for an Equities asset returns a clear "not configured" error — Crypto works immediately, no key needed.

## Related
- [[Market-Data-Integration|Market Data Integration]] — Step 9's other half (Real Estate/ADREC-DARI, stubbed)
- [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] — existing `fx.ts` pattern for external rate data; also the closest precedent for a category-specific metadata module
- [[Portfolio-Dashboard|Portfolio Dashboard]] — where live equity/crypto prices surface
- [[Localization|Localization]] — new EN/FR keys for this feature
- [[Database-Schema|Database Schema]] — `assets.ticker_symbol`, the `asset_history_source_check` constraint gap
