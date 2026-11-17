import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPersistenceService, buildTranscriptText, type TranscriptMessage } from '../chatPersistenceService';
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

  it('persists assistant speaker attribution and maps it back to the UI model', async () => {
    const row = {
      id: 'message-2',
      session_id: 'session-1',
      user_id: 'user-1',
      role: 'assistant',
      content: 'Nice work on that one.',
      speaker: 'practice_coach',
      created_at: '2026-11-14T05:30:00.000Z',
      updated_at: '2026-11-14T05:30:00.000Z',
    };
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    await expect(
      ChatPersistenceService.persistMessage('session-1', 'user-1', 'assistant', 'Nice work on that one.', undefined, 'practice_coach')
    ).resolves.toEqual(expect.objectContaining({ speaker: 'practice_coach' }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ speaker: 'practice_coach' }));
  });

  it('persists a client message ID and maps it back for refresh dedupe', async () => {
    const row = {
      id: 'message-3',
      session_id: 'session-1',
      user_id: 'user-1',
      role: 'user',
      content: 'The Constitution was signed in 1787.',
      client_message_id: 'client-msg-123',
      created_at: '2026-11-16T05:30:00.000Z',
      updated_at: '2026-11-16T05:30:00.000Z',
    };
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    await expect(
      ChatPersistenceService.persistMessage(
        'session-1',
        'user-1',
        'user',
        'The Constitution was signed in 1787.',
        undefined,
        undefined,
        'client-msg-123'
      )
    ).resolves.toEqual(expect.objectContaining({ client_message_id: 'client-msg-123' }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ client_message_id: 'client-msg-123' }));
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

describe('buildTranscriptText (F6 speaker attribution + export)', () => {
  const baseTime = '2026-11-14T15:00:00.000Z';

  const userMsg = (content: string, ts?: string): TranscriptMessage => ({
    id: 'msg-user',
    role: 'user',
    content,
    created_at: ts ?? baseTime,
  });

  const assistantMsg = (content: string, actionKind: 'ready' | 'learn' | 'report' | 'exam', ts?: string): TranscriptMessage => ({
    id: 'msg-assistant',
    role: 'assistant',
    content,
    created_at: ts ?? baseTime,
    actions: [{ kind: actionKind }],
  });

  it('attributes speaker labels per message type', () => {
    const messages: TranscriptMessage[] = [
      { ...userMsg('What is the Constitution?', '2026-11-14T15:00:00.000Z') },
      { ...assistantMsg('The Constitution is the supreme law.', 'ready', '2026-11-14T15:01:00.000Z') },
    ];

    const out = buildTranscriptText(messages, { locale: 'en-US' });
    expect(out).toContain('User:');
    expect(out).toContain('USCIS Officer:');
  });

  it('keeps ordinary assistant replies that carry no actions', () => {
    const messages: TranscriptMessage[] = [
      userMsg('Who was the first president?', '2026-11-14T15:00:00.000Z'),
      {
        id: 'msg-plain',
        role: 'assistant',
        content: 'George Washington was the first president.',
        created_at: '2026-11-14T15:01:00.000Z',
        speaker: 'practice_coach',
      },
    ];

    const out = buildTranscriptText(messages, { locale: 'en-US' });
    expect(out).toContain('George Washington was the first president.');
    expect(out).toContain('Practice Coach:');
  });

  it('uses the persisted speaker instead of guessing from the role', () => {
    const messages: TranscriptMessage[] = [
      {
        ...assistantMsg('Take your time.', 'learn', '2026-11-14T15:01:00.000Z'),
        speaker: 'study_coach',
      },
    ];

    const out = buildTranscriptText(messages, { locale: 'en-US' });
    expect(out).toContain('Study Coach:');
  });

  it('renders report markers as a localized report line and drops progress cards', () => {
    const messages: TranscriptMessage[] = [
      userMsg('I am ready.', '2026-11-14T15:00:00.000Z'),
      {
        id: 'msg-report',
        role: 'assistant',
        content: '[[MOCK_EXAM_REVIEW:11111111-2222-3333-4444-555555555555]]',
        created_at: '2026-11-14T15:02:00.000Z',
        speaker: 'report',
      },
      {
        id: 'progress-card-123',
        role: 'assistant',
        content: "Today's activity: 10 of 10 correct (100%).",
        created_at: '2026-11-14T15:03:00.000Z',
        presentation: 'progress',
      },
    ];

    const out = buildTranscriptText(messages, { locale: 'en-US' });
    expect(out).toContain('Interview Report:');
    expect(out).toContain('Interview report available in ImmiGO.');
    expect(out).not.toContain('MOCK_EXAM_REVIEW');
    expect(out).not.toContain("Today's activity");
  });

  it('uses a mode-specific title for a single-mode transcript and a neutral title for mixed modes', () => {
    const practiceOnly: TranscriptMessage[] = [
      {
        ...assistantMsg('Practice question one?', 'learn', '2026-11-14T15:00:00.000Z'),
        speaker: 'practice_coach',
      },
    ];
    const mixed: TranscriptMessage[] = [
      { ...assistantMsg('Welcome to your interview.', 'ready', '2026-11-14T15:00:00.000Z'), speaker: 'officer' },
      { ...assistantMsg('Practice question one?', 'learn', '2026-11-14T15:05:00.000Z'), speaker: 'practice_coach' },
    ];

    const practiceOut = buildTranscriptText(practiceOnly, { locale: 'en-US' });
    const mixedOut = buildTranscriptText(mixed, { locale: 'en-US' });

    expect(practiceOut).toContain('ImmiGO Practice Coach Transcript');
    expect(mixedOut).toContain('ImmiGO Conversation Transcript');
    expect(mixedOut).not.toContain('ImmiGO Practice Coach Transcript');
  });

  it('notes partial history and derives a date range for multi-day transcripts', () => {
    const messages: TranscriptMessage[] = [
      { ...assistantMsg('Day one question.', 'learn', '2026-11-13T15:00:00.000Z'), speaker: 'practice_coach' },
      { ...assistantMsg('Day two question.', 'learn', '2026-11-14T15:00:00.000Z'), speaker: 'practice_coach' },
    ];

    const out = buildTranscriptText(messages, { locale: 'en-US', hasMoreHistory: true });
    expect(out).toContain('Date range:');
    expect(out).toContain('Only the most recent portion');
  });

  it('never includes a session id or session-id label in the export header', () => {
    const out = buildTranscriptText([userMsg('Hello.', '2026-11-14T15:00:00.000Z')], { locale: 'en-US' });
    expect(out).not.toMatch(/session id/i);
    expect(out).not.toContain('session-1');
  });
});
