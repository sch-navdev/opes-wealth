[[PROJECT_TRACKER|← Project Tracker]]

# Entity Structures & Look-through

**Status:** Built 2026-10-08 (OW11, Phase 2 module 2). 119 related tests green (logic, the action with the in-memory Supabase fake, jsdom UI). Browser check: the Look-through section renders and its reconciliation equals the dashboard net worth; the tree, the Manage dialog and the save action were NOT exercised live (there are no entities in the real data and nothing was written to production).

UHNW holdings often sit in trusts, foundations, holding companies and SPVs. Before this, only a Company could sit under a tracked holding company (`holding_company_id`); an entity could not hold a property, an account or a loan.

## Model (no migration; everything in `assets.metadata`)
- `CompanyEntityType` gained `trust`, `foundation`, `spv`. `CompanyMetadata.held_asset_ids: string[]` = non-Company assets/liabilities held through the entity (sanitised by `parseCompanyMetadata`). Company-to-company nesting still uses `holding_company_id`.
- `lib/entity-lookthrough.ts` builds the tree from the dashboard's share-scaled rows (value = net-worth contribution: gross minus liability, liabilities negative, each converted to the base currency): own value, held items, children, subtotal and a breakdown by asset class per entity. **Reporting lens only: held through structures + held personally = net worth** (tested against the dashboard calculation). Warnings: `duplicate_link` (an asset linked by two entities stays with the first), `missing_link`, `company_link`, and an informational `possibleDoubleCount` when an entity has both its own value and linked holdings.
- Server action `setEntityHeldAssets` (`app/dashboard/companies/actions.ts`): session user, MFA step-up, dev mock-auth; the entity must be the caller's own active Companies asset; **co-owned entities are refused** (it would bypass the approval flow); ids are filtered to visible non-Company assets (cap 1000); metadata is merged; demo users write nothing; revalidates `/dashboard/companies`.
- UI on `/dashboard/companies`: nested-list tree with disclosure buttons, the reconciliation line, and a "Manage holdings" searchable checklist dialog (`components/entity-lookthrough*.tsx`). 43 keys (`ent_*`, three `company_type_*`), nine languages, machine-translated.

## Limits
No tax or legal treatment of trusts; no editing of co-owned entities (v1); if an entity's recorded value already includes its linked assets the total counts them twice (neutral note only). Related: [[Portfolio-Dashboard|Portfolio Dashboard]], [[Co-Ownership|Co-Ownership]], [[Localization|Localization]].
