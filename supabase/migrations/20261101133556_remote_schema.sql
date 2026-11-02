SET local check_function_bodies = off;

CREATE EXTENSION "pg_cron";

CREATE EXTENSION "vector" SCHEMA "extensions";

CREATE TABLE "public"."active_user_sessions" (
  "user_id"    uuid                     NOT NULL,
  "device_id"  uuid                     NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "active_user_sessions_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."active_user_sessions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."daily_progress_reports" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         uuid                     NOT NULL,
  "date"            date                     NOT NULL DEFAULT CURRENT_DATE,
  "report_markdown" text                     NOT NULL,
  "embedding"       extensions.vector(1024),
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "daily_progress_reports_pkey" PRIMARY KEY (id),
  CONSTRAINT "unique_user_daily_report" UNIQUE (user_id, date)
);

ALTER TABLE "public"."daily_progress_reports"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."feedback" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"             uuid                     NOT NULL,
  "category"            text                     NOT NULL,
  "message"             text                     NOT NULL,
  "email"               text,
  "locale"              text,
  "app_version"         text,
  "user_agent"          text,
  "include_diagnostics" boolean                  NOT NULL DEFAULT true,
  "status"              text                     NOT NULL DEFAULT 'new'::text,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "feedback_category_check" CHECK ((category = ANY (ARRAY['bug'::text, 'feature'::text, 'general'::text, 'compliment'::text]))),
  CONSTRAINT "feedback_message_check" CHECK (((char_length(message) >= 10) AND (char_length(message) <= 4000))),
  CONSTRAINT "feedback_pkey" PRIMARY KEY (id),
  CONSTRAINT "feedback_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'in_review'::text, 'resolved'::text])))
);

ALTER TABLE "public"."feedback"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."graded_answers" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         uuid                     NOT NULL,
  "session_id"      uuid,
  "item_id"         text                     NOT NULL,
  "verdict"         text                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "simulation_mode" text                     NOT NULL DEFAULT 'standard'::text,
  "test_version"    text                     NOT NULL DEFAULT '2020'::text,
  "confidence"      smallint,
  "used_hint"       boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "graded_answers_confidence_check" CHECK (((confidence IS NULL) OR ((confidence >= 1) AND (confidence <= 5)))),
  CONSTRAINT "graded_answers_pkey" PRIMARY KEY (id),
  CONSTRAINT "graded_answers_simulation_mode_check" CHECK ((simulation_mode = ANY (ARRAY['standard'::text, 'practice'::text, 'study'::text]))),
  CONSTRAINT "graded_answers_test_version_check" CHECK ((test_version = ANY (ARRAY['2008'::text, '2020'::text]))),
  CONSTRAINT "graded_answers_verdict_check" CHECK ((verdict = ANY (ARRAY['correct'::text, 'incorrect'::text, 'partial'::text])))
);

ALTER TABLE "public"."graded_answers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."messages" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "session_id" uuid                     NOT NULL,
  "user_id"    uuid                     NOT NULL,
  "role"       text                     NOT NULL,
  "content"    text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "messages_pkey" PRIMARY KEY (id),
  CONSTRAINT "messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);

ALTER TABLE "public"."messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."mock_exam_answers" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "exam_id"    uuid                     NOT NULL,
  "user_id"    uuid                     NOT NULL,
  "item_id"    text                     NOT NULL,
  "verdict"    text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mock_exam_answers_pkey" PRIMARY KEY (id),
  CONSTRAINT "mock_exam_answers_verdict_check" CHECK ((verdict = ANY (ARRAY['correct'::text, 'incorrect'::text, 'partial'::text])))
);

