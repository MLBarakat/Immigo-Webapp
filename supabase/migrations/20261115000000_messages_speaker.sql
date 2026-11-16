-- Speaker attribution for transcript export (F6).
-- Ephemeral UI bubbles (daily banner, progress cards) are never persisted, so
-- every stored assistant message belongs to one of the durable voices.
alter table public.messages
  add column speaker text
  constraint messages_speaker_check
  check (speaker is null or speaker in ('officer', 'practice_coach', 'study_coach', 'system', 'report', 'user'));

comment on column public.messages.speaker is
  'Durable transcript voice for the message. Null on legacy rows and on user messages, where role supplies the label.';

-- Backfill from the F3 action payload so already-persisted guided messages
-- keep their voice after this migration.
update public.messages
set speaker = case
  when actions @> '[{"kind":"ready"}]'::jsonb
    or actions @> '[{"kind":"exam"}]'::jsonb then 'officer'
  when actions @> '[{"kind":"learn","mode":"study"}]'::jsonb then 'study_coach'
  when actions @> '[{"kind":"learn"}]'::jsonb then 'practice_coach'
  when actions @> '[{"kind":"report"}]'::jsonb then 'report'
  else speaker
end
where role = 'assistant'
  and speaker is null
  and actions is not null;
