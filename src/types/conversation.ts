export interface Message {
  id: string;
content: string;
role: 'user' | 'assistant';
timestamp: Date;
}

export type AppStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

// This interface has been updated to match the implementation in ConversationContext.tsx
export interface ConversationState {
conversationHistory: Message[];
appStatus: AppStatus;
errorMessage: string | null;
isSessionActive: boolean;
sessionTime: number;
voiceId: string;
currentLanguageCode: string;
}

// These actions have been updated to match the implementation in ConversationContext.tsx
export type ConversationAction =
| { type: 'START_SESSION'; payload?: { clearHistory: boolean } }
| { type: 'END_SESSION' }
| { type: 'SET_ERROR'; payload: string }
| { type: 'CLEAR_ERROR' }
| { type: 'ADD_MESSAGE'; payload: Message }
| { type: 'UPDATE_MESSAGE'; payload: { id: string; content: string } }
| { type: 'SET_HISTORY'; payload: Message[] }
| { type: 'CLEAR_HISTORY' }
| { type: 'START_LISTENING' }
| { type: 'START_PROCESSING' }
| { type: 'START_SPEAKING' }
| { type: 'STOP_SPEAKING' }
| { type: 'SET_VOICE'; payload: string }
| { type: 'SET_LANGUAGE'; payload: string }
| { type: 'TICK_SESSION_TIMER' };