ALTER TABLE "public"."mock_exam_answers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."mock_exam_english_answers" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "exam_id"       uuid                     NOT NULL,
  "user_id"       uuid                     NOT NULL,
  "request_id"    text                     NOT NULL,
  "section"       text                     NOT NULL,
  "prompt_id"     text                     NOT NULL,
  "prompt_index"  smallint                 NOT NULL,
  "response_text" text                     NOT NULL,
  "verdict"       text                     NOT NULL,
  "feedback"      text                     NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mock_exam_english_answers_exam_id_section_prompt_index_key" UNIQUE (exam_id, section, prompt_index),
  CONSTRAINT "mock_exam_english_answers_pkey" PRIMARY KEY (id),
  CONSTRAINT "mock_exam_english_answers_prompt_index_check" CHECK (((prompt_index >= 0) AND (prompt_index <= 2))),
  CONSTRAINT "mock_exam_english_answers_section_check" CHECK ((section = ANY (ARRAY['reading'::text, 'writing'::text]))),
  CONSTRAINT "mock_exam_english_answers_verdict_check" CHECK ((verdict = ANY (ARRAY['correct'::text, 'incorrect'::text, 'uncertain'::text])))
);

ALTER TABLE "public"."mock_exam_english_answers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."mock_exams" (
  "id"                         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                    uuid                     NOT NULL,
  "session_id"                 uuid,
  "test_version"               text                     NOT NULL,
  "include_english_simulation" boolean                  NOT NULL DEFAULT false,
  "status"                     text                     NOT NULL DEFAULT 'in_progress'::text,
  "question_ids"               text[]                   NOT NULL DEFAULT '{}'::text[],
  "current_index"              integer                  NOT NULL DEFAULT 0,
  "correct_count"              integer                  NOT NULL DEFAULT 0,
  "incorrect_count"            integer                  NOT NULL DEFAULT 0,
  "report_markdown"            text,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at"               timestamp with time zone,
  "english_stage"              text                     NOT NULL DEFAULT 'none'::text,
  "reading_prompt_ids"         text[]                   NOT NULL DEFAULT '{}'::text[],
  "writing_prompt_ids"         text[]                   NOT NULL DEFAULT '{}'::text[],
  "reading_passed"             boolean,
  "writing_passed"             boolean,
  CONSTRAINT "mock_exams_english_stage_check" CHECK ((english_stage = ANY (ARRAY['none'::text, 'reading'::text, 'writing'::text, 'complete'::text]))),
  CONSTRAINT "mock_exams_pkey" PRIMARY KEY (id),
  CONSTRAINT "mock_exams_status_check" CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'abandoned'::text]))),
  CONSTRAINT "mock_exams_test_version_check" CHECK ((test_version = ANY (ARRAY['2008'::text, '2020'::text])))
);

ALTER TABLE "public"."mock_exams"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"         uuid                     NOT NULL,
  "full_name"  text,
  "language"   character varying,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."session_reports" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"        uuid,
  "session_id"     uuid,
  "created_at"     timestamp with time zone DEFAULT now(),
  "analytics_data" jsonb,
  CONSTRAINT "session_reports_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."sessions" (
  "id"                         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                    uuid                     NOT NULL,
  "status"                     text                     NOT NULL DEFAULT 'active'::text,
  "started_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "ended_at"                   timestamp with time zone,
  "current_item_id"            text,
  "local_date"                 date,
  "local_timezone"             text,
  "current_goal"               text,
  "mode_goal_pending"          boolean                  NOT NULL DEFAULT false,
  "current_mode"               text                     NOT NULL DEFAULT 'standard'::text,
  "test_version"               text                     NOT NULL DEFAULT '2020'::text,
  "include_english_simulation" boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "sessions_current_mode_check" CHECK ((current_mode = ANY (ARRAY['standard'::text, 'practice'::text, 'study'::text]))),
  CONSTRAINT "sessions_pkey" PRIMARY KEY (id),
  CONSTRAINT "sessions_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text]))),
  CONSTRAINT "sessions_test_version_check" CHECK ((test_version = ANY (ARRAY['2008'::text, '2020'::text])))
);

