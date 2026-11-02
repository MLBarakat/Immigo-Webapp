-- Durable learner focus and an optional weekly graded-answer target.
-- Roll back app code without dropping these columns so saved values remain intact.
-- Drop the constraints and columns only after confirming there is no user data to preserve.
alter table public.user_settings
  add column if not exists learning_goal text,
  add column if not exists weekly_graded_answer_target integer;

alter table public.user_settings
  drop constraint if exists user_settings_learning_goal_length_check,
  drop constraint if exists user_settings_weekly_target_positive_check;

alter table public.user_settings
  add constraint user_settings_learning_goal_length_check
    check (learning_goal is null or char_length(btrim(learning_goal)) between 1 and 300),
  add constraint user_settings_weekly_target_positive_check
    check (weekly_graded_answer_target is null or weekly_graded_answer_target > 0);
