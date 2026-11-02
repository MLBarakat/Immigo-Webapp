# ImmiGO Agent Contract

**Version:** 1.0.0  
**Last reviewed:** 2026-10-31  
**Canonical for:** every AI coding tool and human contributor.

> If this file conflicts with another document, stop and ask. Do not guess.

## Read before coding

1. This file.
2. `docs/CONSTITUTION.md` — non-negotiable product and architecture rules.
3. `docs/FEATURES.md` and `docs/features.json` — the protected feature registry.
4. The spec and test map for the feature ID you are changing.
5. `docs/ARCHITECTURE.md` and the relevant ADR.
6. `docs/DATABASE.md` — generated tables, policies, functions, and grants.
7. The tests that protect the behavior.
8. The code.

## Project snapshot

- React 18 + TypeScript + Vite frontend in `src/`.
- Amplify Gen 2 backend in `amplify/`; three Lambda functions: `transcript`, `aggregateSession`, `deleteAccount`.
- Backend handlers are raw API Gateway handlers (`APIGatewayProxyEvent`). There is no Express/serverless-http layer.
- Supabase Auth, Postgres, and RLS own authentication and user data. Amplify provides backend hosting, API Gateway, Lambda, and storage.
- Bedrock and Polly are called from Lambdas. Whisper and Silero VAD run in the browser.
- `amplify/functions/transcript/handler.ts` is large. Do not refactor it without characterization tests.
- `ImmiGO-SpecKit/` is an external historical source pack. It is not authoritative.
- `docs/archive/` contains historical material. Do not follow it.

## Invariants

- Auth is server-authoritative. Protected routes validate the Supabase bearer token; never trust the client.
- Supabase RLS is the data security boundary. Schema changes need a migration, an RLS test, and generated-type updates.
- Database objects are deny-by-default: RLS on every user-owned table, owner-scoped policies, no anon EXECUTE, pinned `search_path` on `SECURITY DEFINER` functions, and cascading `auth.users` foreign keys.
- `docs/DATABASE.md` is generated from a migrated local database. Never hand-edit it.
- Secrets never enter `VITE_*` variables, client code, logs, tests, or commits.
- Preserve API request/response shapes unless the feature spec explicitly changes them.
- Civics grading is server-side. The client never decides correctness.
- Keep the Lambda-per-domain architecture. Do not introduce Express, a new framework, or a new state library without an approved ADR.
- Preserve i18n/RTL, accessibility, and responsive behavior.
- No new runtime dependency without explicit approval.

## Workflow

1. Post a 5-line plan: feature ID, behavior, files, tests, risk.
2. Add or update a test that fails for the right reason; show the failure.
3. Make the smallest change that passes.
4. Run `npm run verify` plus the relevant E2E/eval command.
5. Update the feature spec/registry if behavior changed.
6. Attach a change receipt with commands and results.

## Commands

- `npm run verify` — governance, database, docs, lint, typecheck, unit/integration with coverage, and build. Requires a migrated local Supabase database.
- `npm run verify:governance` — feature registry, skipped-test, and agent-doc checks.
- `npm run db:verify` — catalog checks for RLS, owner policies, function grants, `search_path`, and cascades.
- `npm run docs:db` — regenerate `docs/DATABASE.md` from the local database.
- `npm run docs:db:check` — fail when `docs/DATABASE.md` is stale.
- `npm run test:e2e` — full Playwright suite.
- `npm run eval:civics` — civics grading benchmark.
- `npx vitest run path/to/file.test.ts` — focused test while iterating.

Do not invent commands. If one is missing, ask.

## Database governance

- Local commands only: `npx supabase start`, `npx supabase db reset`, `npm run db:verify`, and `npm run docs:db`.
- An agent may read the catalog, write a migration, and run local verification.
- An agent must not run `supabase link`, `db pull`, `db push`, `migration repair`, or apply SQL to a linked or hosted project. Those are human-approved operational steps.
- Existing environments are cut over with the baseline repair procedure in `docs/MIGRATIONS.md`. Do not improvise a repair.

## Never

- Delete, rename, skip, or weaken a feature test to make CI pass.
- Copy production logic into a test.
- Change a test expectation without a spec/behavior change.
- Do a drive-by refactor, rename, or dependency upgrade.
- Touch auth, schema, API contracts, CI, or governance files without explicit approval.
- Run `supabase link`, `db pull`, `db push`, or `migration repair` against a linked or hosted project.
- Edit an applied migration. Add a new one.
- Use `any`, `@ts-ignore`, `eslint-disable`, or `|| true` to bypass a failure.
- Push directly to `main` or `dev`.

## Stop and ask

- A protected behavior or feature status would change.
- A test fails and you cannot explain why.
- You need a new dependency, schema change, auth change, or API contract change.
- A migration would touch a linked or hosted project, or the baseline repair is required.
- The repo and the docs disagree.
- The task requires deleting a feature or a protected test.
- The task requires a broad refactor without characterization tests.

## Definition of Done

- Feature ID in the PR/commit.
- Red test before, green after.
- `npm run verify` passes.
- No new skipped tests, no new `any`, no secrets.
- Feature registry/spec updated.
- Schema changes include generated types and regenerated `docs/DATABASE.md`.
- Change receipt attached.
- Documentation updated when behavior or architecture changed.

## Change receipt

```text
Feature ID:
Behavior change:
Files changed:
Tests added/updated:
Red evidence (test failed before):
Green evidence (commands + result):
Coverage delta:
Risk / rollback:
Docs updated:
```

## Where to go deeper

- `docs/CONSTITUTION.md` — invariants and governance.
- `docs/ARCHITECTURE.md` — actual runtime architecture and boundaries.
- `docs/DATABASE.md` — generated database reference.
- `docs/FEATURES.md` — human-readable feature registry.
- `docs/features.json` — machine-readable registry used by CI.
- `docs/TESTING.md` — test levels, rules, and coverage policy.
- `docs/CHANGE_POLICY.md` — protected paths, PR size, and approval rules.
- `docs/REVIEW_CHECKLIST.md` — reviewer and second-model checklist.
- `docs/MIGRATIONS.md` — schema and RLS change process.
- `docs/adr/` — accepted architecture decisions.
- `.agents/skills/` — task-specific playbooks.
