-- Persist the optional English reading and writing portions of mock exams.
ALTER TABLE mock_exams
  ADD COLUMN IF NOT EXISTS english_stage TEXT NOT NULL DEFAULT 'none'
    CHECK (english_stage IN ('none', 'reading', 'writing', 'complete')),
  ADD COLUMN IF NOT EXISTS reading_prompt_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS writing_prompt_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reading_passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS writing_passed BOOLEAN;

CREATE TABLE IF NOT EXISTS mock_exam_english_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  section TEXT NOT NULL CHECK (section IN ('reading', 'writing')),
  prompt_id TEXT NOT NULL,
  prompt_index SMALLINT NOT NULL CHECK (prompt_index BETWEEN 0 AND 2),
  response_text TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('correct', 'incorrect', 'uncertain')),
  feedback TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, section, prompt_index)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mock_exam_english_answers_request
  ON mock_exam_english_answers (exam_id, request_id);

CREATE INDEX IF NOT EXISTS idx_mock_exam_english_answers_exam
  ON mock_exam_english_answers (exam_id, section, prompt_index);

ALTER TABLE mock_exam_english_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own mock exam English answers" ON mock_exam_english_answers;
CREATE POLICY "Users own mock exam English answers" ON mock_exam_english_answers
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
