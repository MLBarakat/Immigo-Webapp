# ImmiGO Migration And RLS Policy

**Version:** 1.1.0  
**Updated:** 2026-11-02

Supabase Postgres is the data store. `supabase/migrations/` is the only schema source of truth. The Supabase dashboard is not a schema source. `docs/DATABASE.md` is generated from a migrated local database and is never edited by hand.

The first migration, `20261101133556_remote_schema.sql`, is a baseline. It records the schema that already existed on the hosted project so a fresh local database matches production. Later migrations advance that baseline. Do not edit the baseline; add a new migration.

## 1. Before writing a migration

1. Read the current migrations, `docs/DATABASE.md`, generated types, access layer, and tests.
2. Identify the table owner, read paths, write paths, and tenant boundary.
3. Confirm nullability, defaults, indexes, uniqueness, and cascade behavior.
4. Decide the expand/contract sequence.
5. Write the rollback note before writing SQL.

## 2. Expand/contract

Never make a breaking schema change in one step.

1. **Expand:** add the new column, table, or policy without removing the old one. Keep both readable.
2. **Backfill:** populate the new shape in a reversible, idempotent way.
3. **Switch:** update code to read/write the new shape.
4. **Verify:** run migrations, RLS tests, and the application test suite.
5. **Contract:** remove the old shape in a later migration after the switch is stable.

## 3. RLS requirements

Every user-owned table must:

- Have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- Have an owner-scoped `SELECT` policy using `auth.uid() = user_id`.
- Have an owner-scoped `INSERT` policy with `WITH CHECK (auth.uid() = user_id)`.
- Have an owner-scoped `UPDATE` policy with both `USING` and `WITH CHECK`.
- Have an owner-scoped `DELETE` policy where deletion is allowed.
- Deny by default when no policy applies.

Policies may target `public` (the role) only when the predicate uses `auth.uid()` and resolves to no rows for anon. Never write `USING (true)` or `WITH CHECK (true)`, and never add a policy that explicitly targets `anon`.

Additional boundaries:

- Foreign keys to `auth.users` use `ON DELETE CASCADE`, so account deletion cannot leave orphaned data.
- `anon` has no `EXECUTE` on any `public` function.
- `SECURITY DEFINER` functions pin `search_path`, normally `search_path = ''`, and schema-qualify every object they reference.
- Trigger-only helpers revoke `EXECUTE` from `public`, `anon`, and `authenticated`.
- Views exposed through the API use `security_invoker = true` so the caller's RLS applies.

Service-role access bypasses RLS by design. Keep the service-role key backend-only and use it only for operations that genuinely require it, such as account deletion.

## 4. Migration conventions

- File name: `YYYYMMDDHHMMSS_short_description.sql`, using the UTC timestamp when the migration is created.
- One logical change per migration.
- Use `IF NOT EXISTS` / `IF EXISTS` only when it makes the migration safely repeatable; do not hide a broken assumption.
- Add indexes for known query paths.
- Add `CHECK` constraints for enums and invariants.
- Use `ON DELETE CASCADE` only when the child cannot outlive the parent.
- Do not edit an applied migration. Add a new one.
- Do not edit the baseline. Add a new migration.

## 5. Tests

A schema change requires:

- A migration test in `tests/integration/migrations.test.ts` or a new focused test.
- An RLS test that proves one user cannot read or mutate another user's row.
- A round-trip test for the changed shape where practical.
- Generated TypeScript type updates.
- A regenerated `docs/DATABASE.md`.
- A feature registry update if user-visible behavior changes.

`npm run db:verify` adds catalog-wide checks on top of the focused tests. It fails when a public table has RLS disabled, a user-owned table lacks an owner-scoped policy, a policy is unconditional, anon can execute a public function, a `SECURITY DEFINER` function has no pinned `search_path`, or an `auth.users` foreign key does not cascade.

The live round-trip test is opt-in:

```bash
RUN_DB_ROUNDTRIP=1 \
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_ANON_KEY=<anon-key> \
TEST_USER_JWT=<disposable-user-token> \
npx vitest run tests/integration/gradedAnswers.roundtrip.test.ts
```

Use a disposable user. The test cleans up the rows it creates.

## 6. Local verification

```bash
npx supabase start
npx supabase db reset
npm run db:verify
npm run docs:db
npx vitest run tests/integration/migrations.test.ts
npm run verify
```

`supabase db reset` applies every migration to a fresh local database. A migration that only works on an already-migrated database is broken. `npm run docs:db` must produce no diff; `docs:db:check` enforces this in `npm run verify`.

## 7. Generated types and docs

- Regenerate types after every schema change with `npx supabase gen types typescript --local`.
- Write generated files as UTF-8 without a BOM. PowerShell redirection defaults to UTF-16 and breaks lint and diffs.
- Keep generated types out of hand-editing.
- If generated types are not checked in, document the generation command and ensure CI can typecheck without them.
- Do not use `any` to bridge a type mismatch. Fix the schema or the mapping.
- Regenerate `docs/DATABASE.md` with `npm run docs:db`. Do not hand-edit it.

## 8. Review gate

A migration pull request is not reviewable until it includes:

- The SQL.
- The RLS test.
- The migration test.
- The generated-type update.
- The regenerated `docs/DATABASE.md`.
- The rollback note.
- The feature registry update, when applicable.
- A green `npm run db:verify` and `npm run docs:db:check`.

## 9. Rollback

- Expand migrations are reversible by dropping the added object, but prefer a forward fix.
- Contract migrations are destructive. They require a backup, a rollback plan, and explicit approval.
- Never roll back by editing an applied migration.
- Record the rollback in the change receipt.

## 10. Baseline repair on an existing environment

The baseline exists because the hosted project predates the repository history. An environment that already has the schema but not the baseline must have its migration history repaired, not its schema recreated.

This is a human-approved operational step. An agent must not run it.

1. Take a backup and confirm the target project ref.
2. Link and inspect history:

   ```bash
   supabase link --project-ref <project-ref>
   supabase migration list
   ```

3. If the legacy `001`–`011` entries are present, remove only their history rows. Do not replay them; the baseline already contains their objects.

   ```bash
   for version in 001 002 003 004 005 006 007 008 009 010 011; do
     supabase migration repair --status reverted "$version"
   done
   ```

4. Record the baseline as applied. This does not run the baseline SQL.

   ```bash
   supabase migration repair --status applied 20261101133556
   ```

5. Apply the new migrations normally:

   ```bash
   supabase db push
   ```

6. Verify history and behavior:

   ```bash
   supabase migration list
   ```

   Then confirm that anon cannot read `profiles` or `session_reports`, that anon cannot execute `purge_old_messages`, and that an authenticated client also cannot call `purge_old_messages`.

Fallback when `db push` is unavailable: run `20261102120000_security_hardening.sql` in the dashboard SQL editor, then align history with:

```bash
supabase migration repair --status applied 20261101133556
supabase migration repair --status applied 20261102120000
```

Never run `supabase db reset` against a hosted project. It destroys data.

## 11. Database governance

- `npm run db:verify` is a read-only catalog gate. It checks RLS, owner policies, anon grants, `SECURITY DEFINER` search paths, cascading auth-user foreign keys, and migration-history alignment.
- `npm run docs:db` regenerates `docs/DATABASE.md`. `npm run docs:db:check` fails when the checked-in file is stale.
- `npm run verify` runs both. It requires a migrated local database.
- CI starts a local Supabase stack and runs `supabase db reset` before `npm run verify`.
- Agents may read the catalog, draft migrations, and run local commands. Remote `link`, `pull`, `push`, `migration repair`, and dashboard SQL are human-only operations.
