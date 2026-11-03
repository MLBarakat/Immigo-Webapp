// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const connectionString =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  '******127.0.0.1:54322/postgres';

let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString });
  await client.connect();
}, 30000);

afterAll(async () => {
  await client.end();
});

describe('mock exam review decision persistence', () => {
  it('updates only the owner goal, accepts one choice, and rejects later or cross-owner changes', async () => {
    const ownerId = randomUUID();
    const otherUserId = randomUUID();
    const examId = randomUUID();

    await client.query('BEGIN');
    try {
      for (const [userId, suffix] of [[ownerId, 'owner'], [otherUserId, 'other']] as const) {
        await client.query(
          `insert into auth.users (id, aud, role, email, encrypted_password)
           values ($1, 'authenticated', 'authenticated', $2, '')`,
          [userId, `${userId}-${suffix}@review.test`],
        );
        await client.query(
          'insert into public.user_settings (user_id) values ($1)',
          [userId],
        );
      }
      await client.query(
        `insert into public.mock_exams (id, user_id, test_version, status)
         values ($1, $2, '2020', 'completed')`,
        [examId, ownerId],
      );

      await client.query('set local role authenticated');
      await client.query(
        `select pg_catalog.set_config('request.jwt.claim.sub', $1, true)`,
        [ownerId],
      );

      const saved = await client.query<{
        saved: boolean;
        review_decision: string;
        review_decision_note: string;
      }>(
        `select * from public.record_mock_exam_review_decision($1, 'study', $2)`,
        [examId, 'Review the Bill of Rights'],
      );
      expect(saved.rows[0]).toMatchObject({
        saved: true,
        review_decision: 'study',
        review_decision_note: 'Review the Bill of Rights',
      });

      const goal = await client.query<{ learning_goal: string }>(
        'select learning_goal from public.user_settings where user_id = $1',
        [ownerId],
      );
      expect(goal.rows).toEqual([{ learning_goal: 'Review the Bill of Rights' }]);

      const repeated = await client.query<{
        saved: boolean;
        review_decision: string;
        review_decision_note: string;
      }>(
        `select * from public.record_mock_exam_review_decision($1, 'practice', $2)`,
        [examId, 'A different focus'],
      );
      expect(repeated.rows[0]).toMatchObject({
        saved: false,
        review_decision: 'study',
        review_decision_note: 'Review the Bill of Rights',
      });

      await client.query('savepoint immutable_write');
      let mutationError: unknown;
      try {
        await client.query(
          `update public.mock_exams
           set review_decision = 'practice',
               review_decision_note = 'A different focus'
           where id = $1`,
          [examId],
        );
      } catch (error) {
        mutationError = error;
      }
      expect(mutationError).toBeDefined();
      await client.query('rollback to savepoint immutable_write');

      await client.query(
        `select pg_catalog.set_config('request.jwt.claim.sub', $1, true)`,
        [otherUserId],
      );
      const hiddenExam = await client.query(
        'select id from public.mock_exams where id = $1',
        [examId],
      );
      expect(hiddenExam.rows).toEqual([]);

      await client.query('savepoint cross_owner_write');
      let crossOwnerError: unknown;
      try {
        await client.query(
          `select * from public.record_mock_exam_review_decision($1, 'finish_for_now', null)`,
          [examId],
        );
      } catch (error) {
        crossOwnerError = error;
      }
      expect(crossOwnerError).toBeDefined();
      await client.query('rollback to savepoint cross_owner_write');
    } finally {
      await client.query('rollback');
    }
  });
});
