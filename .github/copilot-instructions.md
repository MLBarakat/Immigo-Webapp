# ImmiGO Copilot Instructions

The canonical contract is [`AGENTS.md`](../AGENTS.md). Read it before suggesting or editing code. This file is a thin adapter and must not duplicate the full rules.

## Key rules

- React 18 + TypeScript + Vite in `src/`; Amplify Gen 2 + raw API Gateway Lambda handlers in `amplify/`.
- Supabase Auth/Postgres/RLS own auth and user data. Amplify provides backend hosting and infrastructure.
- Do not introduce Express, `serverless-http`, a new state library, or a new runtime dependency.
- Civics grading is server-side. The client never decides correctness.
- Preserve API request/response shapes unless a feature spec explicitly changes them.
- Preserve i18n/RTL, accessibility, responsive behavior, and effect cleanup.
- Tests must exercise production code. Never copy production logic into a test.
- Never delete, skip, or weaken a feature test to make CI pass.
- Never expose secrets in `VITE_*`, client code, logs, tests, or commits.

## Before proposing a change

1. Identify the feature ID in `docs/features.json`.
2. Read the mapped tests.
3. Add a failing test for the right reason.
4. Make the smallest change that passes.
5. Run `npm run verify`.
6. Update the feature registry and attach the change receipt from `AGENTS.md`.

Stop and ask when a protected behavior, schema, auth boundary, API contract, dependency, or broad refactor is involved.
