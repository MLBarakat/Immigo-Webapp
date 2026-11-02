# ImmiGO Change Policy

**Version:** 1.0.0  
**Updated:** 2026-10-31  
**Authority:** `docs/CONSTITUTION.md`.

## 1. One change, one purpose

- One feature or bug per pull request.
- No drive-by refactors, renames, formatting sweeps, or dependency upgrades.
- If a refactor is required to make the change safe, split it into a characterization-test PR first.
- A pull request that cannot be reviewed in one sitting is too large. Split it.

## 2. Protected behavior

A behavior is protected when it appears in `docs/features.json` with status `protected`.

Changing it requires:

1. A written spec delta in the pull request.
2. A failing test that demonstrates the old behavior.
3. Explicit human approval.
4. The test update in the same pull request.
5. A note in the change receipt.

An AI agent may not approve its own protected change.

## 3. Protected paths

Explicit approval is required before editing:

- `AGENTS.md`, `docs/CONSTITUTION.md`, `docs/features.json`, `docs/FEATURES.md`
- `.github/workflows/**`
- `supabase/migrations/**`
- `amplify/backend.ts`, `amplify/functions/**/resource.ts`
- `package.json`, `package-lock.json`
- `vite.config.ts`, `playwright.config.ts`, `eslint.config.js`, `tsconfig*.json`
- Authentication, authorization, session replacement, and account deletion code

## 4. API contract changes

An API contract includes the method, path, auth requirement, request body, response body, status codes, and error semantics.

A contract change requires:

1. A feature spec delta.
2. Updated frontend and backend types.
3. Handler contract tests for success, validation, auth, and downstream failure.
4. An E2E or integration test that exercises the changed shape.
5. A migration or rollback note when persistence changes.

Do not change a response shape to make a client test pass.

## 5. Database changes

Follow `docs/MIGRATIONS.md`.

- Expand/contract only.
- RLS is mandatory for user-owned tables.
- A migration without an RLS test is incomplete.
- Generated types are updated in the same change.
- Destructive changes require a rollback plan and explicit approval.

## 6. Dependency changes

- No new runtime dependency without explicit approval.
- Justify the dependency against the platform, standard library, and existing packages.
- Review bundle size, Lambda package size, cold starts, license, and maintenance.
- Run `npm run verify` after the change.
- Never add a dependency to avoid a small local helper.

## 7. Tests

- Never delete, rename, skip, or weaken a feature test to make CI pass.
- Never change a test expectation without a spec or behavior change.
- Never copy production logic into a test.
- A bug fix requires a regression test that fails before the fix.
- A skipped test requires `// ALLOW_SKIP: <reason>` and an owner.

## 8. Documentation

Update documentation when behavior or architecture changes:

- `docs/FEATURES.md` and `docs/features.json` for behavior.
- `docs/ARCHITECTURE.md` for runtime boundaries.
- `docs/adr/` for architecture decisions.
- `README.md` for setup, commands, and user-facing architecture.

Document facts, not intentions. If the code and docs disagree, stop and ask.

## 9. Commit and pull-request rules

- Include the feature ID in the commit or pull request title.
- Include the change receipt from `AGENTS.md`.
- Link the failing test and the passing verification.
- Do not push directly to `main` or `dev`.
- Do not merge with a red required check.
- Do not merge a protected change without human approval.

## 10. Destructive changes

Deleting a feature, test, migration, route, or data field is destructive. It requires:

- A spec.
- An ADR when architectural.
- A migration and rollback plan when data is involved.
- Explicit approval.
- A final verification run.

An AI agent must not perform a destructive change autonomously.

## 11. Hotfixes

A hotfix follows the same rules with a smaller scope. It still needs a regression test, a verification run, and a change receipt. "Emergency" is not a reason to skip the test; it is a reason to keep the fix small.

## 12. Rollback

Every change receipt includes a rollback plan. For code, revert the commit. For schema, use the expand/contract rollback note. For configuration, restore the previous value. A rollback that loses user data is not acceptable.
