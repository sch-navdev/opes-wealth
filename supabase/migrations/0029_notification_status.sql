-- 0029_notification_status.sql
-- Opes Wealth: track whether co-owners were emailed.
--
--   asset_owners.invite_status / invite_error   the join invitation sent to a co-owner
--                                               without an account ('invited_at' is when).
--   change_approvals.notify_status / notified_at / notify_error
--                                               the "please review this change" email
--                                               sent to a registered co-owner.
--
-- status: 'not_sent' (the user chose not to notify, or nothing to send), 'sent', 'failed'.
-- Idempotent: safe to re-run.

alter table public.asset_owners
  add column if not exists invite_status text not null default 'not_sent'
    check (invite_status in ('not_sent', 'sent', 'failed')),
  add column if not exists invite_error text;

alter table public.change_approvals
  add column if not exists notify_status text not null default 'not_sent'
    check (notify_status in ('not_sent', 'sent', 'failed')),
  add column if not exists notified_at timestamptz,
  add column if not exists notify_error text;

-- Invitations sent before this column existed went through Supabase Auth and were accepted.
update public.asset_owners
   set invite_status = 'sent'
 where invited_at is not null and invite_status = 'not_sent';