ALTER TABLE "public"."sessions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."user_settings" (
  "user_id"                   uuid                     NOT NULL,
  "theme"                     text                     NOT NULL DEFAULT 'light'::text,
  "ai_voice_id"               text                     NOT NULL DEFAULT 'Joanna'::text,
  "live_feedback_enabled"     boolean                  NOT NULL DEFAULT true,
  "mic_mode"                  text                     NOT NULL DEFAULT 'voice_activity'::text,
  "barge_in_sensitivity"      double precision         NOT NULL DEFAULT 0.5,
  "progress_report_frequency" text                     NOT NULL DEFAULT 'per_session'::text,
  "font_size"                 text                     NOT NULL DEFAULT 'default'::text,
  "updated_at"                timestamp with time zone DEFAULT now(),
  "created_at"                timestamp with time zone,
  "has_seen_welcome"          boolean                  DEFAULT false,
  "barge_in"                  text                     NOT NULL DEFAULT 'balanced'::text,
  "language"                  text                     NOT NULL DEFAULT 'en-US'::text,
  "mic_consent_version"       text,
  "notifications_enabled"     boolean                  NOT NULL DEFAULT false,
  "reminder_time"             text                     NOT NULL DEFAULT '19:00'::text,
  "input_device_id"           text,
  "output_device_id"          text,
  "location_state"            text,
  "account_timezone"          text,
  CONSTRAINT "user_settings_location_state_check"
    CHECK
    (((location_state IS NULL) OR (location_state = ANY (ARRAY['AL'::text, 'AK'::text, 'AZ'::text, 'AR'::text, 'CA'::text, 'CO'::text, 'CT'::text, 'DE'::text, 'FL'::text,
    'GA'::text,
    'HI'::text,
    'ID'::text,
    'IL'::text,
    'IN'::text,
    'IA'::text,
    'KS'::text,
    'KY'::text,
    'LA'::text,
    'ME'::text,
    'MD'::text,
    'MA'::text,
    'MI'::text,
    'MN'::text,
    'MS'::text,
    'MO'::text,
    'MT'::text,
    'NE'::text,
    'NV'::text,
    'NH'::text,
    'NJ'::text,
    'NM'::text,
    'NY'::text,
    'NC'::text,
    'ND'::text,
    'OH'::text,
    'OK'::text,
    'OR'::text, 'PA'::text, 'RI'::text, 'SC'::text, 'SD'::text, 'TN'::text, 'TX'::text, 'UT'::text, 'VT'::text, 'VA'::text, 'WA'::text, 'WV'::text, 'WI'::text, 'WY'::text])))),
  CONSTRAINT "user_settings_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."user_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_or_create_daily_learning_session (
  p_user_id  uuid,
  p_timezone text
)
  RETURNS SETOF public.sessions
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_session_date DATE;
  v_session public.sessions%ROWTYPE;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Not authorized to access this learner session.' USING ERRCODE = '42501';
  END IF;

  IF p_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_timezone
  ) THEN
    RAISE EXCEPTION 'A valid IANA time zone is required.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));
  v_session_date := (now() AT TIME ZONE p_timezone)::DATE;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE user_id = p_user_id AND local_date = v_session_date
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.sessions
      SET status = 'active', ended_at = NULL,
          local_timezone = COALESCE(local_timezone, p_timezone)
      WHERE id = v_session.id
      RETURNING * INTO v_session;
    RETURN NEXT v_session;
    RETURN;
  END IF;

  -- Preserve an in-progress day's original time-zone boundary if the learner
  -- changed their account preference during that day.
  SELECT * INTO v_session
  FROM public.sessions
  WHERE user_id = p_user_id
    AND local_date IS NOT NULL
    AND local_timezone IN (SELECT name FROM pg_catalog.pg_timezone_names)
    AND (now() AT TIME ZONE local_timezone)::DATE = local_date
  ORDER BY started_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.sessions
      SET status = 'active', ended_at = NULL
      WHERE id = v_session.id
      RETURNING * INTO v_session;
    RETURN NEXT v_session;
    RETURN;
  END IF;

  -- Adopt a same-day session created before daily session dates were stored.
  SELECT * INTO v_session
  FROM public.sessions
  WHERE user_id = p_user_id
    AND local_date IS NULL
    AND (started_at AT TIME ZONE p_timezone)::DATE = v_session_date
  ORDER BY started_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.sessions
      SET local_date = v_session_date, local_timezone = p_timezone,
          status = 'active', ended_at = NULL
      WHERE id = v_session.id
      RETURNING * INTO v_session;
    RETURN NEXT v_session;
    RETURN;
  END IF;

  INSERT INTO public.sessions (user_id, status, local_date, local_timezone)
  VALUES (p_user_id, 'active', v_session_date, p_timezone)
  RETURNING * INTO v_session;

  RETURN NEXT v_session;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
