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

/**
 * Reads this session's graded_answers directly (RLS already scopes rows to
 * the authenticated user — same Supabase client/session ChatPersistenceService
 * uses). Returns null on any failure rather than throwing: this is a "nice to
 * have, refresh often" read, never something that should break the turn loop.
 */
export async function fetchLiveSessionStats(sessionId: string): Promise<LiveSessionStats | null> {
  if (!sessionId) return null;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('graded_answers')
      .select('item_id, verdict')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.warn('[LiveProgress] graded_answers query error (non-fatal):', { error: error.message });
      return null;
    }
    return computeLiveStats((data ?? []) as GradedRow[]);
  } catch (err) {
    logger.warn('[LiveProgress] Exception fetching live stats (non-fatal):', { error: String(err) });
    return null;
  }
}
