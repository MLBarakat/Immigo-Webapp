import { getSupabaseClient } from '../supabaseClient';
import { MessageSpeaker, PersistedMessage, SessionHydrationPayload } from '../types/persistence';
import { logger } from '../logger';
import type { Database } from '../../supabase/database-export/database.types';
import type { MessageAction } from '../context/conversationContextTypes';

type MessageRow = Database['public']['Tables']['messages']['Row'];

function toPersistedMessage(row: MessageRow): PersistedMessage {
  if (row.role !== 'user' && row.role !== 'assistant') {
    throw new Error(`Unsupported persisted message role: ${row.role}`);
  }

  const actions = (row as { actions?: unknown }).actions ?? undefined;
  const speaker = (row as { speaker?: unknown }).speaker;
  const clientMessageId = (row as { client_message_id?: string }).client_message_id;

  return {
    id: row.id,
    session_id: row.session_id,
    user_id: row.user_id,
    role: row.role,
    content: row.content,
    audio_url: null,
    created_at: row.created_at,
    speaker: isMessageSpeaker(speaker) ? speaker : undefined,
    actions: Array.isArray(actions) ? actions : undefined,
    client_message_id: clientMessageId,
  };
}

const MESSAGE_SPEAKERS: readonly MessageSpeaker[] = [
  'officer',
  'practice_coach',
  'study_coach',
  'system',
  'report',
  'user',
];

function isMessageSpeaker(value: unknown): value is MessageSpeaker {
  return typeof value === 'string' && (MESSAGE_SPEAKERS as readonly string[]).includes(value);
}

