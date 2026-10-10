# Prompt for the next chat (OW14): paste everything below the line

---

You are the Master Agent Coordinator for Opes Wealth. Read `docs/GEMINI_HANDOFF.md` (top section first) and `PROJECT_TRACKER.md` to initialise your context. We are starting session OW14.

**Rules:** keep all gates green after each unit (`npm test`, `npx eslint .`, `npm run build`; do not run `next build` while a dev server runs); update the matching `tracker/*.md` note and add exactly one `tracker/Changelog.md` line per unit; keep `docs/GEMINI_HANDOFF.md` current with a Gulf Standard Time stamp; commit and push are separate and need Steve's confirmation each time; never run production DB changes, give the SQL instead; write code with Write/Edit, not shell quoting (backslashes get mangled); read `node_modules/next/dist/docs/` before editing Next.js code.

**State:** everything through the OW13 round 3 push (income calendar cash basis, Wio closures, dashboard batch import) is pushed. Migrations 0041, 0042 and 0043 are applied on Supabase.

**Candidates for OW14:** check the cash-basis calendar on Steve's real data (paid items matched, month-end cash); the April 2026 Wio micro-transfer mis-assignment; a dashboard last-balance date so closures by absence also work from the dashboard card; translate the English-only OW13 texts; verify OW13 in a browser (the preview tool must start this repo's `opes-wealth-dev` config, not another project's); re-run the real Relevé CB PDFs; HSBC Advance/Saving/USD Saving/Loan OCR layouts (blocked on real OCR output); entity map phase B; profile-level sync of device-local settings (emergency fund, exposure targets, skipped accounts); wiring `removeVaultObjects` into asset deletion; FX history for asset detail charts and attribution.
