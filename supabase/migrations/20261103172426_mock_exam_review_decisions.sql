-- Persist one explicit, immutable next-step choice per completed interview.
-- Roll back only before choices are collected. After adoption, keep these
-- fields and use a forward migration so saved user decisions are not lost.
alter table public.mock_exams
  add column review_decision text,
  add column review_decision_note text,
  add column review_decision_at timestamptz,
  add constraint mock_exams_review_decision_check
    check (
      review_decision is null
      or review_decision = any (array[
        'practice'::text,
        'study'::text,
        'new_interview'::text,
        'review_answers'::text,
        'finish_for_now'::text
      ])
    ),
  add constraint mock_exams_review_decision_timestamp_check
    check (
      (review_decision is null and review_decision_note is null and review_decision_at is null)
      or (review_decision is not null and review_decision_at is not null)
    ),
  add constraint mock_exams_review_decision_note_check
    check (
      (
        review_decision in ('practice', 'study')
        and review_decision_note is not null
        and char_length(btrim(review_decision_note)) between 1 and 300
      )
      or (
        review_decision is not null
        and review_decision not in ('practice', 'study')
        and review_decision_note is null
      )
      or (review_decision is null and review_decision_note is null)
    );

create function public.guard_mock_exam_review_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.review_decision is not null
      or new.review_decision_note is not null
      or new.review_decision_at is not null then
      raise exception 'Interview decisions must be saved through the decision function'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.review_decision is not null then
    if new.review_decision is distinct from old.review_decision
      or new.review_decision_note is distinct from old.review_decision_note
      or new.review_decision_at is distinct from old.review_decision_at then
      raise exception 'Interview decisions are immutable'
        using errcode = '23514';
    end if;
  elsif new.review_decision is not null
    and pg_catalog.current_setting('immigo.mock_exam_review_decision_write', true) is distinct from 'on' then
    raise exception 'Interview decisions must be saved through the decision function'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_mock_exam_review_decision() from public, anon, authenticated;

create trigger guard_mock_exam_review_decision_insert
  before insert on public.mock_exams
  for each row execute function public.guard_mock_exam_review_decision();

create trigger guard_mock_exam_review_decision_update
  before update of review_decision, review_decision_note, review_decision_at on public.mock_exams
  for each row execute function public.guard_mock_exam_review_decision();

create function public.record_mock_exam_review_decision(
  p_exam_id uuid,
  p_decision text,
  p_note text
)
returns table (
  saved boolean,
  review_decision text,
  review_decision_note text,
  review_decision_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  exam_row public.mock_exams%rowtype;
begin
  p_note := nullif(pg_catalog.btrim(p_note), '');

  if auth.uid() is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in (
    'practice',
    'study',
    'new_interview',
    'review_answers',
    'finish_for_now'
  ) then
    raise exception 'Invalid interview decision'
      using errcode = '22023';
  end if;

  if p_decision in ('practice', 'study') then
    if p_note is null or char_length(btrim(p_note)) not between 1 and 300 then
      raise exception 'A learning focus is required for this decision'
        using errcode = '22023';
    end if;
  elsif p_note is not null then
    raise exception 'A learning focus is only valid for a Practice or Study decision'
      using errcode = '22023';
  end if;

  perform pg_catalog.set_config('immigo.mock_exam_review_decision_write', 'on', true);
  update public.mock_exams as exam
  set review_decision = p_decision,
      review_decision_note = p_note,
      review_decision_at = pg_catalog.now()
  where exam.id = p_exam_id
    and exam.user_id = auth.uid()
    and exam.status = 'completed'
    and exam.review_decision is null
  returning exam.* into exam_row;

  if found then
    if p_decision in ('practice', 'study') then
      update public.user_settings
      set learning_goal = p_note
      where user_id = auth.uid();
      if not found then
        raise exception 'Account learning settings are unavailable'
          using errcode = 'P0002';
      end if;
    end if;

    return query select
      true,
      exam_row.review_decision,
      exam_row.review_decision_note,
      exam_row.review_decision_at;
    return;
  end if;

  select exam.*
  into exam_row
  from public.mock_exams as exam
  where exam.id = p_exam_id
    and exam.user_id = auth.uid()
    and exam.status = 'completed';

  if not found then
    raise exception 'Completed interview was not found'
      using errcode = 'P0002';
  end if;

  return query select
    false,
    exam_row.review_decision,
    exam_row.review_decision_note,
    exam_row.review_decision_at;
end;
$$;

revoke all on function public.record_mock_exam_review_decision(uuid, text, text) from public, anon;
grant execute on function public.record_mock_exam_review_decision(uuid, text, text) to authenticated;
