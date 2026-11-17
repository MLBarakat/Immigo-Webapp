-- Practice/Study Ready gate (F-13/F-14).
-- The learner confirms the mode and focus, then explicitly chooses Ready
-- before the first question is selected. Standard already works this way.
alter table public.sessions
  add column mode_ready_pending boolean not null default false;

comment on column public.sessions.mode_ready_pending is
  'True while a Practice/Study session waits for the learner to choose Ready.';

-- The focus card and the Ready gate are mutually exclusive onboarding steps.
alter table public.sessions
  add constraint sessions_mode_onboarding_exclusive
  check (not (mode_goal_pending and mode_ready_pending));
