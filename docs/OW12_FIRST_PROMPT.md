# OW12 first prompt (paste this into a new Claude Code session)

You are continuing work on Opes Wealth (repo `...\Opes Wealth\opes-wealth`, branch master, HEAD 9fa04e7, everything pushed).

**Read first, in this order:** `PROJECT_TRACKER.md`, `docs/GEMINI_HANDOFF.md` ("Where things stand" first), `tracker/UHNW-Modules-Plan.md`, `tracker/Architecture.md`. This is a newer Next.js with breaking changes: read the relevant guide in `node_modules/next/dist/docs` before writing code.

## Rules
- Run `npm test`, `npx tsc --noEmit`, `npx eslint .` and `npm run build` after each unit. One unit at a time.
- After each unit: update the matching `tracker/*.md` note, add exactly one line to `tracker/Changelog.md`, and update `docs/GEMINI_HANDOFF.md` with a Gulf Standard Time (UTC+4) stamp.
- Every new i18n key goes into all 9 languages through one idempotent merge script. Sub-agents must not edit the i18n files.
- Keep `src/lib/assistant/chat-knowledge.ts` in step with every user-visible feature change (the help chat only knows what is written there).
- Never read, print or ask for secrets (`.env.local`, API keys, AWS keys, passwords). Never write to production Supabase: give Steve the SQL (read-only MCP queries are fine).
- Use Write/Edit for code, not shell quoting.
- Commit and push are separate and each needs Steve's explicit confirmation.
- Privacy: never copy personal data from statements into the repo.

## Where OW11 session 2 ended
- Allocation dial on every tier, interactive (hover highlights, click opens the category explorer).
- Tiered luxury UI (Basic, Standard/Professional, Expert).
- Groq help chat: `/api/chat`, default model `qwen/qwen3.8-27b` (override with the `AI_MODEL` env var), knowledge in `chat-knowledge.ts`.
- Theme now starts on Device (storage key `opes-theme-v2`).
- Private-equity ledger foundation: `src/lib/private-equity.ts` and `src/lib/pe-liquidity.ts` (no UI yet).
- Steve approved the UHNW plan: node map phase A (React Flow, derived data, no migration); PE ledger inside `assets.metadata`, actuals only; governance vault (private bucket, signed URLs, MFA step-up, 15 MB, PDF + PNG/JPEG, owner-only flag, Professional and up).

## Task for OW12
1. **PE cash-flow ledger editor** in the Private Equity settings section: add and edit paid capital calls (with `paid_date`) and dated actual distributions. Validation messages in 9 languages (codes `pe_paid_date_invalid`, `pe_ledger_too_long`, `pe_actual_distribution_invalid`). Edits follow the same co-owner approval path as other metadata edits.
   Then the **Expert liquidity panel**: paid-in, unfunded, DPI, RVPI, TVPI, net IRR, portfolio roll-up, and a 12-month upcoming-calls strip.
2. **Entity node map, phase A:** `lib/entity-map.ts` with a reconciliation test (map totals equal the look-through totals), a React Flow tab on the Companies page, lazy-loaded; the tree stays the accessible default.
3. **Only then the Governance Vault:** draft the migration (`asset_documents`, `document_access_log`, private bucket, widened `notifications.kind` CHECK) for Steve to apply; do not apply it yourself. Expiry notifications via cron. Needs a security review.

Start by writing a short plan and ask about anything ambiguous before coding. Verify in the browser where possible and state plainly what was not verified.
