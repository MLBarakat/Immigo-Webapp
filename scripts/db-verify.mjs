#!/usr/bin/env node
/**
 * Database governance gate.
 *
 * Runs against a migrated local Supabase database and fails when a schema
 * change weakens the security boundary: RLS disabled, owner policies missing,
 * anon-executable functions, a SECURITY DEFINER function without a pinned
 * search_path, or a non-cascading auth.users foreign key.
 *
 * This script is read-only. It never applies migrations or talks to a linked
 * project.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const connectionString =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows: rlsDisabled } = await client.query(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and not c.relrowsecurity
      order by 1
    `);
    for (const row of rlsDisabled) {
      fail(`public.${row.relname} has row level security disabled`);
    }

    const { rows: permissivePolicies } = await client.query(`
      select tablename, policyname
      from pg_policies
      where schemaname = 'public'
        and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true')
      order by 1, 2
    `);
    for (const row of permissivePolicies) {
      fail(`policy ${row.tablename}.${row.policyname} is unconditional (true)`);
    }

    const { rows: anonPolicies } = await client.query(`
      select tablename, policyname
      from pg_policies
      where schemaname = 'public' and 'anon' = any(roles)
      order by 1, 2
    `);
    for (const row of anonPolicies) {
      fail(`policy ${row.tablename}.${row.policyname} explicitly targets anon`);
    }

    const { rows: userTables } = await client.query(`
      select distinct c.oid, c.relname
      from pg_constraint fk
      join pg_class c on c.oid = fk.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where fk.contype = 'f'
        and fk.confrelid = 'auth.users'::regclass
        and n.nspname = 'public'
      order by 2
    `);

    for (const table of userTables) {
      const { rows: policies } = await client.query(
        `
          select policyname, cmd, coalesce(qual, '') as qual,
                 coalesce(with_check, '') as with_check
          from pg_policies
          where schemaname = 'public' and tablename = $1
          order by policyname
        `,
        [table.relname],
      );

      if (policies.length === 0) {
        fail(`public.${table.relname} has no policy`);
        continue;
      }

      for (const policy of policies) {
        const needsUsing = ['SELECT', 'UPDATE', 'DELETE', 'ALL'].includes(policy.cmd);
        const needsCheck = ['INSERT', 'UPDATE', 'ALL'].includes(policy.cmd);

        if (needsUsing && !policy.qual.includes('auth.uid()')) {
          fail(`policy ${table.relname}.${policy.policyname} does not scope USING by auth.uid()`);
        }
        // PostgreSQL falls back to USING for UPDATE/ALL WITH CHECK when omitted.
        if (needsCheck && policy.with_check && !policy.with_check.includes('auth.uid()')) {
          fail(`policy ${table.relname}.${policy.policyname} does not scope WITH CHECK by auth.uid()`);
        }
        if (policy.cmd === 'INSERT' && !policy.with_check.includes('auth.uid()')) {
          fail(`insert policy ${table.relname}.${policy.policyname} does not scope WITH CHECK by auth.uid()`);
        }
      }
    }

    const { rows: anonFunctions } = await client.query(`
      select p.oid::regprocedure::text as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and has_function_privilege('anon', p.oid, 'EXECUTE')
      order by 1
    `);
    for (const row of anonFunctions) {
      fail(`anon can execute ${row.signature}`);
    }

    const { rows: unsafeDefiners } = await client.query(`
      select p.oid::regprocedure::text as signature, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and not exists (
          select 1
          from unnest(coalesce(p.proconfig, array[]::text[])) as setting
          where setting like 'search_path=%'
        )
      order by 1
    `);
    for (const row of unsafeDefiners) {
      fail(`security definer function ${row.signature} does not pin search_path`);
    }

    const { rows: unsafeFks } = await client.query(`
      select conrelid::regclass::text as table_name, conname, confdeltype
      from pg_constraint fk
      join pg_class c on c.oid = fk.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where fk.contype = 'f'
        and fk.confrelid = 'auth.users'::regclass
        and n.nspname = 'public'
        and fk.confdeltype <> 'c'
      order by 1, 2
    `);
    for (const row of unsafeFks) {
      fail(`${row.table_name}.${row.conname} does not cascade auth user deletion`);
    }

    const { rows: sessionReports } = await client.query(`
      select c.relrowsecurity,
             has_table_privilege('anon', 'public.session_reports', 'SELECT,INSERT,UPDATE,DELETE') as anon_access,
             (select count(*)::int from pg_policies
               where schemaname = 'public' and tablename = 'session_reports') as policy_count
      from pg_class c
      where c.oid = 'public.session_reports'::regclass
    `);
    if (!sessionReports[0]?.relrowsecurity) {
      fail('public.session_reports must have row level security enabled');
    }
    if (sessionReports[0]?.anon_access) {
      fail('anon must not have table privileges on public.session_reports');
    }
    if (sessionReports[0]?.policy_count !== 4) {
      fail('public.session_reports must have exactly four owner policies');
    }

    const { rows: profileSelectPolicies } = await client.query(`
      select policyname, coalesce(qual, '') as qual, roles
      from pg_policies
      where schemaname = 'public' and tablename = 'profiles' and cmd in ('SELECT', 'ALL')
    `);
    if (profileSelectPolicies.length === 0) {
      fail('public.profiles has no SELECT policy');
    }
    for (const policy of profileSelectPolicies) {
      if (!policy.qual.includes('auth.uid()')) {
        fail(`profiles.${policy.policyname} is not owner-scoped`);
      }
      if (policy.roles.includes('public') || policy.roles.includes('anon')) {
        fail(`profiles.${policy.policyname} is readable by anon/public`);
      }
    }

    const { rows: views } = await client.query(`
      select c.relname, coalesce(c.reloptions, array[]::text[]) as reloptions
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
      order by 1
    `);
    for (const view of views) {
      if (!view.reloptions.includes('security_invoker=true')) {
        warnings.push(`view public.${view.relname} is not security_invoker`);
      }
    }

    const migrationFiles = readdirSync(join(root, 'supabase', 'migrations'))
      .filter((file) => file.endsWith('.sql'))
      .map((file) => {
        const match = /^(\d{14})_/.exec(file);
        if (!match) {
          fail(`migration ${file} does not start with a 14-digit timestamp`);
          return null;
        }
        return match[1];
      })
      .filter(Boolean)
      .sort();

    const { rows: applied } = await client.query(`
      select version from supabase_migrations.schema_migrations order by version
    `);
    const appliedVersions = applied.map((row) => row.version).sort();
    const missing = migrationFiles.filter((version) => !appliedVersions.includes(version));
    const unknown = appliedVersions.filter((version) => !migrationFiles.includes(version));
    for (const version of missing) {
      fail(`migration ${version} is present in the repository but not applied locally`);
    }
    for (const version of unknown) {
      fail(`migration ${version} is applied locally but not present in the repository`);
    }
  } finally {
    await client.end();
  }

  for (const warning of warnings) {
    console.warn(`WARN  ${warning}`);
  }

  if (errors.length > 0) {
    console.error(`Database governance failed with ${errors.length} error(s):`);
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Database governance passed (${connectionString.replace(/:[^:@/]+@/, ':***@')}).`);
}

main().catch((error) => {
  console.error('Database governance could not run. Is the local Supabase database up?');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
