import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '../../supabaseClient';
import { MockExamService } from '../mockExamService';
import type { MockExamReviewDecisionChoice } from '../apiClient';

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
      or: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: exam, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.or.mockReturnValue(query);
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
      or: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('Database unavailable') }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.or.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => query) } as never);

    await expect(MockExamService.getLatestInProgress('user-1', '2020')).rejects.toThrow('Database unavailable');
  });

  it('ignores a zero-answer in-progress interview (not resumable)', async () => {
    const zeroAnswerExam = {
      id: 'exam-zero',
      test_version: '2020',
      current_index: 0,
      question_ids: ['q-1'],
      correct_count: 0,
      incorrect_count: 0,
      include_english_simulation: false,
      english_stage: 'none',
    };
    const realProgressExam = {
      id: 'exam-real',
      test_version: '2020',
      current_index: 3,
      question_ids: ['q-1', 'q-2', 'q-3'],
      correct_count: 1,
      incorrect_count: 1,
      include_english_simulation: false,
      english_stage: 'none',
    };
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      or: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: realProgressExam, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.or.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => query) } as never);

    await expect(MockExamService.getLatestInProgress('user-1', '2020')).resolves.toEqual(realProgressExam);
    // The zero-answer row must be excluded by the real-progress filter.
    expect(query.eq).toHaveBeenCalledWith('status', 'in_progress');
    expect(query.or).toHaveBeenCalledWith(
      expect.stringContaining('current_index.gt.0'),
    );
  });

  it('loads the owner-scoped immutable review decision for an exam', async () => {
    const decision = {
      review_decision: 'study',
      review_decision_note: 'Review the Bill of Rights',
      review_decision_at: '2026-11-04T12:00:00.000Z',
    };
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: decision, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => query) } as never);

    await expect(MockExamService.getReviewDecision('user-1', 'exam-1')).resolves.toEqual({
      choice: 'study',
      note: 'Review the Bill of Rights',
      decidedAt: '2026-11-04T12:00:00.000Z',
    });
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('id', 'exam-1');
  });

  it('detects an owner-scoped user message after the completed exam', async () => {
    const examQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { session_id: 'session-1', completed_at: '2026-11-12T10:00:00.000Z' },
        error: null,
      }),
    };
    examQuery.select.mockReturnValue(examQuery);
    examQuery.eq.mockReturnValue(examQuery);

    const messageQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      gt: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'message-1' }, error: null }),
    };
    messageQuery.select.mockReturnValue(messageQuery);
    messageQuery.eq.mockReturnValue(messageQuery);
    messageQuery.gt.mockReturnValue(messageQuery);
    messageQuery.limit.mockReturnValue(messageQuery);

    const from = vi.fn()
      .mockReturnValueOnce(examQuery)
      .mockReturnValueOnce(messageQuery);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    await expect(MockExamService.hasUserProceededAfterExam('user-1', 'exam-1')).resolves.toBe(true);

    expect(examQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(examQuery.eq).toHaveBeenCalledWith('id', 'exam-1');
    expect(messageQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(messageQuery.eq).toHaveBeenCalledWith('session_id', 'session-1');
    expect(messageQuery.eq).toHaveBeenCalledWith('role', 'user');
    expect(messageQuery.gt).toHaveBeenCalledWith('created_at', '2026-11-12T10:00:00.000Z');
  });

  it('does not hide the report section when no post-exam user message exists', async () => {
    const examQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { session_id: 'session-1', completed_at: '2026-11-12T10:00:00.000Z' },
        error: null,
      }),
    };
    examQuery.select.mockReturnValue(examQuery);
    examQuery.eq.mockReturnValue(examQuery);

    const messageQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      gt: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    messageQuery.select.mockReturnValue(messageQuery);
    messageQuery.eq.mockReturnValue(messageQuery);
    messageQuery.gt.mockReturnValue(messageQuery);
    messageQuery.limit.mockReturnValue(messageQuery);
    const from = vi.fn()
      .mockReturnValueOnce(examQuery)
      .mockReturnValueOnce(messageQuery);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    await expect(MockExamService.hasUserProceededAfterExam('user-1', 'exam-1')).resolves.toBe(false);
  });

  it('atomically records the decision and goal and returns the persisted decision', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        saved: true,
        review_decision: 'practice',
        review_decision_note: 'Review the Bill of Rights',
        review_decision_at: '2026-11-04T12:00:00.000Z',
      }],
      error: null,
    });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never);

    const result = await MockExamService.recordReviewDecision(
      'user-1',
      'exam-1',
      'practice',
      '  Review the Bill of Rights  ',
    );

    expect(rpc).toHaveBeenCalledWith('record_mock_exam_review_decision', {
      p_exam_id: 'exam-1',
      p_decision: 'practice',
      p_note: 'Review the Bill of Rights',
    });
    expect(result).toEqual({
      wasCreated: true,
      decision: {
        choice: 'practice',
        note: 'Review the Bill of Rights',
        decidedAt: '2026-11-04T12:00:00.000Z',
      },
    });
  });

  it.each(['practice', 'study'] satisfies MockExamReviewDecisionChoice[])(
    'requires a nonblank learning goal for a %s decision',
    async (choice) => {
      const rpc = vi.fn();
      vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never);

      await expect(
        MockExamService.recordReviewDecision('user-1', 'exam-1', choice, '   '),
      ).rejects.toThrow('A learning focus is required for this decision.');
      expect(rpc).not.toHaveBeenCalled();
    },
  );
});
