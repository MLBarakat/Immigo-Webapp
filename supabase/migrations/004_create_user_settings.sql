-- ============================================================
--  user_settings table migration
--  Run this in the Supabase SQL Editor (or as a migration file).
-- ============================================================

create table if not exists public.user_settings (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  language              text        not null default 'en-US',
  theme                 text        not null default 'system',
  ai_voice_id           text,
  live_feedback_enabled boolean     not null default true,
  mic_mode              text        not null default 'voice_activity',
  barge_in              text        not null default 'balanced',
  progress_report_frequency text    not null default 'after_session',
  font_size             text                 default 'default',
  has_seen_welcome      boolean     not null default false,
  updated_at            timestamptz not null default now()
);

-- If the table already existed, CREATE TABLE IF NOT EXISTS does not add
-- missing columns. Keep this migration safe to rerun from the SQL editor.
alter table public.user_settings
  add column if not exists language text not null default 'en-US',
  add column if not exists theme text not null default 'system',
  add column if not exists ai_voice_id text,
  add column if not exists live_feedback_enabled boolean not null default true,
  add column if not exists mic_mode text not null default 'voice_activity',
  add column if not exists barge_in text not null default 'balanced',
  add column if not exists progress_report_frequency text not null default 'after_session',
  add column if not exists font_size text default 'default',
  add column if not exists has_seen_welcome boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- Automatically refresh updated_at on every row update.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute procedure public.set_updated_at();

-- ============================================================
--  Row-Level Security
-- ============================================================
alter table public.user_settings enable row level security;

-- Users can only read their own row.
drop policy if exists "Users can view own settings" on public.user_settings;
create policy "Users can view own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

-- Users can insert their own row (sign-up path).
drop policy if exists "Users can insert own settings" on public.user_settings;
create policy "Users can insert own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

-- Users can update their own row.
drop policy if exists "Users can update own settings" on public.user_settings;
create policy "Users can update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id);

-- ============================================================
--  Backfill existing users (optional one-time migration)
--  This creates a default settings row for any user who already
--  exists in auth.users but has no row in user_settings yet.
-- ============================================================
insert into public.user_settings (user_id)
select id from auth.users
where id not in (select user_id from public.user_settings)
on conflict (user_id) do nothing;

-- Copy the existing profile language into settings for projects that already
-- had users before language became part of user_settings.
do $$
begin
  if to_regclass('public.profiles') is not null then
    update public.user_settings as us
    set language = p.language
    from public.profiles as p
    where us.user_id = p.id
      and p.language is not null
      and us.language = 'en-US';
  end if;
end;
$$;

-- Ask Supabase/PostgREST to refresh its schema cache after column changes.
notify pgrst, 'reload schema';
