import type React from 'react';
import { createContext } from 'react';

// Synchronized directly with the Authoritative FSM state machine targets
export type AppStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ConversationState {
  conversationHistory: readonly Message[];
  appStatus: AppStatus;
  isSessionActive: boolean;
  sessionTime: number;
  errorMessage: string | null;
  transcript: string;
  interimTranscript: string; // Used exclusively as an interim text holder
  currentLanguageCode: string;
  assistantMessageId: string | null;
}

export type ConversationAction =
  | { type: 'START_SESSION' }
  | { type: 'END_SESSION' }
  | { type: 'SET_TRANSCRIPT'; payload: string }
  | { type: 'SET_INTERIM_TRANSCRIPT'; payload: string }
  | { type: 'CLEAR_CONVERSATION' }
  | { type: 'TICK_SESSION_TIMER' }
  | { type: 'SET_LANGUAGE'; payload: string }
  | { type: 'SEND_MESSAGE_START'; payload: { userMessage: Message; assistantMessageId: string } }
  | { type: 'RECEIVE_ASSISTANT_CHUNK'; payload: { content: string } }
  | { type: 'FINISH_ASSISTANT_RESPONSE' }
  | { type: 'SEND_MESSAGE_FAILURE'; payload: { error: string; userMessageId: string; assistantMessageId: string } }
  | { type: 'SEND_MESSAGE_ROLLBACK'; payload: { userMessageId: string; assistantMessageId: string } }
  | { type: 'SET_STATUS'; payload: AppStatus }
  | { type: 'CLEAR_ERROR' };

export const initialState: ConversationState = {
  conversationHistory: [],
  appStatus: 'idle',
  isSessionActive: false,
  sessionTime: 0,
  errorMessage: null,
  transcript: '',
  interimTranscript: '',
  currentLanguageCode: 'en-US',
  assistantMessageId: null,
};

export const conversationReducer = (state: ConversationState, action: ConversationAction): ConversationState => {
  switch (action.type) {
    case 'START_SESSION':
      return { 
        ...state, 
        isSessionActive: true, 
        sessionTime: 0, 
        appStatus: 'listening', 
        errorMessage: null, 
        interimTranscript: '' 
      };

    case 'END_SESSION':
      return { 
        ...state, 
        isSessionActive: false, 
        appStatus: 'idle', 
        sessionTime: 0, 
        interimTranscript: '' 
      };

    case 'SET_TRANSCRIPT':
      return { ...state, transcript: action.payload, appStatus: 'listening' };

    case 'SET_INTERIM_TRANSCRIPT':
      return { ...state, interimTranscript: action.payload };

    case 'SET_STATUS':
      return { ...state, appStatus: action.payload };

    case 'CLEAR_CONVERSATION':
      return { ...state, conversationHistory: [], interimTranscript: '' };

    case 'TICK_SESSION_TIMER':
      return { ...state, sessionTime: state.isSessionActive ? state.sessionTime + 1 : 0 };

    case 'SET_LANGUAGE':
      return { ...state, currentLanguageCode: action.payload };

    case 'SEND_MESSAGE_START': {
      const newAssistantMessage: Message = { 
        id: action.payload.assistantMessageId, 
        role: 'assistant', 
        content: '', 
        timestamp: new Date().toISOString() 
      };
      return {
        ...state,
        appStatus: 'processing',
        transcript: '',
        interimTranscript: '', // Clear speculative holder on prompt dispatch
        errorMessage: null,
        conversationHistory: [...state.conversationHistory, action.payload.userMessage, newAssistantMessage],
        assistantMessageId: action.payload.assistantMessageId,
      };
    }

    case 'RECEIVE_ASSISTANT_CHUNK':
      if (!state.assistantMessageId) return state;
      return {
        ...state,
        appStatus: 'speaking',
        conversationHistory: state.conversationHistory.map(msg =>
          msg.id === state.assistantMessageId ? { ...msg, content: msg.content + action.payload.content } : msg
        ),
      };

    case 'FINISH_ASSISTANT_RESPONSE':
      return {
        ...state,
        appStatus: state.isSessionActive ? 'listening' : 'idle',
        assistantMessageId: null,
      };

    case 'SEND_MESSAGE_FAILURE':
      // FIXED: Perform an atomic array filter on error to eradicate UI ghost messages
      return {
        ...state,
        appStatus: 'error',
        errorMessage: action.payload.error,
        assistantMessageId: null,
        conversationHistory: state.conversationHistory.filter(
          msg => msg.id !== action.payload.userMessageId && msg.id !== action.payload.assistantMessageId
        ),
      };

    case 'SEND_MESSAGE_ROLLBACK':
      return {
        ...state,
        conversationHistory: state.conversationHistory.filter(
          msg => msg.id !== action.payload.userMessageId && msg.id !== action.payload.assistantMessageId
        ),
      };

    case 'CLEAR_ERROR':
      return { ...state, errorMessage: null, appStatus: 'idle' };

    default:
      return state;
  }
};

export interface ConversationContextType {
  state: ConversationState;
  dispatch: React.Dispatch<ConversationAction>;
}

export const ConversationContext = createContext<ConversationContextType | undefined>(undefined);