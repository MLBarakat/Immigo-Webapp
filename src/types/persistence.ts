export type UscisCategory = 'american_government' | 'american_history' | 'integrated_civics';

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
