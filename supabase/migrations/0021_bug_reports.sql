-- 0021_bug_reports.sql
-- Opes Wealth: pending developer queue for bugs the in-app AI help assistant
-- identifies as reproducible (src/lib/assistant/bug-queue.ts).
--
-- Reports are CONSOLIDATED: the same bug (same fingerprint = normalised title +
-- page) seen again while still pending bumps `occurrences` instead of creating a
-- second ticket. A daily job (/api/cron/bug-reports) pushes pending rows to the
-- developers (GitHub issues and/or a webhook) and marks them 'sent'.
--
-- Privacy: only the AI's own description is stored (title, summary, repro
-- steps, page path). Chat transcripts and screenshots are NOT stored. The
-- table has row-level security on and NO policies, and all browser-role
-- privileges are revoked: neither anon nor authenticated can read or write it;
-- only the server (service role) can.
-- Apply with `supabase db push` or paste into the SQL editor.

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  title text not null check (char_length(title) between 1 and 200),
  summary text not null check (char_length(summary) <= 4000),
  repro_steps text not null default '' check (char_length(repro_steps) <= 4000),
  page_path text not null default '' check (char_length(page_path) <= 300),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  occurrences integer not null default 1 check (occurrences >= 1),
  -- Distinct reporting users (ids only), to tell "one person, five times" from "five people".
  reporter_ids uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sent', 'dismissed')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  sent_at timestamptz,
  -- Where it was pushed (issue URL, or 'webhook').
  external_ref text
);

-- One PENDING ticket per fingerprint (consolidation); sent ones are history.
create unique index if not exists bug_reports_pending_fingerprint_idx
  on public.bug_reports (fingerprint) where status = 'pending';
create index if not exists bug_reports_status_idx on public.bug_reports (status, last_seen_at desc);

alter table public.bug_reports enable row level security;
revoke all on public.bug_reports from anon, authenticated;
