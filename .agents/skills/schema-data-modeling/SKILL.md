---
name: schema-data-modeling
description: Use for ImmiGO Supabase/Postgres schemas, migrations, RLS policies, queries, constraints, indexes, generated types, or data contracts.
---

# Schema And Data Modeling

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/MIGRATIONS.md`, `docs/adr/0002-supabase-auth-and-rls.md`, and the current migrations.

## Project rules

- `supabase/migrations/` is the only schema source of truth. The dashboard is not.
- Every user-owned table needs RLS enabled and owner-scoped policies for select, insert, update, and delete where applicable.
- Use expand/contract for breaking changes. Never edit an applied migration.
- Add constraints for enums and invariants. Add indexes for known query paths.
- Select needed columns in production paths; avoid `SELECT *` unless the shape is intentionally whole-row.
- Keep service-role credentials backend-only.
- Map changed shapes to strict TypeScript types. Handle missing/null rows explicitly.
- A schema change needs a migration test, an RLS test, and generated-type updates.

## Workflow

1. Read the current migrations, access layer, and tests.
2. Write the expand migration and rollback note.
3. Add the RLS policy and test.
4. Update the access layer and types.
5. Run the migration test and `npm run verify`.
6. Update the feature registry if user-visible behavior changed.

## Done when

- [ ] The migration is expand/contract and repeatable.
- [ ] RLS is enabled and owner-scoped.
- [ ] Constraints and indexes match the query paths.
- [ ] Generated types are updated.
- [ ] Migration and RLS tests exist.
- [ ] `npm run verify` passes.
