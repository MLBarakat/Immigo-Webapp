-- Add per-message action payloads (F3, narrowed by F8).
-- Only 'ready' and 'learn' action kinds are persisted; 'focus' actions are
-- removed by F8 (card is the only action surface).
alter table public.messages
  add column actions jsonb;

create index idx_messages_actions on public.messages using gin (actions);
