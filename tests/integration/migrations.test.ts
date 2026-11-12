// @vitest-environment node
//
// Behavioral schema guard. It reads the live local database after migrations
// have been applied, so it checks what PostgreSQL actually enforces instead of
// matching the text of a particular migration file.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type QueryResultRow } from 'pg';

const connectionString =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString });
  await client.connect();
}, 30000);

afterAll(async () => {
  await client.end();
});

async function query<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await client.query<T>(sql, params);
  return result.rows;
}

describe('supabase schema and RLS', () => {
  it('enables row level security on every public table', async () => {
    const rows = await query<{ relname: string }>(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and not c.relrowsecurity
      order by 1
    `);

    expect(rows.map((row) => row.relname)).toEqual([]);
  });

  it('defines graded_answers with an owner-scoped policy', async () => {
    const tables = await query<{ exists: boolean }>(`
      select to_regclass('public.graded_answers') is not null as exists
    `);
    expect(tables[0]?.exists).toBe(true);

    const policies = await query<{ qual: string | null }>(`
      select qual
      from pg_policies
      where schemaname = 'public' and tablename = 'graded_answers' and cmd in ('SELECT', 'ALL')
    `);
    expect(policies.some((policy) => policy.qual?.includes('auth.uid()'))).toBe(true);
  });

  it('adds durable learning-goal fields to owner-scoped user settings', async () => {
    const columns = await query<{ column_name: string; is_nullable: string }>(`
      select column_name, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_settings'
        and column_name in ('learning_goal', 'weekly_graded_answer_target')
      order by column_name
    `);

    expect(columns).toEqual([
      { column_name: 'learning_goal', is_nullable: 'YES' },
      { column_name: 'weekly_graded_answer_target', is_nullable: 'YES' },
    ]);

    const policies = await query<{ qual: string | null; with_check: string | null }>(`
      select qual, with_check
      from pg_policies
      where schemaname = 'public' and tablename = 'user_settings' and cmd = 'ALL'
    `);
    expect(policies.some(
      (policy) => policy.qual?.includes('auth.uid()') && policy.with_check?.includes('auth.uid()'),
    )).toBe(true);

    const rls = await query<{ relrowsecurity: boolean }>(`
      select relrowsecurity
      from pg_class
      where oid = 'public.user_settings'::regclass
    `);
    expect(rls[0]?.relrowsecurity).toBe(true);

    const constraints = await query<{ definition: string }>(`
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conrelid = 'public.user_settings'::regclass
        and conname in ('user_settings_learning_goal_length_check', 'user_settings_weekly_target_positive_check')
    `);
    expect(constraints.map((row) => row.definition)).toEqual(expect.arrayContaining([
      expect.stringContaining('learning_goal'),
      expect.stringContaining('weekly_graded_answer_target'),
    ]));
  });

  it('stores account-wide Question Bank preferences in user settings', async () => {
    const columns = await query<{ column_name: string; is_nullable: string }>(`
      select column_name, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_settings'
        and column_name in ('question_bank_test_version', 'include_english_simulation')
      order by column_name
    `);

    expect(columns).toEqual([
      { column_name: 'include_english_simulation', is_nullable: 'YES' },
      { column_name: 'question_bank_test_version', is_nullable: 'YES' },
    ]);

    const constraints = await query<{ definition: string }>(`
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conrelid = 'public.user_settings'::regclass
        and conname = 'user_settings_question_bank_test_version_check'
    `);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]?.definition).toContain("'2008'");
    expect(constraints[0]?.definition).toContain("'2020'");
  });

  it('stores immutable per-exam decisions and grants the atomic save only to authenticated users', async () => {
    const columns = await query<{ column_name: string; data_type: string; is_nullable: string }>(`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'mock_exams'
        and column_name in ('review_decision', 'review_decision_note', 'review_decision_at')
      order by column_name
    `);
    expect(columns).toEqual([
      { column_name: 'review_decision', data_type: 'text', is_nullable: 'YES' },
      { column_name: 'review_decision_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
      { column_name: 'review_decision_note', data_type: 'text', is_nullable: 'YES' },
    ]);

    const constraints = await query<{ definition: string }>(`
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conrelid = 'public.mock_exams'::regclass
        and conname in (
          'mock_exams_review_decision_check',
          'mock_exams_review_decision_timestamp_check',
          'mock_exams_review_decision_note_check'
        )
    `);
    expect(constraints).toHaveLength(3);
    expect(constraints.map((row) => row.definition).join(' ')).toContain('review_answers');

    const routine = await query<{
      security_definer: boolean;
      settings: string[] | null;
      anon_execute: boolean;
      authenticated_execute: boolean;
    }>(`
      select
        p.prosecdef as security_definer,
        p.proconfig as settings,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
      from pg_proc p
      where p.oid = to_regprocedure('public.record_mock_exam_review_decision(uuid,text,text)')
    `);
    expect(routine).toHaveLength(1);
    expect(routine[0]?.security_definer).toBe(false);
    expect(routine[0]?.settings).toContain('search_path=""');
    expect(routine[0]?.anon_execute).toBe(false);
    expect(routine[0]?.authenticated_execute).toBe(true);

    const triggers = await query<{ tgname: string }>(`
      select tgname
      from pg_trigger
      where tgrelid = 'public.mock_exams'::regclass
        and not tgisinternal
        and tgname like 'guard_mock_exam_review_decision_%'
    `);
    expect(triggers.map((trigger) => trigger.tgname).sort()).toEqual([
      'guard_mock_exam_review_decision_insert',
      'guard_mock_exam_review_decision_update',
    ]);
  });

  it('restricts active_user_sessions to the authenticated owner', async () => {
    const policies = await query<{
      cmd: string;
      qual: string | null;
      with_check: string | null;
    }>(`
      select cmd, qual, with_check
      from pg_policies
      where schemaname = 'public' and tablename = 'active_user_sessions'
    `);

    expect(policies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cmd: 'SELECT',
          qual: expect.stringContaining('auth.uid()'),
        }),
        expect.objectContaining({
          cmd: 'INSERT',
          with_check: expect.stringContaining('auth.uid()'),
        }),
        expect.objectContaining({
          cmd: 'UPDATE',
          qual: expect.stringContaining('auth.uid()'),
          with_check: expect.stringContaining('auth.uid()'),
        }),
      ]),
    );
  });

  it('persists mock exam English columns and request uniqueness', async () => {
    const columns = await query<{ column_name: string }>(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'mock_exams'
        and column_name in ('english_stage', 'reading_prompt_ids', 'writing_prompt_ids')
    `);
    expect(columns.map((column) => column.column_name).sort()).toEqual([
      'english_stage',
      'reading_prompt_ids',
      'writing_prompt_ids',
    ]);

    const indexes = await query<{ indexdef: string }>(`
      select indexdef
      from pg_indexes
      where schemaname = 'public' and tablename = 'mock_exam_english_answers'
    `);
    expect(
      indexes.some(
        (index) =>
          index.indexdef.includes('UNIQUE') &&
          index.indexdef.includes('exam_id') &&
          index.indexdef.includes('request_id'),
      ),
    ).toBe(true);

    const rls = await query<{ relrowsecurity: boolean }>(`
      select relrowsecurity
      from pg_class
      where oid = 'public.mock_exam_english_answers'::regclass
    `);
    expect(rls[0]?.relrowsecurity).toBe(true);
  });

  it('defines question_mastery as a security-invoker view', async () => {
    const rows = await query<{ reloptions: string[] | null }>(`
      select reloptions
      from pg_class
      where oid = 'public.question_mastery'::regclass
    `);
    expect(rows[0]?.reloptions).toContain('security_invoker=true');
  });

  it('creates a profile for every new auth user with a safe search_path', async () => {
    const triggers = await query<{ tgname: string }>(`
      select t.tgname
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal
    `);
    expect(triggers.map((trigger) => trigger.tgname)).toContain('on_auth_user_created');

    const functions = await query<{ proconfig: string[] | null }>(`
      select proconfig
      from pg_proc
      where oid = to_regprocedure('public.handle_new_user()')
    `);
    expect(
      (functions[0]?.proconfig ?? []).some((setting) => setting.startsWith('search_path=')),
    ).toBe(true);
  });

  it('keeps profiles private to their owner', async () => {
    const policies = await query<{
      roles: string[];
      qual: string | null;
      cmd: string;
    }>(`
      select roles::text[] as roles, qual, cmd
      from pg_policies
      where schemaname = 'public' and tablename = 'profiles' and cmd in ('SELECT', 'ALL')
    `);

    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy.roles).not.toContain('public');
      expect(policy.qual).toContain('auth.uid()');
    }
  });

  it('enables RLS and owner policies on session_reports with a cascading FK', async () => {
    const rls = await query<{ relrowsecurity: boolean }>(`
      select relrowsecurity
      from pg_class
      where oid = 'public.session_reports'::regclass
    `);
    expect(rls[0]?.relrowsecurity).toBe(true);

    const policies = await query<{ cmd: string }>(`
      select cmd
      from pg_policies
      where schemaname = 'public' and tablename = 'session_reports'
    `);
    expect(policies.map((policy) => policy.cmd).sort()).toEqual([
      'DELETE',
      'INSERT',
      'SELECT',
      'UPDATE',
    ]);

    const foreignKeys = await query<{ confdeltype: string }>(`
      select confdeltype
      from pg_constraint
      where conrelid = 'public.session_reports'::regclass and contype = 'f'
    `);
    expect(foreignKeys.some((foreignKey) => foreignKey.confdeltype === 'c')).toBe(true);
  });

  it('does not expose mutating functions to anon', async () => {
    const rows = await query<{ proname: string; anon_can_execute: boolean }>(`
      select p.proname,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('purge_old_messages', 'handle_new_user', 'match_progress_reports')
      order by 1
    `);

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.anon_can_execute).toBe(false);
    }
  });

  // `sessions` is intentionally excluded: it models a learning window with
  // started_at/ended_at/local_date and has no meaningful created_at/updated_at.
  it('gives every public table except sessions uniform created_at/updated_at columns', async () => {
    const detail = await query<{
      relname: string;
      attname: string;
      attnotnull: boolean;
      default_expr: string | null;
    }>(`
      select c.relname, a.attname, a.attnotnull,
             pg_get_expr(d.adbin, d.adrelid) as default_expr
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
        and a.attname in ('created_at', 'updated_at')
        and a.attnum > 0 and not a.attisdropped
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by c.relname, a.attname
    `);

    const tables = await query<{ relname: string }>(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and c.relname <> 'sessions'
      order by c.relname
    `);

    // Any BEFORE UPDATE row trigger counts as updated_at maintenance.
    const triggerRows = await query<{ relname: string; tgname: string }>(`
      select c.relname, t.tgname
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and not t.tgisinternal
        and (t.tgtype::int & 2) = 2   -- BEFORE
        and (t.tgtype::int & 16) = 16 -- UPDATE
    `);

    for (const table of tables) {
      const columns = detail.filter((column) => column.relname === table.relname);
      expect(
        columns.map((column) => column.attname).sort(),
        `${table.relname} must have both created_at and updated_at`,
      ).toEqual(['created_at', 'updated_at']);
      for (const column of columns) {
        expect(column.attnotnull, `${table.relname}.${column.attname} must be NOT NULL`).toBe(true);
        expect(column.default_expr, `${table.relname}.${column.attname} must default to now()`).toBe(
          'now()',
        );
      }

      expect(
        triggerRows.filter((trigger) => trigger.relname === table.relname).length,
        `${table.relname} must maintain updated_at on update`,
      ).toBeGreaterThan(0);
    }
  });

  it('keeps the maintenance purge RPC out of client roles', async () => {
    const rows = await query<{
      anon_can_execute: boolean;
      authenticated_can_execute: boolean;
      service_role_can_execute: boolean;
    }>(`
      select has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.oid = to_regprocedure('public.purge_old_messages()')
    `);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      anon_can_execute: false,
      authenticated_can_execute: false,
      service_role_can_execute: true,
    });
  });

  it('keeps the daily session RPC available to authenticated users', async () => {
    const rows = await query<{ allowed: boolean }>(`
      select has_function_privilege(
        'authenticated',
        'public.get_or_create_daily_learning_session(uuid,text)',
        'EXECUTE'
      ) as allowed
    `);
    expect(rows[0]?.allowed).toBe(true);
  });
});
