-- A learner has one accumulated conversation per device-local calendar day.
-- Older session rows remain valid with NULL local_date.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS local_date DATE,
  ADD COLUMN IF NOT EXISTS local_timezone TEXT,
  ADD COLUMN IF NOT EXISTS current_item_id TEXT,
  ADD COLUMN IF NOT EXISTS current_goal TEXT,
  ADD COLUMN IF NOT EXISTS mode_goal_pending BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_mode TEXT NOT NULL DEFAULT 'standard'
    CHECK (current_mode IN ('standard', 'practice', 'study')),
  ADD COLUMN IF NOT EXISTS test_version TEXT NOT NULL DEFAULT '2020'
    CHECK (test_version IN ('2008', '2020')),
  ADD COLUMN IF NOT EXISTS include_english_simulation BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_user_local_date
  ON sessions (user_id, local_date)
  WHERE local_date IS NOT NULL;

ALTER TABLE graded_answers
  ADD COLUMN IF NOT EXISTS simulation_mode TEXT NOT NULL DEFAULT 'standard'
    CHECK (simulation_mode IN ('standard', 'practice', 'study')),
  ADD COLUMN IF NOT EXISTS test_version TEXT NOT NULL DEFAULT '2020'
    CHECK (test_version IN ('2008', '2020')),
  ADD COLUMN IF NOT EXISTS confidence SMALLINT
    CHECK (confidence IS NULL OR confidence BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS used_hint BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS mock_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  test_version TEXT NOT NULL CHECK (test_version IN ('2008', '2020')),
  include_english_simulation BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  question_ids TEXT[] NOT NULL DEFAULT '{}',
  current_index INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  report_markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mock_exams_user_created
  ON mock_exams (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mock_exam_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('correct', 'incorrect', 'partial')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mock_exam_answers_exam
  ON mock_exam_answers (exam_id, created_at);

ALTER TABLE mock_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_exam_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own mock exams" ON mock_exams;
CREATE POLICY "Users own mock exams" ON mock_exams
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own mock exam answers" ON mock_exam_answers;
CREATE POLICY "Users own mock exam answers" ON mock_exam_answers
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Per-question mastery is derived from authoritative grades, not from LLM text.
CREATE OR REPLACE VIEW question_mastery
WITH (security_invoker = true)
AS
SELECT
  user_id,
  test_version,
  item_id,
  COUNT(*)::INTEGER AS attempts,
  COUNT(*) FILTER (WHERE verdict = 'correct')::INTEGER AS correct_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE verdict = 'correct') / NULLIF(COUNT(*), 0), 1) AS mastery_pct,
  (COUNT(*) >= 3 AND COUNT(*) FILTER (WHERE verdict = 'correct')::NUMERIC / COUNT(*) > 0.85) AS mastered
FROM graded_answers
GROUP BY user_id, test_version, item_id;
