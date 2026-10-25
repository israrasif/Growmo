-- Counts every photo sent to the AI, so blank or spam photos cannot be sent without limit.
-- Used only by the analyze-hair function (with the server's key). People can neither read nor write it.
-- Run this BEFORE deploying the new analyze-hair function.

create table if not exists public.scan_attempts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists scan_attempts_user_time on public.scan_attempts (user_id, created_at desc);

alter table public.scan_attempts enable row level security; -- no policies on purpose: nobody but the server gets in
revoke all on public.scan_attempts from anon, authenticated;