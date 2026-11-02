# ImmiGO Constitution

**Version:** 1.0.0  
**Ratified:** 2026-10-31  
**Authority:** This document defines non-negotiable behavior and architecture. `AGENTS.md` defines the working contract. Feature-specific specs may add rules but may not weaken these.

## 1. Product invariants

### 1.1 Authentication and session ownership

- Supabase Auth is the authentication provider. Amplify Auth is not used for user authentication.
- Every protected backend route validates the caller's Supabase bearer token server-side.
- Authentication is not authorization. Ownership and tenant boundaries are enforced by Supabase RLS and by explicit user-scoped queries.
- A user must never be able to read or mutate another user's sessions, messages, graded answers, reports, settings, or exam data.
- Single-active-device session replacement is intentional behavior. Do not remove or bypass it without an approved spec change.

### 1.2 Civics grading

- Civics answers are graded server-side. The client never decides correctness.
- Partial answers, confirmations, hints, repeats, and progress questions are distinct behaviors. Preserve the turn-policy semantics.
- `graded_answers` is the authoritative record for progress reports. Do not derive scores from prose or from client state.
- A grading change requires a benchmark run and a reviewed prompt/eval change.

### 1.3 Voice and transcription

- Microphone access is user-initiated and consent-gated.
- The VAD/Whisper pipeline must clean up workers, audio nodes, streams, timers, and subscriptions on session end, unmount, and visibility changes.
- Browser speech is speculative; Whisper is the truth ledger. Preserve the state-machine guards and the token-level reconciliation behavior.
- Do not move long-running audio work into a synchronous Lambda request.

### 1.4 Persistence and history

- Sessions, messages, graded answers, reports, settings, and exam data are user-owned rows protected by RLS.
- History pagination must not drop or duplicate messages.
- Transcript download and account deletion are user-visible features with privacy consequences. Preserve them.

### 1.5 Internationalization and accessibility

- The UI supports English, Spanish, French, and Arabic, including RTL layout.
- New user-facing strings belong in the locale files; do not hardcode English in components.
- Preserve semantic HTML, labels, keyboard access, visible focus, focus traps, reduced-motion behavior, and touch-sized controls.

### 1.6 Privacy and secrets

- Never commit credentials, tokens, service-role keys, or personal data.
- Backend secrets stay in deployment configuration. `VITE_*` values are public by definition.
- Logs must not contain raw authorization headers, transcripts, or unnecessary PII.

## 2. Architecture invariants

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, react-i18next.
- **Backend:** Amplify Gen 2 + CDK; one Lambda per domain; raw API Gateway handlers.
- **No Express/serverless-http** unless an accepted ADR replaces this decision.
- **Data:** Supabase Postgres with RLS. Migrations are the only schema source of truth.
- **AI services:** Bedrock for generation/embeddings, Polly for speech synthesis, browser Whisper/VAD for transcription.
- **API contracts:** request/response shapes and status codes are contracts. Change them only with a feature spec and tests.
- **Dependencies:** no new runtime dependency without explicit approval and a bundle/Lambda-size review.

## 3. Engineering invariants

- Every active or protected feature has an entry in `docs/features.json` and at least one executable test.
- Tests must exercise production code. Re-implementing production logic in a test is prohibited.
- A bug fix requires a regression test that fails before the fix.
- No unexplained skipped tests. A skip must carry `// ALLOW_SKIP: <reason>` and an owner.
- No new `any`, `@ts-ignore`, or `eslint-disable` used to bypass a real failure.
- `npm run verify` must pass before a PR is reviewable.
- Required CI jobs may not contain `|| true`, `continue-on-error`, or swallowed setup failures.
- One feature or bug per PR. No drive-by refactors, renames, or dependency upgrades.
- Behavior changes require a spec update. Architecture changes require an ADR.
- Database changes follow expand/contract and include an RLS test.
- Public behavior is protected by contract tests, not by asking a model to remember it.

## 4. Change policy

### 4.1 Protected behavior

A behavior is protected when it appears in `docs/features.json` with status `protected`. Changing it requires:

1. A written spec delta.
2. A failing test that demonstrates the old behavior.
3. Explicit human approval.
4. A test update in the same PR.
5. A note in the change receipt.

### 4.2 Protected paths

The following require explicit approval before editing:

- `AGENTS.md`, `docs/CONSTITUTION.md`, `docs/features.json`
- `.github/workflows/**`
- `supabase/migrations/**`
- `amplify/backend.ts`, `amplify/functions/**/resource.ts`
- `package.json`, lockfiles
- `vite.config.ts`, `playwright.config.ts`, `eslint.config.js`, `tsconfig*.json`

### 4.3 Destructive changes

Deleting a feature, test, migration, route, or data field is a destructive change. It requires a spec, an ADR when architectural, a migration/rollback plan, and explicit approval. Do not let an AI agent perform it autonomously.

## 5. Governance

- `AGENTS.md` is the working contract for all tools.
- `docs/features.json` is the machine-readable feature registry. CI checks it.
- `docs/adr/` records accepted architecture decisions. A conflicting change needs a new ADR.
- `docs/archive/` is historical and must not be followed.
- Amendments follow semantic versioning: MAJOR for removed/redefined invariants, MINOR for additions, PATCH for clarifications.
- Review the constitution and skills quarterly, or after any architecture change.
