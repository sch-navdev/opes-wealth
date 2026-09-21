[[PROJECT_TRACKER|← Project Tracker]]

# Design System

**Status:** Done — Phase 1, Step 2. Revisited during [[Codebase-Audits|Codebase Audits]].

Dark-mode-first luxury theme — "Midnight Navy & Champagne Gold" — implemented in `src/app/globals.css` via Tailwind v4 CSS-first `@theme` config. Background `#06101E`, cards `#151E32`, primary accent `#C69B3C` (champagne gold), destructive `#C41E3A`, success `#10B981`. Sharp, zero-radius corners (`--radius-lg/md/sm: 0px`) reinforce the luxury/precision aesthetic. Uses `tailwindcss-animate` plugin for animation utilities.

## Related
- [[Codebase-Audits|Codebase Audits]] — radius-token and destructive-color drift fixes, champagne-gold outline variant
- [[Portfolio-Dashboard|Portfolio Dashboard]], [[Profile-Settings|Profile & Settings]], [[Authentication-Security|Authentication & Security]] — all consume this theme via shadcn/ui components
