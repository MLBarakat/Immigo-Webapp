// @vitest-environment node
//
// LIVE integration test for the persistence round-trip. This is the only test
// here that touches a real database, so it is SKIPPED by default and only runs
// when you point it at a test Supabase with a real user JWT:
//
//   RUN_DB_ROUNDTRIP=1 \
//   SUPABASE_URL=https://<proj>.supabase.co \
//   SUPABASE_ANON_KEY=<anon> \
//   TEST_USER_JWT=<a valid user access token> \
//   npm test -- gradedAnswers.roundtrip
//
// It proves the thing unit tests cannot: that `graded_answers` exists, RLS lets
// the owner write+read, and the row shape matches what the Lambda inserts. Use a
// disposable test user; the test cleans up the rows it creates.
import { describe, it, expect, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const RUN = process.env.RUN_DB_ROUNDTRIP === '1';
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const jwt = process.env.TEST_USER_JWT;

const ready = RUN && !!url && !!anon && !!jwt;

// describe.skipIf keeps the suite green locally/CI without credentials.
describe.skipIf(!ready)('graded_answers round-trip (live Supabase)', () => {
  let db: SupabaseClient;
  const createdIds: string[] = [];

  const client = () =>
    createClient(url as string, anon as string, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });

  it('inserts a graded answer as the owner and reads it back', async () => {
    db = client();
    const { data: userData, error: authErr } = await db.auth.getUser(jwt as string);
    expect(authErr).toBeNull();
    const userId = userData.user?.id;
    expect(userId).toBeTruthy();

    const { data: inserted, error: insErr } = await db
      .from('graded_answers')
      .insert({ user_id: userId, session_id: null, item_id: 'q-021', verdict: 'correct' })
      .select('id, item_id, verdict')
      .single();

    expect(insErr).toBeNull();
    expect(inserted?.item_id).toBe('q-021');
    expect(inserted?.verdict).toBe('correct');
    if (inserted?.id) createdIds.push(inserted.id as string);

    const { data: readBack, error: readErr } = await db
      .from('graded_answers')
      .select('item_id, verdict')
      .eq('id', createdIds[0]);
    expect(readErr).toBeNull();
    expect(readBack?.[0]?.verdict).toBe('correct');
  });

  it('rejects a bad verdict (CHECK constraint holds)', async () => {
    const { error } = await client()
      .from('graded_answers')
      .insert({ item_id: 'q-021', verdict: 'totally-wrong' });
    expect(error).not.toBeNull();
  });

  afterAll(async () => {
    if (!ready || createdIds.length === 0) return;
    await client().from('graded_answers').delete().in('id', createdIds);
  });
});
