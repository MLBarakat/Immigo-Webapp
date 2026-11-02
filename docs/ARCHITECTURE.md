# ImmiGO Architecture

**Status:** Current, verified against the repository on 2026-10-31.  
**Authority:** This document describes what the code actually does. If it disagrees with `README.md`, this document wins until the README is corrected.

## 1. Runtime overview

```text
Browser
  ├─ React 18 + TypeScript + Vite + Tailwind
  ├─ Supabase Auth session + Supabase Postgres client
  ├─ Silero VAD + Whisper worker (ONNX/WASM)
  └─ HTTPS fetch with Bearer token
        │
        ▼
API Gateway (REST)
  ├─ POST /transcript        -> transcript Lambda
  ├─ POST /complete-session  -> aggregateSession Lambda
  └─ POST /delete-account    -> deleteAccount Lambda
        │
        ├─ Supabase Postgres (RLS)
        ├─ Amazon Bedrock (generation + embeddings)
        └─ Amazon Polly (speech synthesis)
```

## 2. Authentication and data

- **Auth provider:** Supabase Auth (`src/context/AuthContext.tsx`, `src/supabaseClient.ts`).
- **Amplify Auth is not the user auth provider.** Amplify Gen 2 provides backend resources, hosting, API Gateway, Lambda, and storage.
- **Authorization:** Supabase RLS. Client queries are user-scoped; backend routes validate the bearer token and scope queries by `user_id`.
- **Schema:** `supabase/migrations/` is the source of truth. The first migration is a baseline of the existing hosted schema; later migrations advance it. Generated TypeScript types and `docs/DATABASE.md` stay in sync with migrations, and `npm run db:verify` checks catalog-level RLS, grant, and cascade invariants.
- **Single active device:** `active_user_sessions` plus Realtime signals session replacement. Preserve this behavior.

## 3. Backend functions

| Function | Route | Responsibility | Timeout |
|---|---|---|---|
| `transcript` | `POST /transcript` | Auth, turn interpretation, civics grading, feedback, Polly audio | 60s |
| `aggregateSession` | `POST /complete-session` | Aggregate messages/graded answers into a daily report via Bedrock | 120s |
| `deleteAccount` | `POST /delete-account` | Authenticate caller and delete their Supabase user (cascade) | default |

All three use raw `APIGatewayProxyEvent` handlers. There is no Express router, `serverless-http`, or shared route layer. Do not introduce one without an ADR.

`amplify/backend.ts` wires the routes, IAM policies, environment variables, and API Gateway output. `amplify/functions/*/resource.ts` defines each function's runtime.

## 4. Transcript domain

`amplify/functions/transcript/` contains:

- `handler.ts` — API Gateway entry, auth, request parsing, response/Polly orchestration. It is large; treat it as a characterization-test target before refactoring.
- `turn/turn-interpreter.ts` — interprets the user's turn.
- `turn/turn-policy.ts` — decides grading/confirmation/hint/repeat/progress behavior.
- `turn/matching.ts` — answer matching and similarity.
- `turn/bank.ts` — civics question bank access.
- `english-exercises.ts` — mock-exam English reading/writing exercises.
- `civics-bank.*.json` — question banks.

The turn modules are the safest place to change grading behavior. The handler is the contract boundary.

## 5. Frontend boundaries

| Area | Key files | Rules |
|---|---|---|
| Auth/session | `src/context/AuthContext.tsx`, `src/supabaseClient.ts` | Server-validated token; no secrets; preserve session replacement |
| Conversation state | `src/hooks/useConversation.ts`, `src/context/ConversationContext.tsx` | Preserve message ordering, persistence, and mode changes |
| Voice/transcription | `src/hooks/useVAD.ts`, `src/hooks/useWhisper.ts`, `src/context/transcriptionReducer.ts`, `src/workers/whisper.worker.ts`, `src/utils/AudioRingBuffer.ts` | Clean up workers/streams; preserve FSM guards and reconciliation |
| UI | `src/components/` | i18n/RTL, accessibility, responsive behavior |
| Services | `src/services/` | Typed API calls, error propagation, no silent failures |
| Observability | `src/logger.ts`, `src/ErrorBoundary.tsx` | Structured context, no PII/secrets |

## 6. API contracts

The frontend `ApiClient` and backend handlers share these contracts:

- `POST /transcript` — transcript/session-start request, response text, optional base64 MP3, grading verdict, next question, confirmation state.
- `POST /complete-session` — `{ sessionId }`, response report markdown.
- `POST /delete-account` — authenticated deletion, `{ deleted: true }`.

Contract changes require:

1. A feature spec delta.
2. Updated frontend and backend types.
3. Handler tests for success, validation, auth, and downstream failure.
4. An E2E or contract test that exercises the changed shape.

## 7. Known risks

- `amplify/functions/transcript/handler.ts` is a large mixed-responsibility module. Do not refactor it without characterization tests.
- `aggregateSession` and `deleteAccount` have handler contract tests for auth, validation, success, and downstream failure. Their live Supabase/Bedrock paths are still covered only by integration or manual checks; add a live test before changing those paths.
- Coverage is a ratchet, not a target. Some modules are intentionally hard to unit test (workers, media, browser APIs); use integration/E2E coverage for those.
- E2E tests are largely network-mocked. They prove UI wiring, not backend contracts. Backend contract tests are separate.
- Documentation drift has occurred before (Amplify Auth vs Supabase Auth, Express vs raw handlers). Update this document when architecture changes.

## 8. Decisions

- `docs/adr/0001-backend-architecture.md` — Lambda-per-domain, raw API Gateway handlers.
- `docs/adr/0002-supabase-auth-and-rls.md` — Supabase Auth/Postgres/RLS; Amplify for backend hosting.
- `docs/adr/0003-server-authoritative-grading.md` — grading is server-side.
- `docs/adr/0004-verification-and-release-policy.md` — `npm run verify` gate and feature contracts.
- `docs/adr/0005-supabase-baseline-and-db-governance.md` — schema baseline, security hardening, and database governance.

Do not reverse an accepted ADR without a new ADR and explicit approval.
