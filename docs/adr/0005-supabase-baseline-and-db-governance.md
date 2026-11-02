# ADR 0005 — Supabase Baseline And Database Governance

- **Status:** Accepted
- **Date:** 2026-11-02
- **Deciders:** ImmiGO maintainers

## Context

The repository had a set of local-only migrations (`001`–`011`) that no longer matched the hosted project. The hosted schema contained objects that the migrations never created, including `profiles` and the `handle_new_user` signup trigger. A fresh local database therefore drifted from production, and migration tests could pass against a schema that was not actually deployed.

The same drift hid live security gaps:

- `session_reports` had row level security disabled and full grants to `anon`.
- `profiles` had a public `SELECT` policy that exposed every profile.
- Several `public` functions were executable by `anon`, including the `SECURITY DEFINER` `purge_old_messages`.
- `handle_new_user` was `SECURITY DEFINER` without a pinned `search_path`.
- `session_reports.user_id` did not cascade when an auth user was deleted.

There was no gate that would catch a future schema change that weakens any of these.

## Decision

1. Keep the hosted schema as the baseline. `supabase/migrations/20261101133556_remote_schema.sql` records the schema that already existed. A fresh local database is built from it.
2. Repair migration history on existing environments instead of recreating their schema. The procedure is in `docs/MIGRATIONS.md` and is a human-approved operation.
3. Harden the baseline in a follow-up migration, `20261102120000_security_hardening.sql`:
   - owner-only `profiles` policies;
   - `session_reports` RLS, four owner policies, cascading `auth.users` FK, and no `anon` grants;
   - no `anon` `EXECUTE` on `public` functions;
   - `purge_old_messages` is restricted to service/cron roles and cannot be called by clients;
   - `SECURITY DEFINER` functions pin `search_path`;
   - trigger-only helpers revoke direct `EXECUTE`.
4. Replace text-matching migration tests with catalog assertions. `tests/integration/migrations.test.ts` queries a migrated database, so it checks what PostgreSQL actually enforces.
5. Add `npm run db:verify` as a read-only governance gate. It fails when a public table has RLS disabled, a user-owned table lacks owner-scoped policies, a policy is unconditional or anon-targeted, anon can execute a public function, a `SECURITY DEFINER` function has no pinned `search_path`, or an `auth.users` foreign key does not cascade.
6. Generate `docs/DATABASE.md` from a migrated local database with `npm run docs:db`, and enforce freshness with `npm run docs:db:check` inside `npm run verify`.
7. Limit agent authority. An agent may read the catalog, draft migrations, and run local `supabase start` / `supabase db reset` / `npm run db:verify`. It may not run `supabase link`, `db pull`, `db push`, `migration repair`, or apply SQL to a linked or hosted project.

## Consequences

- A fresh local database matches the hosted schema, then receives the hardening migration.
- The hosted project keeps its data; only its migration history is repaired.
- Schema regressions that weaken RLS, grants, or cascades fail `npm run verify`.
- `docs/DATABASE.md` is a generated artifact and may not be hand-edited.
- `npm run verify` now requires a migrated local database. CI starts one.
- Remote database writes stay human-approved and are deliberately not automatable from an agent session.

## Enforcement

- `tests/integration/migrations.test.ts` asserts the hardened catalog state.
- `scripts/db-verify.mjs` enforces the catalog-wide invariants.
- `scripts/generate-db-docs.mjs` generates and checks `docs/DATABASE.md`.
- `AGENTS.md`, `docs/CHANGE_POLICY.md`, and `docs/MIGRATIONS.md` define the agent boundary and the baseline repair procedure.
- `.github/workflows/verify.yml` starts a local Supabase stack before the gate.
