`[[PROJECT_TRACKER|← Project Tracker]]
`
`# Demo account: populated data and read-only mode
`
`**Status:** built, type-checked, linted and built (2026-10-02). **Migration `0032_demo_read_only.sql` is applied and verified (39 policies on all 13 public tables + 3 on storage, all restrictive, function holds the demo id). The seed still has to be re-run (`--yes`) to load the new data.** The shim was tested with a stand-in client (no write reached it); the RLS policies and the toast have not been exercised against the live database or in a browser.
`
`The demo login (`demo@opeswealth.com`, id `ddf92bf5-5beb-45c1-bf92-d3b696806d13`, password published on the sign-in page) is public, so it must read everything and change nothing.
`
`## Three layers
`1. **Database (the guarantee).** Migration 0032 adds `public.is_demo_user()` and, on every public table with RLS plus `storage.objects`, three **restrictive** policies (INSERT / UPDATE / DELETE, `to authenticated`) that refuse the demo id. Restrictive policies are ANDed with the existing ones, so nothing else can re-allow a write. SELECT is untouched; other users are unaffected. It loops over the tables that exist when it runs: **re-run it after adding a table.**
`2. **Server (no errors in the demo).** \`createClient()\` (\`utils/supabase/server.ts\`) wraps the demo user's client in \`withDemoReadOnly\` (\`utils/supabase/demo-shim.ts\`): reads pass through, while insert / update / upsert / delete, mutating \`rpc\` (\`revoke_*\`, \`delete_*\`, \`update_*\`, \`set_*\`) and storage writes are swallowed and **reported as successful**, with plausible data (an inserted row comes back with a generated id, an update returns the values sent). The user is read from the session cookie token (\`lib/demo-mode.ts\`), which can only make a session more restricted.
`3. **Browser.** \`components/demo-mode.tsx\` (mounted in \`dashboard/layout.tsx\`) shows a green **"Saved (Demo Mode)"** toast (\`demo_saved\`, 9 languages) after every server action the demo user triggers, by watching for the \`Next-Action\` header on \`fetch\`. **Deviation from the brief:** it does not intercept before the call; the server makes the call harmless instead, because the app has 100+ save paths and no single place to intercept them. Side effect: any server action by the demo user shows the toast, saves or not.
`
`## Paths that bypass the database rules, and how they are covered
`- **Service-role code (bypasses RLS):** guarded by user id in \`replaceOwners\`, \`routeAssetEdit\`, \`respondToApproval\`, \`revokeCoOwner\` (\`shared-assets/server.ts\`), the resend actions (\`ownership-actions.ts\`) and the bank actions (\`requireUser(true)\` refuses writes for the demo: "Bank connections are switched off in the demo account"). \`removeAssetPhotos\` never deletes files under the demo user's folder.
`- **Login-changing calls (not table writes, so RLS cannot stop them):** \`updateEmail\` and "sign out other devices" are no-ops for the demo; two-factor enrol/remove and passkey add/remove (browser-side) show the toast and do nothing. Otherwise a visitor could lock the shared demo account.
`- **Not covered:** a determined visitor calling Supabase Auth's API directly with the anon key can still try to change the demo password or add a factor; Supabase has no per-user lock for that. Rotate the password by re-running the seed if it ever happens.
`
`## Seed (\`scripts/seed-demo.mts\`)
`- **Vehicles** now carry \`second_hand\`, the depreciation rates (from the app's own \`vehicle-depreciation.ts\` model) and a **Blue Book log**: Porsche and Mercedes in AED, Tesla in EUR with "Cote Argus", so the three-curve chart and the multi-currency log have data.
`- **Future Projects:** two simulations (status \`simulation\` with a financing \`plan\`): a Dubai Hills apartment (AED 2.4M, 75% LTV, Day D in 6 months) and an Aston Martin DB12 (AED 790k, 80% LTV, own cash 250k, Day D in 9 months). The dry-run summary leaves them out of net worth (40 live assets + 2 simulations).
`- **Private equity** was already fully populated (capital calls, projected distributions, expected multiple); unchanged.
`- Run: \`node --env-file=.env.local scripts/seed-demo.mts --yes\` (resets only the demo user's own assets). The seed uses the service role, which bypasses the new policies. **Not run by Claude.**
`
`## Related
`- [[Future-Projects|Future Projects]] — the simulations seeded here
`- [[Portfolio-Dashboard|Portfolio Dashboard]] — vehicles and the Blue Book curve
`- [[Authentication-Security|Authentication & Security]] — login-changing paths
`- [[Co-Ownership|Co-Ownership]] — service-role paths guarded
