-- Client-generated message ID for idempotent dedupe on hydration (F-07).
-- The client sends a stable ID with every outgoing message. The server stores it
-- alongside the generated UUID so a refresh never duplicates the same logical turn.
alter table public.messages
  add column client_message_id text;

-- Unique per-session so a given client message can only be persisted once.
create unique index messages_client_id_unique
  on public.messages (session_id, client_message_id)
  where client_message_id is not null;

comment on column public.messages.client_message_id is
  'Client-generated message ID for idempotent dedupe. Sent by the client on every message (user and assistant).';