-- 002_graded_answers.sql
-- Stores each server-graded civics answer so progress/scoring can be computed
-- from an authoritative source. Written by the transcript Lambda under the
-- user's JWT (RLS-scoped), so the client cannot fabricate verdicts.

CREATE TABLE IF NOT EXISTS graded_answers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES sessions(id) ON DELETE SET NULL,
  item_id     TEXT NOT NULL,
  verdict     TEXT NOT NULL CHECK (verdict IN ('correct', 'incorrect', 'partial')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graded_answers_user    ON graded_answers (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_graded_answers_session ON graded_answers (session_id);
CREATE INDEX IF NOT EXISTS idx_graded_answers_item    ON graded_answers (user_id, item_id);

ALTER TABLE graded_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their graded answers" ON graded_answers;
CREATE POLICY "Users own their graded answers" ON graded_answers
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
