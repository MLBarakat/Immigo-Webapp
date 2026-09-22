-- ============================================================
--  user_settings table migration
--  Run this in the Supabase SQL Editor (or as a migration file).
-- ============================================================

create table if not exists public.user_settings (
  user_id               uuid primary key references auth.users(id) on delete cascade,
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
create policy "Users can view own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

-- Users can insert their own row (sign-up path).
create policy "Users can insert own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

-- Users can update their own row.
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
