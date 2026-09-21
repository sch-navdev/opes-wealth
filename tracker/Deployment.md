[[PROJECT_TRACKER|← Project Tracker]]

# Deployment

**Status:** Planned — Phase 1, Step 10. Not started.

Scope: deploy to Vercel. `.env.local` currently holds the Supabase URL/anon key locally (gitignored) — production env vars, the Supabase project's production credentials, and the still-unapplied migrations under `supabase/migrations/` (see [[Database-Schema|Database Schema]]) all need to be sorted before/at this step.

When work starts, document the deployment setup, environment configuration, and any production-only decisions here, and log one line in [[Changelog|Changelog]].

## Related
- [[Database-Schema|Database Schema]] — migrations to apply to the production database