begin
  insert into public.profiles (id, full_name, language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    coalesce(new.raw_user_meta_data->>'language', 'en-US')
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.match_progress_reports (
  query_embedding extensions.vector,
  match_threshold double precision,
  match_count     integer,
  p_user_id       uuid
)
  RETURNS TABLE (
    id              uuid,
    date            date,
    report_markdown text,
    similarity      double precision
  )
  LANGUAGE plpgsql
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.purge_old_messages()
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  DELETE FROM public.messages WHERE created_at < now() - interval '7 days';
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$function$;

ALTER TABLE "public"."active_user_sessions"
  ADD CONSTRAINT "active_user_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."daily_progress_reports"
  ADD CONSTRAINT "daily_progress_reports_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."feedback"
  ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."graded_answers"
  ADD CONSTRAINT "graded_answers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."messages"
  ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."mock_exam_answers"
  ADD CONSTRAINT "mock_exam_answers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."mock_exam_english_answers"
  ADD CONSTRAINT "mock_exam_english_answers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."mock_exam_answers"
  ADD CONSTRAINT "mock_exam_answers_exam_id_fkey" FOREIGN KEY (exam_id) REFERENCES public.mock_exams(id) ON DELETE CASCADE;

ALTER TABLE "public"."mock_exam_english_answers"
  ADD CONSTRAINT "mock_exam_english_answers_exam_id_fkey" FOREIGN KEY (exam_id) REFERENCES public.mock_exams(id) ON DELETE CASCADE;

ALTER TABLE "public"."mock_exams"
  ADD CONSTRAINT "mock_exams_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."session_reports"
  ADD CONSTRAINT "session_reports_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE "public"."graded_answers"
  ADD CONSTRAINT "graded_answers_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;

ALTER TABLE "public"."messages"
  ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE "public"."mock_exams"
  ADD CONSTRAINT "mock_exams_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;

ALTER TABLE "public"."sessions"
  ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."user_settings"
  ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE VIEW "public"."question_mastery" WITH (security_invoker=true) AS  SELECT user_id,
    test_version,
    item_id,
    (count(*))::integer AS attempts,
    (count(*) FILTER (WHERE (verdict = 'correct'::text)))::integer AS correct_count,
    round(((100.0 * (count(*) FILTER (WHERE (verdict = 'correct'::text)))::numeric) / (NULLIF(count(*), 0))::numeric), 1) AS mastery_pct,
    ((count(*) >= 3) AND (((count(*) FILTER (WHERE (verdict = 'correct'::text)))::numeric / (count(*))::numeric) > 0.85)) AS mastered
   FROM public.graded_answers
  GROUP BY user_id, test_version, item_id;

CREATE INDEX idx_dpr_embedding ON public.daily_progress_reports USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists='100');

CREATE INDEX idx_dpr_user_date ON public.daily_progress_reports USING btree (user_id, date DESC);

CREATE INDEX idx_feedback_status_created_at ON public.feedback USING btree (status, created_at DESC);

CREATE INDEX idx_feedback_user_id_created_at ON public.feedback USING btree (user_id, created_at DESC);

CREATE INDEX idx_graded_answers_item ON public.graded_answers USING btree (user_id, item_id);

CREATE INDEX idx_graded_answers_session ON public.graded_answers USING btree (session_id);

CREATE INDEX idx_graded_answers_user ON public.graded_answers USING btree (user_id, created_at DESC);

CREATE INDEX idx_messages_session ON public.messages USING btree (session_id, created_at DESC);

CREATE INDEX idx_messages_user ON public.messages USING btree (user_id, created_at DESC);

CREATE INDEX idx_mock_exam_answers_exam ON public.mock_exam_answers USING btree (exam_id, created_at);

CREATE INDEX idx_mock_exam_english_answers_exam ON public.mock_exam_english_answers USING btree (exam_id, section, prompt_index);

