import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPersistenceService } from '../chatPersistenceService';
import { getSupabaseClient } from '../../supabaseClient';

vi.mock('../../supabaseClient', () => ({ getSupabaseClient: vi.fn() }));

function mockSessionsQuery(results: unknown[]) {
  let resultIndex = 0;
  const queries: Array<Record<string, any>> = [];
  const supabase = {
    from: vi.fn(() => {
      const result = results[resultIndex++] ?? { data: null, error: null };
      const query: Record<string, any> = {};
      for (const method of ['select', 'eq', 'not', 'is', 'order', 'limit', 'update', 'insert']) {
        query[method] = vi.fn(() => query);
      }
      query.maybeSingle = vi.fn().mockResolvedValue(result);
      query.single = vi.fn().mockResolvedValue(result);
      query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(resolve, reject);
      queries.push(query);
      return query;
    }),
  };
  vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
  return { supabase, queries };
}

describe('ChatPersistenceService daily session recovery', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('reuses a same-day session created in another device time zone', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T02:00:00.000Z'));
    const sharedSession = {
      id: 'tokyo-session',
      current_item_id: 'q-42',
      mode_goal_pending: false,
      current_mode: 'practice',
      test_version: '2020',
      include_english_simulation: false,
      local_date: '2026-10-27',
      local_timezone: 'Asia/Tokyo',
      created_at: '2026-10-26T23:00:00.000Z',
    };
    const { supabase, queries } = mockSessionsQuery([
      { data: null, error: null },
      { data: sharedSession, error: null },
    ]);

    const session = await ChatPersistenceService.getOrCreateDailySession(
      'user-1',
      '2026-10-26',
      'America/Los_Angeles'
    );

    expect(session?.id).toBe('tokyo-session');
    expect(session?.current_item_id).toBe('q-42');
    expect(supabase.from).toHaveBeenCalledTimes(3);
    expect(queries[2].update).toHaveBeenCalledWith({ status: 'active', ended_at: null });
    expect(queries[2].eq).toHaveBeenCalledWith('id', 'tokyo-session');
  });

  it('adopts an untagged legacy session only when it was created today locally', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T02:00:00.000Z'));
    const legacySession = {
      id: 'legacy-session',
      current_item_id: 'q-8',
      mode_goal_pending: false,
      current_mode: 'standard',
      test_version: '2020',
      include_english_simulation: false,
      local_date: null,
      local_timezone: null,
      created_at: '2026-10-27T01:00:00.000Z',
    };
    const { supabase, queries } = mockSessionsQuery([
      { data: null, error: null },
      { data: null, error: null },
      { data: legacySession, error: null },
      { data: { ...legacySession, local_date: '2026-10-26', local_timezone: 'America/Los_Angeles' }, error: null },
    ]);

    const session = await ChatPersistenceService.getOrCreateDailySession(
      'user-1',
      '2026-10-26',
      'America/Los_Angeles'
    );

    expect(session?.id).toBe('legacy-session');
    expect(queries[3].update).toHaveBeenCalledWith({
      local_date: '2026-10-26',
      local_timezone: 'America/Los_Angeles',
      status: 'active',
      ended_at: null,
    });
    expect(supabase.from).toHaveBeenCalledTimes(4);
  });
});
