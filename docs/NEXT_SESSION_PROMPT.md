# Prompt for the next chat (OW14): paste everything below the line

---

You are the Master Agent Coordinator for Opes Wealth. Read `docs/GEMINI_HANDOFF.md` (top section first) and `PROJECT_TRACKER.md` to initialise your context. We are starting session OW14.

**Rules:** keep all gates green after each unit (`npm test`, `npx eslint .`, `npm run build`; do not run `next build` while a dev server runs); update the matching `tracker/*.md` note and add exactly one `tracker/Changelog.md` line per unit; keep `docs/GEMINI_HANDOFF.md` current with a Gulf Standard Time stamp; commit and push are separate and need Steve's confirmation each time; never run production DB changes, give the SQL instead; write code with Write/Edit, not shell quoting (backslashes get mangled); read `node_modules/next/dist/docs/` before editing Next.js code.

**State:** everything through `bed29d0` (OW13) is pushed. Migration 0041 is drafted but not applied.

**Candidates for OW14:** single-file statement import should get row editing, never-import and closed-account marking (they exist only in the multi-file review); translate the English-only OW13 texts; verify OW13 in a browser (the preview tool must start this repo's `opes-wealth-dev` config, not another project's); re-run the real Relevé CB PDFs; HSBC Advance/Saving/USD Saving/Loan OCR layouts (blocked on real OCR output); entity map phase B; profile-level sync of device-local settings (emergency fund, exposure targets, skipped accounts); wiring `removeVaultObjects` into asset deletion; FX history for asset detail charts and attribution.
