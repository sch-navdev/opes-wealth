# Opes Wealth — working instructions

## Keep the project tracker in sync (Obsidian vault)

Read `PROJECT_TRACKER.md` at the start of any work in this repo — it's the current status and the index of module notes. This repo root is also an Obsidian vault. Project documentation is a hub-and-spoke set of notes, not one file:

- `PROJECT_TRACKER.md` — the hub. Short: project overview, tech stack, the Phase 1 status checklist, and a table of `[[wikilinks]]` out to every module note. Never add implementation detail directly to it.
- `tracker/*.md` — one note per module (Design System, Authentication & Security, Database Schema, Portfolio Dashboard, Profile & Settings, Real Estate & Multi-Currency, CSV Bank Uploads, Live Pricing, Deployment, Codebase Audits, Changelog).

**After completing each step of work, update the docs like this — every time, without being asked:**

1. Identify which note under `tracker/` the change belongs to. If it genuinely doesn't fit any existing module, create a new note `tracker/<Module-Name>.md` (kebab-case filename, no spaces/`&`), start it with a `[[PROJECT_TRACKER|← Project Tracker]]` backlink, and add a row for it to the Modules table in `PROJECT_TRACKER.md`.
2. Edit that module note in place: update the relevant subsection (or add a new one) with what changed and why, at the same level of detail as the existing notes — file paths, key decisions, caveats, what was/wasn't verified. Do not paste this into `PROJECT_TRACKER.md`.
3. If the change touches another module too, add a `[[<Other-Note>|Display Name]]` link inline (or under that note's "Related" section) instead of duplicating the content — this is what keeps the Obsidian graph view meaningful (a real web of module notes around the hub, not one isolated node).
4. Update `PROJECT_TRACKER.md`'s "Status & Milestones" checklist (tick off completed steps, add newly-discovered ones) and its Modules table if a note was added.
5. Add exactly one line to `tracker/Changelog.md` — date + one-sentence summary + a `[[Module-Name|...]]` link back to the note with the details. Don't put changelog prose anywhere else.
6. Wikilinks must match the target file's name exactly (case-sensitive on some systems); use the `[[File-Name|Readable Text]]` alias form so link text can stay human-readable while filenames stay simple kebab-case.

@AGENTS.md
