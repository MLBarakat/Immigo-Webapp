export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  audioData?: string;
}

export type AppStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface ConversationState {
  conversationHistory: Message[];
  appStatus: AppStatus;
  errorMessage: string | null;
  isSessionActive: boolean;
  currentAudio: HTMLAudioElement | null;
  abortController: AbortController | null;
}

export type ConversationAction =
  | { type: 'START_SESSION' }
  | { type: 'END_SESSION' }
  | { type: 'SET_STATUS'; payload: AppStatus }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'START_LISTENING' }
  | { type: 'START_PROCESSING' }
  | { type: 'START_SPEAKING'; payload: HTMLAudioElement }
  | { type: 'STOP_SPEAKING' }
  | { type: 'SET_ABORT_CONTROLLER'; payload: AbortController | null };