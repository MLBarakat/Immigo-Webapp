-- ============================================================
--  Notification and audio device preferences
--  Extends user_settings with local notification preferences and
--  the selected microphone / speaker device IDs.
--  Run this in the Supabase SQL Editor (or as a migration file).
-- ============================================================

alter table public.user_settings
  add column if not exists notifications_enabled boolean not null default false,
  add column if not exists reminder_time         text    not null default '19:00',
  add column if not exists input_device_id       text,
  add column if not exists output_device_id      text;

-- Refresh PostgREST's schema cache immediately after applying this migration.
notify pgrst, 'reload schema';
