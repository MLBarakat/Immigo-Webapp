-- Uniform row lifecycle timestamps.
--
-- Every public table except `sessions` now carries `created_at` and
-- `updated_at`, both NOT NULL DEFAULT now(), and maintains `updated_at` with a
-- BEFORE UPDATE trigger.
--
-- `sessions` is intentionally excluded: it models a learning window with
-- started_at / ended_at / local_date, and a synthetic created_at would be
-- misleading.
--
-- Shape is expand -> backfill -> contract:
--   1. add the missing column as nullable with a default;
--   2. backfill existing rows from the most truthful source available;
--   3. set the default and NOT NULL.

-- ---------------------------------------------------------------------------
-- 1. Expand: add missing columns
-- ---------------------------------------------------------------------------
alter table public.active_user_sessions
  add column if not exists created_at timestamptz;

alter table public.feedback
  add column if not exists updated_at timestamptz;

alter table public.graded_answers
  add column if not exists updated_at timestamptz;

alter table public.messages
  add column if not exists updated_at timestamptz;

alter table public.mock_exam_answers
  add column if not exists updated_at timestamptz;

alter table public.mock_exam_english_answers
  add column if not exists updated_at timestamptz;

alter table public.session_reports
  add column if not exists updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Backfill
-- ---------------------------------------------------------------------------
-- A device session row is created and replaced in the same statement, so the
-- row's creation moment equals its first updated_at.
update public.active_user_sessions
   set created_at = updated_at
 where created_at is null;

update public.feedback           set updated_at = created_at where updated_at is null;
update public.graded_answers     set updated_at = created_at where updated_at is null;
update public.messages           set updated_at = created_at where updated_at is null;
update public.mock_exam_answers  set updated_at = created_at where updated_at is null;
update public.mock_exam_english_answers
   set updated_at = created_at
 where updated_at is null;
update public.session_reports    set updated_at = created_at where updated_at is null;

-- Profiles predate this migration with nullable, undefaulted timestamps. Use
-- the auth user's own lifecycle timestamps, which are the truthful values.
update public.profiles p
   set created_at = coalesce(p.created_at, u.created_at, now()),
       updated_at = coalesce(p.updated_at, u.updated_at, u.created_at, now())
  from auth.users u
 where u.id = p.id
   and (p.created_at is null or p.updated_at is null);

update public.profiles set created_at = now() where created_at is null;
update public.profiles set updated_at = created_at where updated_at is null;

-- user_settings rows keep their creation moment where it is already recorded.
update public.user_settings set created_at = updated_at where created_at is null;
update public.user_settings set created_at = now() where created_at is null;
update public.user_settings set updated_at = created_at where updated_at is null;

-- Any column that existed but was nullable.
update public.session_reports set created_at = now() where created_at is null;

-- ---------------------------------------------------------------------------
-- 3. Contract: defaults and NOT NULL
-- ---------------------------------------------------------------------------
alter table public.active_user_sessions
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.feedback
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.graded_answers
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.messages
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.mock_exam_answers
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.mock_exam_english_answers
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.session_reports
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.profiles
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.user_settings
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

-- ---------------------------------------------------------------------------
-- 4. Maintain updated_at on update
-- ---------------------------------------------------------------------------
-- daily_progress_reports and user_settings already have a BEFORE UPDATE
-- trigger; they are left untouched. The rest adopt the shared set_updated_at().
drop trigger if exists set_active_user_sessions_updated_at on public.active_user_sessions;
create trigger set_active_user_sessions_updated_at
  before update on public.active_user_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists set_feedback_updated_at on public.feedback;
create trigger set_feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

drop trigger if exists set_graded_answers_updated_at on public.graded_answers;
create trigger set_graded_answers_updated_at
  before update on public.graded_answers
  for each row execute function public.set_updated_at();

drop trigger if exists set_messages_updated_at on public.messages;
create trigger set_messages_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

drop trigger if exists set_mock_exam_answers_updated_at on public.mock_exam_answers;
create trigger set_mock_exam_answers_updated_at
  before update on public.mock_exam_answers
  for each row execute function public.set_updated_at();

drop trigger if exists set_mock_exam_english_answers_updated_at on public.mock_exam_english_answers;
create trigger set_mock_exam_english_answers_updated_at
  before update on public.mock_exam_english_answers
  for each row execute function public.set_updated_at();

drop trigger if exists set_mock_exams_updated_at on public.mock_exams;
create trigger set_mock_exams_updated_at
  before update on public.mock_exams
  for each row execute function public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_session_reports_updated_at on public.session_reports;
create trigger set_session_reports_updated_at
  before update on public.session_reports
  for each row execute function public.set_updated_at();
