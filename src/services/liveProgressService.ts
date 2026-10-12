// src/services/liveProgressService.ts
//
// "Live" progress stats, computed directly from graded_answers — no Lambda
// round-trip, no Bedrock call, no Titan embedding. Every committed grade is
// already written to graded_answers in real time (persistGradedAnswer), so
// this is a plain arithmetic read, essentially free, safe to refresh after
// every single question. This is deliberately SEPARATE from the narrative
// progress report (aggregateSession), which is the expensive, LLM-generated
// prose summary — that stays throttled (session-end + periodic refresh),
// while these numeric facts can be as live as you want them.
import { getSupabaseClient } from '../supabaseClient';
import { logger } from '../logger';

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
 * Reads all of the user's committed answers for the current UTC day. Since
 * grades are stored in Supabase under the user's record, this is shared across
 * sessions and devices and naturally rolls over at UTC midnight.
 */
export async function fetchDailyProgressStats(userId: string, now = new Date()): Promise<LiveSessionStats | null> {
  if (!userId) return null;
  try {
    const { start, end } = getUtcDayBounds(now);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('graded_answers')
      .select('item_id, verdict')
      .eq('user_id', userId)
      .gte('created_at', start)
      .lt('created_at', end)
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
