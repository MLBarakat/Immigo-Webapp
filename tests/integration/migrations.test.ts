// @vitest-environment node
//
// A zero-infrastructure guard: it reads supabase/migrations and fails if the
// schema the code depends on isn't defined. This is exactly the check that would
// have caught the missing `graded_answers` migration in a prior iteration —
// the handler and aggregateSession both read/write that table, but nothing
// compile-checks a table that only exists in SQL.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');

function allMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), 'utf-8'))
    .join('\n');
}

describe('supabase migrations define the schema the code relies on', () => {
  const sql = allMigrationSql().toLowerCase();

  it('defines the graded_answers table', () => {
    expect(sql).toMatch(/create table[\s\S]*graded_answers/);
  });

  it('graded_answers has RLS enabled', () => {
    expect(sql).toMatch(/alter table\s+graded_answers\s+enable row level security/);
  });

  it('graded_answers has an owner-scoped policy', () => {
    // auth.uid() = user_id somewhere in a policy on graded_answers
    expect(sql).toContain('auth.uid() = user_id');
  });

  it('still defines the pre-existing sessions and messages tables', () => {
    expect(sql).toMatch(/create table[\s\S]*sessions/);
    expect(sql).toMatch(/create table[\s\S]*messages/);
  });
});
