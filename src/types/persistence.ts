import type { MessageAction } from '../context/conversationContextTypes';

export type UscisCategory = 'american_government' | 'american_history' | 'integrated_civics';

/** Speaker attribution for transcript export (F6). */
export type MessageSpeaker =
  | 'officer'
  | 'practice_coach'
  | 'study_coach'
  | 'system'
  | 'report'
  | 'user';

export interface SessionRecord {
  id: string;
  user_id: string;
  status: 'active' | 'completed';
  started_at: string;
  ended_at: string | null;
}

export interface PersistedMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  audio_url: string | null;
  created_at: string;
  /** Speaker attribution persisted with the message (F6 transcript export). */
  speaker?: MessageSpeaker;
  /** In-chat actions persisted with the message (F3, narrowed by F8). */
  actions?: readonly MessageAction[];
  /** Client-generated message ID for idempotent dedupe on hydration (F-07). */
  client_message_id?: string;
}

export interface DailyProgressReport {
  id: string;
  user_id: string;
  date: string;
  report_markdown: string;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionHydrationPayload {
  messages: PersistedMessage[];
  hasMore: boolean;
  oldestCursor: string | null;
}
