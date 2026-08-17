-- 001_chat_persistence.sql
-- Enables pgvector, creates sessions, messages, and daily_progress_reports tables with RLS and pgvector search function.

-- 1. Enable pgvector Extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create Updated_at Trigger Helper Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id, started_at DESC);

-- 4. Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  audio_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_user ON messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages (session_id, created_at DESC);

-- 5. Daily Progress Reports Table
CREATE TABLE IF NOT EXISTS daily_progress_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date             DATE NOT NULL DEFAULT CURRENT_DATE,
  report_markdown  TEXT NOT NULL,
  embedding        VECTOR(1024),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_daily_report UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_dpr_user_date ON daily_progress_reports (user_id, date DESC);

-- IVFFlat Index for Fast Cosine Similarity Search over vector(1024)
CREATE INDEX IF NOT EXISTS idx_dpr_embedding ON daily_progress_reports
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Trigger for auto-updating updated_at timestamp on daily_progress_reports
DROP TRIGGER IF EXISTS set_dpr_updated_at ON daily_progress_reports;
CREATE TRIGGER set_dpr_updated_at
  BEFORE UPDATE ON daily_progress_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. Cosine Similarity Vector Search RPC Function
CREATE OR REPLACE FUNCTION match_progress_reports (
  query_embedding VECTOR(1024),
  match_threshold FLOAT,
  match_count INT,
  p_user_id UUID
)
RETURNS TABLE (
  id UUID,
  date DATE,
  report_markdown TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dpr.id,
    dpr.date,
    dpr.report_markdown,
    1 - (dpr.embedding <=> query_embedding) AS similarity
  FROM daily_progress_reports dpr
  WHERE dpr.user_id = p_user_id
    AND dpr.embedding IS NOT NULL
    AND 1 - (dpr.embedding <=> query_embedding) > match_threshold
  ORDER BY dpr.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 7. Row Level Security (RLS) Policies
ALTER TABLE sessions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages               ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_progress_reports ENABLE ROW LEVEL SECURITY;

-- Sessions RLS
DROP POLICY IF EXISTS "Users own their sessions" ON sessions;
CREATE POLICY "Users own their sessions" ON sessions
  FOR ALL USING (auth.uid() = user_id);

-- Messages RLS
DROP POLICY IF EXISTS "Users own their messages" ON messages;
CREATE POLICY "Users own their messages" ON messages
  FOR ALL USING (auth.uid() = user_id);

-- Daily Progress Reports RLS
DROP POLICY IF EXISTS "Users own their reports" ON daily_progress_reports;
CREATE POLICY "Users own their reports" ON daily_progress_reports
  FOR ALL USING (auth.uid() = user_id);
