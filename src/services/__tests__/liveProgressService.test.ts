// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { getSupabaseClient } from '../../supabaseClient';
import { computeLiveStats, fetchWeeklyProgressStats, getAccountWeekRange, getUtcDayBounds } from '../liveProgressService';

vi.mock('../../supabaseClient', () => ({ getSupabaseClient: vi.fn() }));

describe('computeLiveStats', () => {
  it('returns all zeros / empty for no answers yet', () => {
    const stats = computeLiveStats([]);
    expect(stats).toEqual({
      answered: 0, correct: 0, incorrect: 0, partial: 0, accuracyPct: 0, missedItemIds: [],
    });
  });

  it('computes counts and accuracy correctly for a mix of verdicts', () => {
    const stats = computeLiveStats([
      { item_id: 'q1', verdict: 'correct' },
      { item_id: 'q2', verdict: 'correct' },
      { item_id: 'q3', verdict: 'incorrect' },
      { item_id: 'q4', verdict: 'partial' },
    ]);
    expect(stats.answered).toBe(4);
    expect(stats.correct).toBe(2);
    expect(stats.incorrect).toBe(1);
    expect(stats.partial).toBe(1);
    expect(stats.accuracyPct).toBe(50); // 2/4
  });

  it('lists missed items as everything that is NOT correct', () => {
    const stats = computeLiveStats([
      { item_id: 'q1', verdict: 'correct' },
      { item_id: 'q2', verdict: 'incorrect' },
      { item_id: 'q3', verdict: 'partial' },
    ]);
    expect(stats.missedItemIds).toEqual(['q2', 'q3']);
  });

  it('rounds accuracy sensibly for non-exact fractions', () => {
    const stats = computeLiveStats([
      { item_id: 'q1', verdict: 'correct' },
      { item_id: 'q2', verdict: 'correct' },
      { item_id: 'q3', verdict: 'incorrect' },
    ]);
    expect(stats.accuracyPct).toBe(67); // 2/3 = 66.67 -> rounds to 67
  });

  it('a perfect run is 100%, an all-wrong run is 0%', () => {
    expect(computeLiveStats([{ item_id: 'q1', verdict: 'correct' }]).accuracyPct).toBe(100);
    expect(computeLiveStats([{ item_id: 'q1', verdict: 'incorrect' }]).accuracyPct).toBe(0);
  });
});

describe('getAccountWeekRange', () => {
  it('uses Monday through the current account-local date across UTC midnight', () => {
    expect(getAccountWeekRange('America/Chicago', new Date('2026-11-04T02:00:00.000Z'))).toEqual({
      start: '2026-11-02',
      end: '2026-11-03',
    });
  });

  it('includes the whole Monday-Sunday week when it is Sunday locally', () => {
    expect(getAccountWeekRange('America/Chicago', new Date('2026-11-09T01:00:00.000Z'))).toEqual({
      start: '2026-11-02',
      end: '2026-11-08',
    });
  });
});

describe('fetchWeeklyProgressStats', () => {
  it('counts graded answers across every session and verdict in the local week', async () => {
    const sessions = makeQuery({
      data: [{ id: 'standard-session' }, { id: 'practice-session' }, { id: 'study-session' }],
      error: null,
    });
    const answers = makeQuery({
      data: [
        { item_id: 'q1', verdict: 'correct' },
        { item_id: 'q2', verdict: 'incorrect' },
        { item_id: 'q3', verdict: 'partial' },
        { item_id: 'q4', verdict: 'correct' },
      ],
      error: null,
    });
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: string) => (table === 'sessions' ? sessions.query : answers.query)),
    } as never);

    await expect(fetchWeeklyProgressStats(
      'user-1',
      'America/Chicago',
      new Date('2026-11-04T02:00:00.000Z'),
    )).resolves.toMatchObject({
      answered: 4,
      correct: 2,
      incorrect: 1,
      partial: 1,
    });

    expect(sessions.calls).toContainEqual(['gte', 'local_date', '2026-11-02']);
    expect(sessions.calls).toContainEqual(['lte', 'local_date', '2026-11-03']);
    expect(answers.calls).toContainEqual(['in', 'session_id', ['standard-session', 'practice-session', 'study-session']]);
    expect(answers.calls).not.toContainEqual(['eq', 'simulation_mode', expect.anything()]);
  });
});

describe('getUtcDayBounds', () => {
  it('returns a UTC day range that is identical regardless of the input offset', () => {
    const bounds = getUtcDayBounds(new Date('2026-10-12T23:30:00-05:00'));

    expect(bounds).toEqual({
      start: '2026-10-13T00:00:00.000Z',
      end: '2026-10-14T00:00:00.000Z',
    });
  });
});

function makeQuery(result: unknown): {
  query: object;
  calls: Array<[string, ...unknown[]]>;
} {
  const calls: Array<[string, ...unknown[]]> = [];
  let query: object;
  query = new Proxy({}, {
    get: (_target, property: string | symbol) => {
      if (property === 'then') {
        return (
          onfulfilled: (value: unknown) => unknown,
          onrejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(onfulfilled, onrejected);
      }
      return (...args: unknown[]) => {
        calls.push([String(property), ...args]);
        return query;
      };
    },
  });
  return { query, calls };
}
