-- ============================================================
--  User feedback table
--  Stores messages submitted from Help & Support.
--  Run this in the Supabase SQL Editor (or as a migration file).
-- ============================================================

create table if not exists public.feedback (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  category            text not null check (category in ('bug', 'feature', 'general', 'compliment')),
  message             text not null check (char_length(message) between 10 and 4000),
  email               text,
  locale              text,
  app_version         text,
  user_agent          text,
  include_diagnostics boolean not null default true,
  status              text not null default 'new' check (status in ('new', 'in_review', 'resolved')),
  created_at          timestamptz not null default now()
);

create index if not exists idx_feedback_user_id_created_at
  on public.feedback (user_id, created_at desc);

create index if not exists idx_feedback_status_created_at
  on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "Users can insert their own feedback" on public.feedback;
create policy "Users can insert their own feedback"
  on public.feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their own feedback" on public.feedback;
create policy "Users can read their own feedback"
  on public.feedback for select
  to authenticated
  using (auth.uid() = user_id);

-- Refresh PostgREST's schema cache immediately after applying this migration.
notify pgrst, 'reload schema';
