import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Message, AppStatus } from '../types/conversation';

export interface ConversationState {
  conversationHistory: Message[];
  appStatus: AppStatus;
  errorMessage: string | null;
  isSessionActive: boolean;
  sessionTime: number; // in seconds
  voiceId: string;
}

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
  | { type: 'TICK_SESSION_TIMER' };

const initialState: ConversationState = {
  conversationHistory: [],
  appStatus: 'idle',
  errorMessage: null,
  isSessionActive: false,
  sessionTime: 0,
  voiceId: 'Joanna',
};

function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  switch (action.type) {
    case 'START_SESSION':
      return {
        ...state,
        isSessionActive: true,
        appStatus: 'listening',
        errorMessage: null,
        sessionTime: 0,
        conversationHistory: action.payload?.clearHistory ? [] : state.conversationHistory,
      };

    case 'END_SESSION':
      return { ...state, isSessionActive: false, appStatus: 'idle', sessionTime: 0 };

    case 'SET_ERROR':
      return { ...state, appStatus: 'error', errorMessage: action.payload };

    case 'CLEAR_ERROR':
      return { ...state, errorMessage: null, appStatus: 'idle' };

    case 'SET_HISTORY':
        return { ...state, conversationHistory: action.payload };

    case 'CLEAR_HISTORY':
        return { ...state, conversationHistory: [] };

    case 'ADD_MESSAGE':
      return { ...state, conversationHistory: [...state.conversationHistory, action.payload] };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        conversationHistory: state.conversationHistory.map(msg =>
          msg.id === action.payload.id ? { ...msg, content: action.payload.content } : msg
        ),
      };

    case 'SET_VOICE':
      return { ...state, voiceId: action.payload };

    case 'START_LISTENING':
      return { ...state, appStatus: 'listening', errorMessage: null };
    case 'START_PROCESSING':
      return { ...state, appStatus: 'processing' };
    case 'START_SPEAKING':
      return { ...state, appStatus: 'speaking' };
    case 'STOP_SPEAKING':
      return { ...state, appStatus: state.isSessionActive ? 'listening' : 'idle' };

    case 'TICK_SESSION_TIMER':
      return { ...state, sessionTime: state.sessionTime + 1 };

    default:
      return state;
  }
}

interface ConversationContextType {
  state: ConversationState;
  dispatch: React.Dispatch<ConversationAction>;
}

const ConversationContext = createContext<ConversationContextType | undefined>(undefined);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(conversationReducer, initialState);
  return (
    <ConversationContext.Provider value={{ state, dispatch }}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversation() {
  const context = useContext(ConversationContext);
  if (context === undefined) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  return context;
}