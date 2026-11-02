-- Security hardening for the objects that came in with the remote baseline.
--
-- The baseline (`20261101133556_remote_schema.sql`) reproduces the hosted schema
-- exactly, including three gaps that were live in production:
--   1. `session_reports` had RLS disabled and granted ALL to anon.
--   2. `profiles` had a public SELECT policy exposing every profile.
--   3. Helper/RPC functions were executable by anon.
--
-- This migration closes those gaps. It is intentionally written so that it can
-- be applied to the hosted project as-is (dashboard SQL or `supabase db push`).

-- ---------------------------------------------------------------------------
-- profiles: owner-only reads
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Users can view their own profile." on public.profiles;

create policy "Users can view their own profile."
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- Re-scope the existing owner-write policies to authenticated only. The
-- predicates are unchanged; this just removes the anon role from the policy.
drop policy if exists "Users can insert their own profile." on public.profiles;
create policy "Users can insert their own profile."
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile." on public.profiles;
create policy "Users can update their own profile."
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- session_reports: RLS, owner policies, cascading delete, no anon access
-- ---------------------------------------------------------------------------
alter table public.session_reports enable row level security;

drop policy if exists "Users can view their own session reports." on public.session_reports;
create policy "Users can view their own session reports."
  on public.session_reports
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own session reports." on public.session_reports;
create policy "Users can insert their own session reports."
  on public.session_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own session reports." on public.session_reports;
create policy "Users can update their own session reports."
  on public.session_reports
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own session reports." on public.session_reports;
create policy "Users can delete their own session reports."
  on public.session_reports
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Deleting an auth user must not leave orphaned reports (and must not fail
-- because of an unhandled FK).
alter table public.session_reports
  drop constraint if exists session_reports_user_id_fkey;
alter table public.session_reports
  add constraint session_reports_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

revoke all on table public.session_reports from anon;

-- ---------------------------------------------------------------------------
-- profiles: backfill any auth users that predate the signup trigger
-- ---------------------------------------------------------------------------
insert into public.profiles (id, full_name, language)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', 'User'),
  coalesce(u.raw_user_meta_data ->> 'language', 'en-US')
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- functions: no anon execution, pin the signup trigger's search_path
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, full_name, language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'User'),
    coalesce(new.raw_user_meta_data ->> 'language', 'en-US')
  );
  return new;
end;
$function$;

-- Trigger-only helpers never need direct EXECUTE for clients. Triggers do not
-- check EXECUTE on the trigger function, so revoking it is safe.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;

-- These are reachable as PostgREST RPCs today. Keep them available only to the
-- roles that actually need them.
revoke execute on function public.purge_old_messages() from public, anon, authenticated;
revoke execute on function public.match_progress_reports(vector, double precision, integer, uuid) from public, anon;
revoke execute on function public.get_or_create_daily_learning_session(uuid, text) from public, anon;
grant execute on function public.get_or_create_daily_learning_session(uuid, text) to authenticated;
