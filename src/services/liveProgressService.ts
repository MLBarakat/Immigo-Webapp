// src/services/liveProgressService.ts
//
// "Live" progress stats, computed directly from graded_answers — no Lambda
// round-trip, no Bedrock call, no Titan embedding. Every committed grade is
// already written to graded_answers in real time (persistGradedAnswer), so
// this is a plain arithmetic read, essentially free, safe to refresh after
// every single question. Daily stats use the shared device-local date session,
// so typing, voice, mode changes, and other devices accumulate together. This
// is deliberately SEPARATE from the narrative
// progress report (aggregateSession), which is the expensive, LLM-generated
// prose summary — that stays throttled (session-end + periodic refresh),
// while these numeric facts can be as live as you want them.
import { getSupabaseClient } from '../supabaseClient';
import { logger } from '../logger';
import { ChatPersistenceService } from './chatPersistenceService';

export interface LiveSessionStats {
  answered: number;
  correct: number;
  incorrect: number;
  partial: number;
  accuracyPct: number; // 0-100, rounded
  missedItemIds: string[]; // incorrect or partial, most-recent first
}

export interface ProgressReport {
  id: string;
  date: string;
  report_markdown: string;
}

export interface QuestionMastery {
  attempts: number;
  correctCount: number;
  masteryPct: number;
  mastered: boolean;
}

export async function fetchQuestionMastery(userId: string, itemId: string, testVersion: '2008' | '2020'): Promise<QuestionMastery | null> {
  if (!userId || !itemId) return null;
  const { data, error } = await getSupabaseClient().from('question_mastery')
    .select('attempts,correct_count,mastery_pct,mastered')
    .eq('user_id', userId).eq('item_id', itemId).eq('test_version', testVersion).maybeSingle();
  if (error) {
    logger.warn('[LiveProgress] Question mastery query error:', { error: error.message });
    return null;
  }
  return data ? {
    attempts: Number(data.attempts),
    correctCount: Number(data.correct_count),
    masteryPct: Number(data.mastery_pct),
    mastered: data.mastered === true,
  } : null;
}

interface GradedRow {
  item_id: string;
  verdict: 'correct' | 'incorrect' | 'partial';
}

/** Pure computation — mirrors the same math aggregateSession uses server-side,
 * so the live numbers and the eventual narrative report never disagree. */
export function computeLiveStats(rows: GradedRow[]): LiveSessionStats {
  const answered = rows.length;
  const correct = rows.filter((r) => r.verdict === 'correct').length;
  const incorrect = rows.filter((r) => r.verdict === 'incorrect').length;
  const partial = rows.filter((r) => r.verdict === 'partial').length;
  const accuracyPct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  const missedItemIds = rows.filter((r) => r.verdict !== 'correct').map((r) => r.item_id);

  return { answered, correct, incorrect, partial, accuracyPct, missedItemIds };
}

export function getUtcDayBounds(now = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Reads the committed answers for the user's current account-time-zone day session.
 */
export async function fetchDailyProgressStats(userId: string, accountTimezone = 'UTC', now = new Date()): Promise<LiveSessionStats | null> {
  if (!userId) return null;
  try {
    const supabase = getSupabaseClient();
    const localDate = ChatPersistenceService.getSessionDate(accountTimezone, now);
    const { data: session, error: sessionError } = await supabase.from('sessions')
      .select('id').eq('user_id', userId).eq('local_date', localDate).maybeSingle();
    if (sessionError) throw sessionError;
    let sessionId = session?.id as string | undefined;
    if (!sessionId) {
      // A learner may change their account time zone mid-day. Continue using
      // that day's original session until its original calendar boundary.
      const { data: latest, error: latestError } = await supabase.from('sessions')
        .select('id,local_date,local_timezone')
        .eq('user_id', userId)
        .not('local_date', 'is', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;
      if (latest?.local_date && latest.local_timezone
        && ChatPersistenceService.getSessionDate(latest.local_timezone, now) === latest.local_date) {
        sessionId = latest.id as string;
      }
    }
    if (!sessionId) return computeLiveStats([]);
    const { data, error } = await supabase
      .from('graded_answers')
      .select('item_id, verdict')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.warn('[LiveProgress] Daily graded_answers query error (non-fatal):', { error: error.message });
      return null;
    }

    return computeLiveStats((data ?? []) as GradedRow[]);
  } catch (err) {
    logger.warn('[LiveProgress] Exception fetching daily progress stats (non-fatal):', { error: String(err) });
    return null;
  }
}

export async function fetchProgressReports(userId: string): Promise<ProgressReport[]> {
  if (!userId) return [];

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('daily_progress_reports')
    .select('id, date, report_markdown')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(20);

  if (error) {
    logger.error('[LiveProgress] Failed to load historical reports:', undefined, { error: error.message });
    throw new Error('Progress reports could not be loaded. Please try again.');
  }

  return (data ?? []) as ProgressReport[];
}
