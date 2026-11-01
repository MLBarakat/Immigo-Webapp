# ImmiGO — Gemini Adapter

**Canonical contract:** [`AGENTS.md`](AGENTS.md). Read it first. This file only summarizes the entry points; it must not drift into a second rulebook.

## Required reading order

1. `AGENTS.md`
2. `docs/CONSTITUTION.md`
3. `docs/FEATURES.md` and `docs/features.json`
4. `docs/ARCHITECTURE.md` and the relevant ADR
5. The tests mapped to the feature you are changing

## Non-negotiables

- Supabase Auth, Postgres, and RLS own authentication and user data.
- Amplify Gen 2 owns backend hosting, API Gateway, Lambda, and storage.
- Handlers are raw `APIGatewayProxyEvent` functions. No Express or `serverless-http`.
- Civics grading is server-side.
- Secrets never enter `VITE_*`, client code, logs, tests, or commits.
- Tests exercise production code. No copied reducers, parsers, or policies.
- No protected test may be deleted, skipped, or weakened.
- No new runtime dependency without approval.

## Workflow

Plan in five lines (feature ID, behavior, files, tests, risk). Add a failing test, make the smallest fix, run `npm run verify`, update the registry, attach the change receipt.

## Stop and ask

Stop for protected behavior changes, unexplained test failures, repo/doc conflicts, schema/auth/API/dependency changes, or broad refactors without characterization tests.

## Commands

`npm run verify` · `npm run verify:governance` · `npm run test:e2e` · `npm run eval:civics`
