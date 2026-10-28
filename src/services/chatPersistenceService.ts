import { getSupabaseClient } from '../supabaseClient';
import { PersistedMessage, SessionHydrationPayload } from '../types/persistence';
import { logger } from '../logger';

interface DailySessionRecord {
  id: string;
  current_item_id: string | null;
  mode_goal_pending: boolean;
  current_mode: string;
  test_version: string;
  include_english_simulation: boolean;
  local_date?: string | null;
  local_timezone?: string | null;
  started_at?: string;
}

function getDateInTimeZone(date: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (type: 'year' | 'month' | 'day') => parts.find(part => part.type === type)?.value;
    const year = get('year');
    const month = get('month');
    const day = get('day');
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

export class ChatPersistenceService {
  static getSessionDate(timeZone = 'UTC', date = new Date()): string {
    return getDateInTimeZone(date, timeZone) ?? date.toISOString().slice(0, 10);
  }

  static getDeviceLocalDate(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  static async getOrCreateDailySession(
    userId: string,
    _localDate = ChatPersistenceService.getSessionDate('UTC'),
    localTimezone = 'UTC'
  ): Promise<DailySessionRecord | null> {
    if (!userId || !localTimezone) return null;
    try {
      const { data, error } = await getSupabaseClient().rpc('get_or_create_daily_learning_session', {
        p_user_id: userId,
        p_timezone: localTimezone,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? row as DailySessionRecord : null;
    } catch (err) {
      logger.error('Failed to get or create the account-time-zone daily session:', undefined, { error: String(err) });
      return null;
    }
  }

  static async saveDailySessionState(
    sessionId: string,
    state: { current_item_id?: string | null; current_mode?: string; test_version?: string; include_english_simulation?: boolean }
  ): Promise<void> {
    if (!sessionId) return;
    try {
      const { error } = await getSupabaseClient().from('sessions').update(state).eq('id', sessionId);
      if (error) logger.error('Failed to save daily learning state:', undefined, { error: error.message });
    } catch (err) {
      logger.error('Exception saving daily learning state:', undefined, { error: String(err) });
    }
  }
  /**
   * Inserts a new active session record into the `sessions` table.
   * Returns the new session ID, or null if unauthenticated or error.
   */
  static async createSession(userId: string): Promise<string | null> {
    if (!userId) return null;
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('sessions')
        .insert({ user_id: userId, status: 'active' })
        .select('id')
        .single();

      if (error) {
        logger.error('Failed to create chat session in Supabase:', undefined, { error: error.message });
        return null;
      }

      logger.info(`New chat session created successfully: ${data.id}`);
      return data.id;
    } catch (err) {
      logger.error('Exception creating chat session:', undefined, { error: String(err) });
      return null;
    }
  }

  /**
   * Sets session status to 'completed' and sets ended_at timestamp.
   */
  static async closeSession(sessionId: string): Promise<void> {
    if (!sessionId) return;
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) {
        logger.error(`Failed to close session ${sessionId}:`, undefined, { error: error.message });
      } else {
        logger.info(`Session ${sessionId} marked completed.`);
      }
    } catch (err) {
      logger.error(`Exception closing session ${sessionId}:`, undefined, { error: String(err) });
    }
  }

  /**
   * Persists a single message bubble into the `messages` table.
   */
  static async persistMessage(
    sessionId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<PersistedMessage | null> {
    if (!sessionId || !userId || !content.trim()) return null;

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('messages')
        .insert({
          session_id: sessionId,
          user_id: userId,
          role,
          content: content.trim(),
        })
        .select('*')
        .single();

      if (error) {
        logger.error('Failed to persist message in Supabase:', undefined, { error: error.message });
        return null;
      }

      return data as PersistedMessage;
    } catch (err) {
      logger.error('Exception persisting message:', undefined, { error: String(err) });
      return null;
    }
  }

  /**
   * Loads the most recent messages across all sessions for continuous chat UI hydration.
   * Returns messages in chronological order (oldest to newest).
   */
  static async loadRecentMessages(userId: string, limit = 25, sessionId?: string | null): Promise<SessionHydrationPayload> {
    if (!userId) return { messages: [], hasMore: false, oldestCursor: null };

    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from('messages')
        .select('*')
        .eq('user_id', userId);
      if (sessionId) query = query.eq('session_id', sessionId);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(limit + 1);

      if (error) {
        logger.error('Failed to load recent messages from Supabase:', undefined, { error: error.message });
        return { messages: [], hasMore: false, oldestCursor: null };
      }

      if (!data || data.length === 0) {
        return { messages: [], hasMore: false, oldestCursor: null };
      }

      const hasMore = data.length > limit;
      const sliced = hasMore ? data.slice(0, limit) : data;

      // Reverse to deliver chronological order (oldest first for top-to-bottom rendering)
      const chronological = (sliced as PersistedMessage[]).reverse();
      const oldestCursor = chronological[0]?.created_at || null;

      return {
        messages: chronological,
        hasMore,
        oldestCursor,
      };
    } catch (err) {
      logger.error('Exception loading recent messages:', undefined, { error: String(err) });
      return { messages: [], hasMore: false, oldestCursor: null };
    }
  }

  /**
   * Loads older messages created before the `beforeCursor` timestamp (infinite scroll upward).
   */
  static async loadOlderMessages(
    userId: string,
    beforeCursor: string,
    limit = 25,
    sessionId?: string | null
  ): Promise<SessionHydrationPayload> {
    if (!userId || !beforeCursor) return { messages: [], hasMore: false, oldestCursor: null };

    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .lt('created_at', beforeCursor);
      if (sessionId) query = query.eq('session_id', sessionId);
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(limit + 1);

      if (error) {
        logger.error('Failed to load older messages from Supabase:', undefined, { error: error.message });
        return { messages: [], hasMore: false, oldestCursor: null };
      }

      if (!data || data.length === 0) {
        return { messages: [], hasMore: false, oldestCursor: null };
      }

      const hasMore = data.length > limit;
      const sliced = hasMore ? data.slice(0, limit) : data;

      // Reverse to deliver chronological order
      const chronological = (sliced as PersistedMessage[]).reverse();
      const oldestCursor = chronological[0]?.created_at || null;

      return {
        messages: chronological,
        hasMore,
        oldestCursor,
      };
    } catch (err) {
      logger.error('Exception loading older messages:', undefined, { error: String(err) });
      return { messages: [], hasMore: false, oldestCursor: null };
    }
  }
}
