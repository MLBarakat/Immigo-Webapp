# ImmiGO Migration And RLS Policy

**Version:** 1.0.0  
**Updated:** 2026-10-31

Supabase Postgres is the data store. `supabase/migrations/` is the only schema source of truth. The Supabase dashboard is not a schema source.

## 1. Before writing a migration

1. Read the current migrations, generated types, access layer, and tests.
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

Service-role access bypasses RLS by design. Keep the service-role key backend-only and use it only for operations that genuinely require it, such as account deletion.

## 4. Migration conventions

- File name: `NNN_short_description.sql`, zero-padded and sequential.
- One logical change per migration.
- Use `IF NOT EXISTS` / `IF EXISTS` only when it makes the migration safely repeatable; do not hide a broken assumption.
- Add indexes for known query paths.
- Add `CHECK` constraints for enums and invariants.
- Use `ON DELETE CASCADE` only when the child cannot outlive the parent.
- Do not edit an applied migration. Add a new one.

## 5. Tests

A schema change requires:

- A migration test in `tests/integration/migrations.test.ts` or a new focused test.
- An RLS test that proves one user cannot read or mutate another user's row.
- A round-trip test for the changed shape where practical.
- Generated TypeScript type updates.
- A feature registry update if user-visible behavior changes.

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
supabase start
supabase db reset
npm run test:coverage
```

`supabase db reset` applies every migration to a fresh local database. A migration that only works on an already-migrated database is broken.

## 7. Rollback

- Expand migrations are reversible by dropping the added object, but prefer a forward fix.
- Contract migrations are destructive. They require a backup, a rollback plan, and explicit approval.
- Never roll back by editing an applied migration.
- Record the rollback in the change receipt.

## 8. Generated types

- Regenerate types after every schema change.
- Keep generated types out of hand-editing.
- If generated types are not checked in, document the generation command and ensure CI can typecheck without them.
- Do not use `any` to bridge a type mismatch. Fix the schema or the mapping.

## 9. Review gate

A migration pull request is not reviewable until it includes:

- The SQL.
- The RLS test.
- The migration test.
- The generated-type update.
- The rollback note.
- The feature registry update, when applicable.
