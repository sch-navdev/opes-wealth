[[PROJECT_TRACKER|← Project Tracker]]

# Live Pricing

**Status:** Planned — Phase 1, Step 9. Not started.

Scope (from the Phase 1 MVP definition): live market pricing for financial assets (equities, crypto, etc. — categories already seeded in [[Database-Schema|asset_categories]]), likely via a market-data API alongside the existing [[Real-Estate-Multi-Currency|FX rate integration]] pattern in `src/lib/fx.ts`.

When work starts, document the chosen data provider, caching/rate-limit strategy, file paths, decisions, and caveats here, and log one line per session in [[Changelog|Changelog]].

## Related
- [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] — existing `fx.ts` pattern for external rate data
- [[Portfolio-Dashboard|Portfolio Dashboard]] — where live prices will surface
