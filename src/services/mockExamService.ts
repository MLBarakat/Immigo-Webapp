import { getSupabaseClient } from '../supabaseClient';
import { logger } from '../logger';

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
}
