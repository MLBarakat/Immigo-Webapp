import { getSupabaseClient } from '../supabaseClient';
import { PersistedMessage, SessionHydrationPayload } from '../types/persistence';
import { logger } from '../logger';

export class ChatPersistenceService {
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
  static async loadRecentMessages(userId: string, limit = 25): Promise<SessionHydrationPayload> {
    if (!userId) return { messages: [], hasMore: false, oldestCursor: null };

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit + 1);

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
    limit = 25
  ): Promise<SessionHydrationPayload> {
    if (!userId || !beforeCursor) return { messages: [], hasMore: false, oldestCursor: null };

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .lt('created_at', beforeCursor)
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