CREATE UNIQUE INDEX idx_mock_exam_english_answers_request ON public.mock_exam_english_answers USING btree (exam_id, request_id);

CREATE INDEX idx_mock_exams_user_created ON public.mock_exams USING btree (user_id, created_at DESC);

CREATE INDEX idx_sessions_user_id ON public.sessions USING btree (user_id, started_at DESC);

CREATE UNIQUE INDEX idx_sessions_user_local_date ON public.sessions USING btree (user_id, local_date)
  WHERE (local_date IS NOT NULL);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER set_dpr_updated_at
  BEFORE UPDATE ON public.daily_progress_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER user_settings_set_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users can claim their active device session" ON "public"."active_user_sessions"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can read their active device session" ON "public"."active_user_sessions"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can replace their active device session" ON "public"."active_user_sessions"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users own their reports" ON "public"."daily_progress_reports"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert their own feedback" ON "public"."feedback"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can read their own feedback" ON "public"."feedback"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));

CREATE POLICY "Users own their graded answers" ON "public"."graded_answers"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users own their messages" ON "public"."messages"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users own mock exam answers" ON "public"."mock_exam_answers"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users own mock exam English answers" ON "public"."mock_exam_english_answers"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users own mock exams" ON "public"."mock_exams"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Public profiles are viewable by everyone." ON "public"."profiles"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "Users can insert their own profile." ON "public"."profiles"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users can update their own profile." ON "public"."profiles"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = id));

CREATE POLICY "Users own their sessions" ON "public"."sessions"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can access their own settings." ON "public"."user_settings"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can insert own settings" ON "public"."user_settings"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can manage their own settings" ON "public"."user_settings"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own settings" ON "public"."user_settings"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own settings" ON "public"."user_settings"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."active_user_sessions";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."profiles";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."user_settings";

COMMENT ON COLUMN "public"."profiles"."created_at" IS 'Date and time of the created record';

COMMENT ON COLUMN "public"."profiles"."updated_at" IS 'Day and time of the last update on the record';

COMMENT ON COLUMN "public"."user_settings"."created_at" IS 'Date and time of the created action';

COMMENT ON COLUMN "public"."user_settings"."has_seen_welcome" IS 'A flag to determine if the user have seen the welcome message upon login the first time.';

COMMENT ON EXTENSION "pg_cron" IS 'Job scheduler for PostgreSQL';

COMMENT ON EXTENSION "vector" IS 'vector data type and ivfflat and hnsw access methods';

REVOKE ALL ON FUNCTION "public"."get_or_create_daily_learning_session"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_or_create_daily_learning_session"(uuid, text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_or_create_daily_learning_session"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_or_create_daily_learning_session"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_or_create_daily_learning_session"(uuid, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."match_progress_reports"(extensions.vector, double precision, integer, uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."match_progress_reports"(extensions.vector, double precision, integer, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."match_progress_reports"(extensions.vector, double precision, integer, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."match_progress_reports"(extensions.vector, double precision, integer, uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."purge_old_messages"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."purge_old_messages"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."purge_old_messages"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."purge_old_messages"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."active_user_sessions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."active_user_sessions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."active_user_sessions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."active_user_sessions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."daily_progress_reports" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."daily_progress_reports" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."daily_progress_reports" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."daily_progress_reports" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."feedback" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."graded_answers" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."graded_answers" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."graded_answers" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."graded_answers" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."messages" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."messages" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."messages" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."messages" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."mock_exam_answers" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."mock_exam_answers" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."mock_exam_answers" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."mock_exam_answers" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."mock_exam_english_answers" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."mock_exam_english_answers" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."mock_exam_english_answers" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."mock_exam_english_answers" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."mock_exams" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."mock_exams" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."mock_exams" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."mock_exams" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."session_reports" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."session_reports" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."session_reports" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."session_reports" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sessions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."sessions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sessions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sessions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_settings" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."user_settings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_settings" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_settings" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."question_mastery" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."question_mastery" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."question_mastery" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."question_mastery" TO "service_role";

SELECT cron.schedule_in_database('purge-old-messages', '15 3 * * *', 'SELECT public.purge_old_messages();', 'postgres', NULL, true);

