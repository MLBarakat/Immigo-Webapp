import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPersistenceService } from '../chatPersistenceService';
import { getSupabaseClient } from '../../supabaseClient';

vi.mock('../../supabaseClient', () => ({ getSupabaseClient: vi.fn() }));

describe('ChatPersistenceService account-day sessions', () => {
  afterEach(() => vi.clearAllMocks());

  it('maps database messages to the UI model without inventing an audio URL', async () => {
    const row = {
      id: 'message-1',
      session_id: 'session-1',
      user_id: 'user-1',
      role: 'assistant',
      content: 'Welcome back.',
      created_at: '2026-10-27T05:30:00.000Z',
      updated_at: '2026-10-27T05:30:00.000Z',
    };
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    await expect(ChatPersistenceService.persistMessage('session-1', 'user-1', 'assistant', 'Welcome back.'))
      .resolves.toEqual({
        id: 'message-1',
        session_id: 'session-1',
        user_id: 'user-1',
        role: 'assistant',
        content: 'Welcome back.',
        audio_url: null,
        created_at: '2026-10-27T05:30:00.000Z',
      });
  });

  it('uses the database-resolved session day and account time zone', async () => {
    const row = {
      id: 'shared-session',
      current_item_id: 'q-42',
      mode_goal_pending: false,
      current_mode: 'practice',
      test_version: '2020',
      include_english_simulation: false,
      local_date: '2026-10-27',
      local_timezone: 'America/Chicago',
      started_at: '2026-10-27T05:30:00.000Z',
    };
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never);

    const session = await ChatPersistenceService.getOrCreateDailySession(
      'user-1',
      '2026-10-26', // Stale device date must not control session selection.
      'America/Chicago'
    );

    expect(rpc).toHaveBeenCalledWith('get_or_create_daily_learning_session', {
      p_user_id: 'user-1',
      p_timezone: 'America/Chicago',
    });
    expect(session?.id).toBe('shared-session');
    expect(session?.local_date).toBe('2026-10-27');
  });

  it('returns null for an RPC failure instead of creating a device-local session', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('database unavailable') });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never);

    await expect(ChatPersistenceService.getOrCreateDailySession('user-1', '2026-10-27', 'America/Chicago'))
      .resolves.toBeNull();
  });

  it('calculates calendar dates using the account time zone across UTC midnight', () => {
    const instant = new Date('2026-10-27T02:00:00.000Z');
    expect(ChatPersistenceService.getSessionDate('America/Chicago', instant)).toBe('2026-10-26');
    expect(ChatPersistenceService.getSessionDate('Asia/Tokyo', instant)).toBe('2026-10-27');
  });
});
