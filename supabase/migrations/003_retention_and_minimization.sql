-- 003_retention_and_minimization.sql
-- Data minimization (LEG-02 / DAT-01):
--   1. Purge conversation messages older than 7 days (keep the learning signal,
--      graded_answers + daily_progress_reports, which are low-PII and durable).
--   2. Drop the unused audio_url column so no one can later wire up audio storage.
-- Account-deletion already cascades from auth.users (see 001/002), so no change
-- is needed there — deleting a user removes sessions, messages, graded_answers,
-- and daily_progress_reports automatically.

-- 1) Remove the never-written audio column (minimization + future-proofing).
ALTER TABLE messages DROP COLUMN IF EXISTS audio_url;

-- 2) Scheduled 7-day purge of conversation messages via pg_cron.
--    pg_cron runs the DELETE as a privileged job (bypasses RLS), which is what a
--    global retention sweep needs. If pg_cron is not enabled on your project,
--    enable it in Supabase: Dashboard -> Database -> Extensions -> pg_cron.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- A helper function keeps the schedule readable and lets you unit-test/purge on demand.
CREATE OR REPLACE FUNCTION purge_old_messages()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.messages WHERE created_at < now() - interval '7 days';
$$;

-- (Re)schedule the daily purge at 03:15 UTC. Unschedule first to stay idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('purge-old-messages')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-old-messages');
EXCEPTION WHEN undefined_table THEN
  -- cron schema not present yet in some environments; ignore.
  NULL;
END $$;

SELECT cron.schedule('purge-old-messages', '15 3 * * *', $$SELECT public.purge_old_messages();$$);
