# ImmiGO Testing Policy

**Version:** 1.0.0  
**Updated:** 2026-10-31  
**Authority:** `docs/CONSTITUTION.md` and `AGENTS.md`.

## 1. The rule

A feature is protected by an executable test, not by a document and not by a model's memory. If behavior matters, a test must fail when that behavior breaks.

Tests must exercise production code. Re-implementing production logic inside a test is prohibited. A test that copies the reducer, parser, matcher, or policy it claims to test proves only that the copy works.

## 2. Test levels

| Level | Tool | Location | Proves |
|---|---|---|---|
| Unit | Vitest | `src/**/__tests__`, `tests/unit`, `amplify/**/__tests__` | Pure logic, reducers, parsers, policies, hooks |
| Component | Vitest + Testing Library | `src/**/__tests__` | User-visible rendering, interaction, accessibility wiring |
| Contract | Vitest | `amplify/functions/**/__tests__` | API status codes, payload shapes, auth, downstream failures |
| Integration | Vitest | `tests/integration` | Migrations, RLS assumptions, cross-module wiring |
| E2E | Playwright | `tests/e2e` | Browser flows, layout, voice lifecycle, network failure |
| Eval | Vitest | `eval/**/__tests__` | Civics grading quality and STT scoring |
| Governance | Node scripts | `scripts/` | Registry integrity, skipped tests, agent-doc drift |

## 3. Commands

| Command | Use |
|---|---|
| `npm run verify` | The merge gate: governance, database, docs, lint, typecheck, unit/integration with coverage, build |
| `npm run verify:governance` | Registry, skipped-test, and agent-doc checks |
| `npm run db:verify` | Catalog checks for RLS, policies, function grants, search paths, and cascades |
| `npm run docs:db` | Regenerate `docs/DATABASE.md` from the local database |
| `npm run docs:db:check` | Fail when `docs/DATABASE.md` is stale |
| `npx vitest run path/to/file.test.ts` | Focused test while iterating |
| `npm run test:coverage` | Unit/integration with coverage thresholds |
| `npm run test:e2e` | Full Playwright suite |
| `npm run eval:civics` | Civics grading benchmark |
| `npm run lint` | ESLint with warnings as errors |
| `npm run typecheck:test` | TypeScript check for source and tests |
| `npm run build` | Production TypeScript and Vite build |

Do not invent commands. If a needed command is missing, add it to `package.json` and document it here in the same change.

`npm run verify` now runs against a migrated local Supabase database. Start the stack with `npx supabase start` and apply migrations with `npx supabase db reset` before running it.

## 4. Red-green workflow

1. Identify the feature ID in `docs/features.json`.
2. Read the mapped tests.
3. Add or update a test that fails for the right reason.
4. Show the failure.
5. Make the smallest change that passes.
6. Run the focused test, then `npm run verify`.
7. Update the registry if behavior changed.

A test that passes before the change and after the change did not protect the change.

## 5. Coverage policy

- Coverage is a ratchet, not a target.
- Thresholds live in `vite.config.ts` and must not be lowered without explicit approval.
- New production modules need tests in the same change.
- Generated files, type declarations, test files, configuration, workers, and vendored browser assets are excluded.
- A module that is genuinely hard to unit test (media, workers, browser APIs) must have an integration or E2E test and an explicit note in the feature registry.
- Do not add meaningless assertions to raise a number. A test that executes a line without asserting behavior is coverage theater.

## 6. What to test

For every behavior change, cover the highest-risk boundaries:

- Success path.
- Invalid input and validation failure.
- Missing, expired, or invalid authentication.
- Authorization and ownership failure.
- Downstream service failure.
- Empty, loading, and retry states.
- Cleanup on unmount, session end, and visibility change.
- Persistence round-trip and ordering.
- i18n/RTL and keyboard access for user-facing UI.

## 7. Skipped tests

A skipped test is hidden risk. The governance check rejects unexplained skips.

Allowed form:

```ts
// ALLOW_SKIP: live Supabase round-trip; runs only with RUN_DB_ROUNDTRIP=1 and disposable credentials.
describe.skipIf(!ready)('graded_answers round-trip (live Supabase)', () => {
```

Rules:

- The comment must be on the same line or within the two lines above the skip.
- The reason must explain why the test cannot run by default and how to run it.
- The skip must be conditional where possible, not permanent.
- Removing a skip requires fixing the underlying reason, not deleting the test.

## 8. E2E policy

- E2E tests prove browser wiring, layout, and lifecycle. They do not replace contract tests.
- Network-mocked E2E tests are hermetic and should run in CI without cloud credentials.
- Live E2E tests require a seeded test user and must fail loudly when setup fails.
- Never use `|| true`, `continue-on-error`, or a swallowed login failure to make E2E green.
- A flaky test is a defect. Fix the race or quarantine it with an owner and a linked issue; do not retry forever.

## 9. Evals

- `npm run eval:civics` protects grading quality.
- A prompt, model, or matching change requires an eval run.
- Eval thresholds are reviewed with the prompt change, not adjusted afterward to fit the output.
- Evals are not a substitute for deterministic contract tests.

## 10. Secrets and test data

- Never commit credentials, tokens, service-role keys, or real user transcripts.
- Use synthetic fixtures and disposable test users.
- Redact tokens and PII from failure output.
- Do not log raw request bodies in tests or handlers.

## 11. CI

Required CI runs `npm run verify`. The job starts a local Supabase stack and runs `supabase db reset` before the gate. A required job may not contain `|| true`, `continue-on-error`, or a swallowed setup failure. E2E and evals are separate jobs and may be scheduled or path-filtered, but they must still fail honestly.

## 12. Roadmap

1. Keep the coverage ratchet moving upward after each feature.
2. Add mutation testing for the civics policy and transcription reducer.
3. Add contract tests for the transcript handler's request/response boundary.
4. Expand the RLS harness with role-based anon/authenticated behavioral tests against the disposable local database.
5. Add a nightly E2E smoke job against staging with a seeded user.
