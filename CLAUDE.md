# ImmiGO — Claude Adapter

**Canonical contract:** [`AGENTS.md`](AGENTS.md). Read it before doing anything else. This file is a pointer, not a second rulebook.

## Required reading order

1. `AGENTS.md`
2. `docs/CONSTITUTION.md`
3. `docs/FEATURES.md` and `docs/features.json`
4. `docs/ARCHITECTURE.md` and the relevant ADR
5. The tests mapped to the feature you are changing

## Non-negotiables

- Supabase Auth is the auth provider. Amplify provides backend hosting, API Gateway, Lambda, and storage.
- Backend handlers are raw API Gateway handlers. Do not introduce Express, `serverless-http`, or a new framework.
- Civics grading is server-side. The client never decides correctness.
- RLS is the data security boundary. Never weaken it to make a test pass.
- Tests must exercise production code. Do not copy production logic into a test.
- Never delete, skip, or weaken a feature test to make CI pass.
- No new runtime dependency without explicit approval.
- Do not push directly to `main` or `dev`.

## Workflow

1. Post a 5-line plan: feature ID, behavior, files, tests, risk.
2. Add a failing test for the right reason and show the failure.
3. Make the smallest change that passes.
4. Run `npm run verify` plus the relevant E2E/eval command.
5. Update the feature registry if behavior changed.
6. Attach the change receipt from `AGENTS.md`.

## Stop and ask

Stop if a protected behavior would change, a test fails without a known cause, the repo and docs disagree, or the task needs a schema, auth, API contract, dependency, or broad refactor change.

## Commands

`npm run verify` · `npm run verify:governance` · `npm run test:e2e` · `npm run eval:civics` · `npx vitest run path/to/file.test.ts`
