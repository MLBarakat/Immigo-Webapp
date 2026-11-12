alter table public.user_settings
  add column if not exists question_bank_test_version text,
  add column if not exists include_english_simulation boolean;

alter table public.user_settings
  drop constraint if exists user_settings_question_bank_test_version_check,
  add constraint user_settings_question_bank_test_version_check
    check (
      question_bank_test_version is null
      or question_bank_test_version in ('2008', '2020')
    );
