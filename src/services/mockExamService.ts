import { getSupabaseClient } from '../supabaseClient';
import { logger } from '../logger';
import type {
  MockExamReviewDecision,
  MockExamReviewDecisionChoice,
} from './apiClient';

export interface InProgressMockExam {
  id: string;
  test_version: '2008' | '2020';
  current_index: number;
  question_ids: string[];
  correct_count: number;
  incorrect_count: number;
  include_english_simulation: boolean;
  english_stage: 'none' | 'reading' | 'writing' | 'complete';
}

export interface RecordMockExamReviewDecisionResult {
  wasCreated: boolean;
  decision: MockExamReviewDecision;
}

function isDecisionChoice(value: unknown): value is MockExamReviewDecisionChoice {
  return value === 'practice'
    || value === 'study'
    || value === 'new_interview'
    || value === 'review_answers'
    || value === 'finish_for_now';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mapDecision(value: unknown): MockExamReviewDecision | null {
  if (!isRecord(value)) {
    throw new Error('The saved interview decision is incomplete.');
  }
  const choice = value.review_decision;
  const note = value.review_decision_note;
  const decidedAt = value.review_decision_at;
  if (choice === null && note === null && decidedAt === null) {
    return null;
  }
  if (!isDecisionChoice(choice)
    || (note !== null && typeof note !== 'string')
    || typeof decidedAt !== 'string') {
    throw new Error('The saved interview decision is incomplete.');
  }
  return {
    choice,
    note,
    decidedAt,
  };
}

export class MockExamService {
  static async getLatestInProgress(userId: string, testVersion: '2008' | '2020'): Promise<InProgressMockExam | null> {
    if (!userId) return null;
    try {
      const { data, error } = await getSupabaseClient()
        .from('mock_exams')
        .select('id,test_version,current_index,question_ids,correct_count,incorrect_count,include_english_simulation,english_stage')
        .eq('user_id', userId)
        .eq('test_version', testVersion)
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as InProgressMockExam | null;
    } catch (error) {
      logger.error('Could not check for an unfinished Standard Interview.', undefined, { error: String(error) });
      throw error;
    }
  }

  static async getReviewDecision(
    userId: string,
    examId: string,
  ): Promise<MockExamReviewDecision | null> {
    if (!userId || !examId) return null;
    try {
      const { data, error } = await getSupabaseClient()
        .from('mock_exams')
        .select('review_decision,review_decision_note,review_decision_at')
        .eq('user_id', userId)
        .eq('id', examId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapDecision(data) : null;
    } catch (error) {
      logger.error('Could not load the Standard Interview decision.', undefined, {
        error: String(error),
      });
      throw error;
    }
  }

  static async recordReviewDecision(
    userId: string,
    examId: string,
    choice: MockExamReviewDecisionChoice,
    note: string | null,
  ): Promise<RecordMockExamReviewDecisionResult> {
    const cleanNote = note?.trim() || null;
    const goalChoice = choice === 'practice' || choice === 'study';
    if (!userId || !examId) {
      throw new Error('A signed-in user and completed interview are required.');
    }
    if (goalChoice && (!cleanNote || cleanNote.length > 300)) {
      throw new Error('A learning focus is required for this decision.');
    }
    if (!goalChoice && cleanNote !== null) {
      throw new Error('A learning focus is only valid for a Practice or Study decision.');
    }

    try {
      const { data, error } = await getSupabaseClient().rpc(
        'record_mock_exam_review_decision',
        {
          p_exam_id: examId,
          p_decision: choice,
          p_note: cleanNote ?? '',
        },
      );
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : null;
      if (!isRecord(result) || typeof result.saved !== 'boolean') {
        throw new Error('The interview decision could not be saved.');
      }
      const decision = mapDecision(result);
      if (!decision) {
        throw new Error('The interview decision response was incomplete.');
      }
      return { wasCreated: result.saved, decision };
    } catch (error) {
      logger.error('Could not save the Standard Interview decision.', undefined, {
        error: String(error),
      });
      throw error;
    }
  }
}