interface DailySessionRecord {
  id: string;
  current_item_id: string | null;
  mode_goal_pending: boolean;
  mode_ready_pending: boolean;
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
    content: string,
    actions?: readonly MessageAction[],
    speaker?: MessageSpeaker,
    clientMessageId?: string
  ): Promise<PersistedMessage | null> {
    if (!sessionId || !userId || !content.trim()) return null;

    try {
      const supabase = getSupabaseClient();
      const insertPayload: Record<string, unknown> = {
        session_id: sessionId,
        user_id: userId,
        role,
        content: content.trim(),
      };
      if (actions) insertPayload.actions = actions;
      if (speaker) insertPayload.speaker = speaker;
      if (clientMessageId) insertPayload.client_message_id = clientMessageId;
      const { data, error } = await supabase
        .from('messages')
        .insert(insertPayload as never)
        .select('*')
        .single();

      if (error) {
        logger.error('Failed to persist message in Supabase:', undefined, { error: error.message });
        return null;
      }

      return toPersistedMessage(data);
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
      const chronological = sliced.map(toPersistedMessage).reverse();
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
      const chronological = sliced.map(toPersistedMessage).reverse();
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

/**
 * One message accepted by the transcript formatter. Both `PersistedMessage`
 * (loaded from the database) and the live client `Message` shape can be mapped
 * onto it, so export never needs a second formatter.
 */
export interface TranscriptMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  speaker?: MessageSpeaker;
  actions?: readonly { kind: string; mode?: string }[];
  presentation?: 'progress';
}

export interface BuildTranscriptOptions {
  locale: string;
  /** True when older pages are still available in the database. */
  hasMoreHistory?: boolean;
}

const REPORT_MARKER = /^\[\[MOCK_EXAM_REVIEW:[0-9a-f-]+\]\]$/i;

const TRANSCRIPT_COPY: Record<string, Record<string, string>> = {
  en: {
    title_standard: 'ImmiGO Naturalization Interview Transcript',
    title_practice: 'ImmiGO Practice Coach Transcript',
    title_study: 'ImmiGO Study Coach Transcript',
    title_neutral: 'ImmiGO Conversation Transcript',
    user: 'User',
    officer: 'USCIS Officer',
    practice_coach: 'Practice Coach',
    study_coach: 'Study Coach',
    system: 'ImmiGO',
    report: 'Interview Report',
    reportAvailable: 'Interview report available in ImmiGO.',
    duration: 'Duration',
    dateRange: 'Date range',
    exported: 'Exported',
    partialHistory: 'Note: Only the most recent portion of the conversation is included.',
  },
  es: {
    title_standard: 'Transcripción de la entrevista de naturalización de ImmiGO',
    title_practice: 'Transcripción del entrenador de práctica de ImmiGO',
    title_study: 'Transcripción del entrenador de estudio de ImmiGO',
    title_neutral: 'Transcripción de la conversación de ImmiGO',
    user: 'Usuario',
    officer: 'Oficial de USCIS',
    practice_coach: 'Entrenador de práctica',
    study_coach: 'Entrenador de estudio',
    system: 'ImmiGO',
    report: 'Informe de entrevista',
    reportAvailable: 'Informe de entrevista disponible en ImmiGO.',
    duration: 'Duración',
    dateRange: 'Rango de fechas',
    exported: 'Exportado',
    partialHistory: 'Nota: Solo se incluye la porción más reciente de la conversación.',
  },
  fr: {
    title_standard: 'Transcription de l’entretien de naturalisation ImmiGO',
    title_practice: 'Transcription du coach d’entraînement ImmiGO',
    title_study: 'Transcription du coach d’étude ImmiGO',
    title_neutral: 'Transcription de la conversation ImmiGO',
    user: 'Utilisateur',
    officer: 'Agent de l’USCIS',
    practice_coach: 'Coach d’entraînement',
    study_coach: 'Coach d’étude',
    system: 'ImmiGO',
    report: 'Rapport d’entretien',
    reportAvailable: 'Rapport d’entretien disponible dans ImmiGO.',
    duration: 'Durée',
    dateRange: 'Période',
    exported: 'Exporté',
    partialHistory: 'Note : Seule la portion la plus récente de la conversation est incluse.',
  },
  ar: {
    title_standard: 'نسخة مقابلة التجنّس من ImmiGO',
    title_practice: 'نسخة مدرب التدريب من ImmiGO',
    title_study: 'نسخة مدرب الدراسة من ImmiGO',
    title_neutral: 'نسخة المحادثة من ImmiGO',
    user: 'المستخدم',
    officer: 'موظف USCIS',
    practice_coach: 'مدرب التدريب',
    study_coach: 'مدرب الدراسة',
    system: 'ImmiGO',
    report: 'تقرير المقابلة',
    reportAvailable: 'تقرير المقابلة متاح في ImmiGO.',
    duration: 'المدة',
    dateRange: 'نطاق التاريخ',
    exported: 'تم التصدير',
    partialHistory: 'ملاحظة: تم تضمين أحدث جزء من المحادثة فقط.',
  },
};

/**
 * Ephemeral UI-only bubbles never appear in a transcript:
 * - silent ten-answer activity cards,
 * - the daily greeting banner,
 * - empty placeholders.
 * Report markers are kept and rendered as a localized line instead.
 */
function isEphemeralMessage(message: TranscriptMessage): boolean {
  const id = message.id ?? '';
  return message.presentation === 'progress'
    || id.startsWith('progress-card-')
    || id.startsWith('progress-report-')
    || id.startsWith('progress-summary-')
    || id.startsWith('banner-')
    || !message.content.trim();
}

/** Prefer the persisted speaker; fall back to persisted actions, then ImmiGO. */
function speakerForMessage(message: TranscriptMessage): MessageSpeaker {
  if (message.role === 'user') return 'user';
  if (REPORT_MARKER.test(message.content.trim())) return 'report';
  if (message.speaker) return message.speaker;
  const action = message.actions?.[0];
  if (action?.kind === 'ready' || action?.kind === 'exam') return 'officer';
  if (action?.kind === 'learn') return action.mode === 'study' ? 'study_coach' : 'practice_coach';
  if (action?.kind === 'report') return 'report';
  return 'system';
}

function transcriptTitleKey(messages: readonly TranscriptMessage[]): string {
  const modes = new Set<string>();
  messages.forEach((message) => {
    const speaker = speakerForMessage(message);
    if (speaker === 'officer') modes.add('standard');
    else if (speaker === 'practice_coach') modes.add('practice');
    else if (speaker === 'study_coach') modes.add('study');
  });
  return modes.size === 1 ? `title_${[...modes][0]}` : 'title_neutral';
}

/**
 * Build the transcript text for download (F6).
 * - Sorted by timestamp ascending.
 * - Speaker comes from the persisted `speaker`, then from persisted actions.
 * - Report markers become a localized "report available" line.
 * - Same-day transcripts show elapsed duration; multi-day ones show a range.
 * - `hasMoreHistory` adds a note that only the loaded portion is included.
 * - There is no Session ID line.
 */
export function buildTranscriptText(
  messages: readonly TranscriptMessage[],
  options: BuildTranscriptOptions,
): string {
  const { locale, hasMoreHistory } = options;
  const lang = locale.split('-')[0];
  const dict = TRANSCRIPT_COPY[lang] ?? TRANSCRIPT_COPY.en;

  const t = (key: string, vars?: Record<string, string>) => {
    let result = dict[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        result = result.replace(new RegExp(`{{${k}}}`, 'g'), v);
      });
    }
    return result;
  };

  const relevant = messages.filter((message) => !isEphemeralMessage(message));
  if (relevant.length === 0) return '';

  const sorted = [...relevant].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const firstTime = new Date(sorted[0].created_at);
  const lastTime = new Date(sorted[sorted.length - 1].created_at);
  const sameDay = firstTime.toDateString() === lastTime.toDateString();

  const formatTime = (date: Date) => date.toLocaleString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const formatDate = (date: Date) => date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const headerLines: string[] = [t(transcriptTitleKey(sorted)), ''];

  if (sameDay) {
    const elapsedMs = lastTime.getTime() - firstTime.getTime();
    const elapsedMins = Math.floor(elapsedMs / 60000);
    const elapsedSecs = Math.floor((elapsedMs % 60000) / 1000);
    headerLines.push(`${t('duration')}: ${elapsedMins.toString().padStart(2, '0')}:${elapsedSecs.toString().padStart(2, '0')}`);
  } else {
    headerLines.push(`${t('dateRange')}: ${formatDate(firstTime)} – ${formatDate(lastTime)}`);
  }

  headerLines.push(`${t('exported')}: ${new Date().toLocaleString(locale)}`);
  headerLines.push('');

  if (hasMoreHistory) {
    headerLines.push(t('partialHistory'));
    headerLines.push('');
  }

  const bodyLines = sorted.map((message) => {
    const timestamp = formatTime(new Date(message.created_at));
    const speaker = speakerForMessage(message);
    const content = REPORT_MARKER.test(message.content.trim())
      ? t('reportAvailable')
      : message.content;
    return `[${timestamp}] ${t(speaker)}:\n${content}`;
  });

  return [...headerLines, ...bodyLines].join('\n');
}
