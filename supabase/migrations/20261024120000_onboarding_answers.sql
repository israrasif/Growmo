-- Onboarding answers, one row per user. Used to personalise the plan and, only when the person agreed,
-- to study which routines work for which kinds of hair. Run once in the Supabase SQL editor (or `supabase db push`).

create table if not exists public.onboarding_answers (
  user_id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  goals            text[]  not null default '{}',
  areas            text[]  not null default '{}',
  duration         text,
  hair_type        text,
  scalp_feel       text,
  session_time     text,
  commitment       text,
  -- true only if the person chose "Yes" on the last onboarding question. Leave rows with false out of any analysis.
  research_consent boolean not null default false,
  -- the raw answers, so new questions never need a schema change
  answers          jsonb   not null default '{}'::jsonb,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.onboarding_answers enable row level security;

-- People can only see and write their own row. (You, in the SQL editor or with the service role, can read all rows.)
drop policy if exists "Read own onboarding answers" on public.onboarding_answers;
create policy "Read own onboarding answers" on public.onboarding_answers
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Insert own onboarding answers" on public.onboarding_answers;
create policy "Insert own onboarding answers" on public.onboarding_answers
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Update own onboarding answers" on public.onboarding_answers;
create policy "Update own onboarding answers" on public.onboarding_answers
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No delete policy on purpose: the row is removed automatically when the account is deleted (on delete cascade).
