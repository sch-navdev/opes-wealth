[[PROJECT_TRACKER|← Project Tracker]]

# Market Data Integration (Design Only — Not Implemented)

**Status:** Draft technical outline only, per explicit request. No code, no live API calls, no credentials. Nothing here has been built or verified against a real provider.

## Honesty check before anything else
I don't have confirmed, current documentation for a public ADREC (Abu Dhabi Real Estate Centre) or DARI developer API — access terms, authentication method, endpoint shapes, and rate limits are all **unconfirmed**. These are the kind of government/institutional property-valuation indices that often require a direct partnership or registered-developer agreement rather than a self-serve public API. Before writing any real integration code, someone needs to confirm directly with the provider: (1) that a programmatic API exists at all, (2) its auth model, (3) its terms of use for a commercial wealth-tracking product. Nothing below should be read as "this endpoint exists" — it's the shape the integration would take *once* those facts are confirmed, designed to slot into what's already built.

## Where this already has a landing spot in the app
- `asset_history.source` (migration `0006`) already accepts `'manual' | 'dari' | 'dubailand'` — added specifically so a future automated valuation could be tagged apart from a manual entry, without a schema change.
- The Refresh Valuation dialog (`asset-detail-view.tsx`) already has a Source dropdown with DARI/Dubai Land Department options, currently just tagging the string on a manually-entered number — see the existing "No live DARI or Dubai Land Department integration is configured yet" copy in that dialog.
- `updateAssetValuation()` (`src/app/dashboard/actions.ts`) is the single write path for a new valuation + `asset_history` row, for both manual and (eventually) automated updates.

## Proposed architecture
1. **Adapter module** — `src/lib/market-data/dari.ts` exporting one function: `fetchDariValuation(propertyRef: string): Promise<{ value: number; asOf: string; raw: unknown }>`. Internal HTTP/auth details stay inside this one file so the provider can be swapped or the API version bumped without touching call sites.
2. **Normalized interface, not a DARI-specific one** — define a `MarketDataProvider` type (`{ fetchValuation(propertyRef: string): Promise<...> }`) so `dari.ts` is one implementation of it. If Dubai Land Department's own feed also becomes available later (the UI already has a slot for `'dubailand'` too), it becomes a second adapter behind the same interface, not a special case.
3. **Trigger point** — most likely a manual "Refresh from DARI" action next to the existing "Refresh Valuation" dialog (calls the adapter, then reuses the *existing* `updateAssetValuation(assetId, value, 'dari')` path — no new write logic needed), rather than a background cron job, at least initially: automated recurring valuation pulls raise their own questions (cost per call, provider rate limits, whether a stale property reference silently returns wrong data) that are easier to reason about with a human triggering each refresh.
4. **Credentials** — if the provider requires an API key, it's a server-only secret (never `NEXT_PUBLIC_*`), read only inside the adapter module, following the same pattern as `SUPABASE_SERVICE_ROLE_KEY` in [[Authentication-Security|Authentication & Security]] — never exposed to the client bundle.
5. **Property reference** — DARI/ADREC valuations are keyed by a specific property identifier (parcel/plot number or title deed number), which isn't currently a field on `RealEstateMetadata`. That would need adding (a `dari_property_ref` or similar field in `src/lib/real-estate.ts`, following its existing pattern) before any real call could be made — not done here since this task is design-only.
6. **Failure handling** — the adapter should fail loudly with a specific error (property not found vs. auth failure vs. network error) rather than silently falling back to the manual figure, so a bad automated pull never quietly overwrites a correct manually-entered valuation.

## What would need to happen before this is real
- Confirm API access/terms with ADREC/DARI directly (see honesty check above).
- Add the property-reference field to `RealEstateMetadata`.
- Build `dari.ts` against the real, confirmed API shape.
- Decide the trigger model (manual refresh vs. scheduled) based on the provider's actual rate limits/costs.
- Build the UI trigger (explicitly out of scope for this task).

## Related
- [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] — `RealEstateMetadata`, the existing Refresh Valuation dialog and its Source dropdown
- [[Authentication-Security|Authentication & Security]] — the server-only-secret pattern this would reuse for API credentials
- [[Architecture|Architecture]] — overall stack reference
