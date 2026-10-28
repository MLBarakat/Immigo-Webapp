-- Persist the learner's home state and account-wide daily-session time zone.
-- NULL values remain valid for existing accounts until the learner chooses a
-- location. The application uses UTC as a consistent legacy-account fallback.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS location_state TEXT,
  ADD COLUMN IF NOT EXISTS account_timezone TEXT;

ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_location_state_check,
  ADD CONSTRAINT user_settings_location_state_check
    CHECK (location_state IS NULL OR location_state IN (
      'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
      'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
      'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
    ));

-- Resolve daily boundaries against the database clock and account time zone.
-- A per-user transaction lock prevents duplicate sessions when multiple
-- devices start around midnight at the same time.
CREATE OR REPLACE FUNCTION public.get_or_create_daily_learning_session(
  p_user_id UUID,
  p_timezone TEXT
)
RETURNS SETOF public.sessions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.get_or_create_daily_learning_session(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_daily_learning_session(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
