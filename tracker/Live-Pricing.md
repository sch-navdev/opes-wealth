[[PROJECT_TRACKER|← Project Tracker]]

# Live Pricing

**Status:** Planned — Phase 1, Step 9. Not started.

Scope (from the Phase 1 MVP definition): live market pricing for financial assets (equities, crypto, etc. — categories already seeded in [[Database-Schema|asset_categories]]), likely via a market-data API alongside the existing [[Real-Estate-Multi-Currency|FX rate integration]] pattern in `src/lib/fx.ts`.

**Not to be confused with** [[Market-Data-Integration|Market Data Integration]] — Step 9's *other* half, Real Estate valuation refresh via ADREC/DARI, which is built (as a stubbed pipeline pending confirmed provider API access). This note is specifically the equities/crypto pricing piece, still untouched.

When work starts, document the chosen data provider, caching/rate-limit strategy, file paths, decisions, and caveats here, and log one line per session in [[Changelog|Changelog]].

## Related
- [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] — existing `fx.ts` pattern for external rate data
- [[Portfolio-Dashboard|Portfolio Dashboard]] — where live prices will surface
