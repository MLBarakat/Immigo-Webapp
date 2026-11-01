---
name: codebase-understanding
description: Use to explain an ImmiGO feature, trace data flow, locate ownership, map dependencies, or understand how browser, API Gateway, Lambda, Supabase, Bedrock, and Polly interact.
---

# Codebase Understanding

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, `docs/features.json`.

Use this skill when the question is "how does this work?" or "where does this live?" rather than "change this."

## Method

1. Start at the named file, symbol, or feature ID.
2. Follow real imports, calls, state transitions, database queries, and tests. Do not infer from filenames.
3. Identify the execution boundary: browser, API Gateway, Lambda, Supabase, Bedrock, Polly, or storage.
4. Read the mapped tests. They show the intended contract and the failure modes.
5. Cite exact paths and line-level symbols where useful.
6. Mark unknowns explicitly. Do not guess a schema, env var, or runtime detail.

## Useful anchors

- Auth and session: `src/context/AuthContext.tsx`, `src/supabaseClient.ts`.
- Transcription: `src/context/TranscriptionContext.tsx`, `src/hooks/useWhisper.ts`, `src/workers/whisper.worker.ts`.
- Conversation: `src/hooks/useConversation.ts`, `src/context/ConversationContext.tsx`.
- Grading: `amplify/functions/transcript/turn/`.
- Reports: `amplify/functions/aggregateSession/handler.ts`.
- Data: `supabase/migrations/`.
- Contracts: `src/services/apiClient.ts`, `amplify/backend.ts`.

## Output

Prefer a short numbered flow for lifecycle questions. Distinguish confirmed behavior from assumptions. End with the next file to inspect when evidence is incomplete.

## Done when

- [ ] The explanation is grounded in real imports and tests.
- [ ] Boundaries and ownership are explicit.
- [ ] Unknowns are marked, not guessed.
- [ ] The answer stays scoped to the question.
