-- Keep one active device identifier per user. A new device atomically replaces
-- the previous claim, which active clients observe through Supabase Realtime.
CREATE TABLE IF NOT EXISTS active_user_sessions (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id   UUID NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE active_user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their active device session" ON active_user_sessions;
CREATE POLICY "Users can read their active device session"
  ON active_user_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can claim their active device session" ON active_user_sessions;
CREATE POLICY "Users can claim their active device session"
  ON active_user_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can replace their active device session" ON active_user_sessions;
CREATE POLICY "Users can replace their active device session"
  ON active_user_sessions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'active_user_sessions'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.active_user_sessions;
  END IF;
END;
$$;
