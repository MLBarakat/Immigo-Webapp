import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '../../supabaseClient';
import { MockExamService } from '../mockExamService';

vi.mock('../../supabaseClient', () => ({ getSupabaseClient: vi.fn() }));
vi.mock('../../logger', () => ({
  logger: { error: vi.fn() },
}));

describe('MockExamService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the latest unfinished interview', async () => {
    const exam = {
      id: 'exam-1',
      test_version: '2020',
      current_index: 4,
      question_ids: ['q-1', 'q-2'],
      correct_count: 2,
      incorrect_count: 1,
      include_english_simulation: false,
      english_stage: 'none',
    };
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: exam, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => query) } as never);

    await expect(MockExamService.getLatestInProgress('user-1', '2020')).resolves.toEqual(exam);
    expect(query.eq).toHaveBeenCalledWith('status', 'in_progress');
  });

  it('propagates lookup errors so the UI can protect unfinished progress', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('Database unavailable') }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => query) } as never);

    await expect(MockExamService.getLatestInProgress('user-1', '2020')).rejects.toThrow('Database unavailable');
  });
});
