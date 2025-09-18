import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { ApiClient } from '../services/apiClient';

export type AppStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ConversationState {
  conversationHistory: readonly Message[];
  appStatus: AppStatus;
  isSessionActive: boolean;
  sessionTime: number;
  errorMessage: string | null;
  transcript: string; // For displaying interim speech results
}

type ConversationAction =
  | { type: 'START_SESSION' }
  | { type: 'END_SESSION' }
  | { type: 'SET_APP_STATUS'; payload: AppStatus }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; content: string } }
  | { type: 'SET_TRANSCRIPT'; payload: string }
  | { type: 'CLEAR_TRANSCRIPT' }
  | { type: 'SET_ERROR_MESSAGE'; payload: string | null }
  | { type: 'CLEAR_CONVERSATION' }
  | { type: 'TICK_SESSION_TIMER' };

const initialState: ConversationState = {
  conversationHistory: [],
  appStatus: 'idle',
  isSessionActive: false,
  sessionTime: 0,
  errorMessage: null,
  transcript: '',
};

const conversationReducer = (state: ConversationState, action: ConversationAction): ConversationState => {
  switch (action.type) {
    case 'START_SESSION':
      return { ...state, isSessionActive: true, sessionTime: 0, appStatus: 'listening', errorMessage: null };
    case 'END_SESSION':
      return { ...state, isSessionActive: false, appStatus: 'idle', sessionTime: 0 };
    case 'SET_APP_STATUS':
      return { ...state, appStatus: action.payload };
    case 'ADD_MESSAGE':
      return { ...state, conversationHistory: [...state.conversationHistory, action.payload] };
    case 'SET_TRANSCRIPT':
      return { ...state, transcript: action.payload };
    case 'CLEAR_TRANSCRIPT':
      return { ...state, transcript: '' };
    case 'SET_ERROR_MESSAGE':
      return { ...state, errorMessage: action.payload, appStatus: 'error' };
    case 'CLEAR_CONVERSATION':
      return { ...state, conversationHistory: [] };
    case 'TICK_SESSION_TIMER':
      return { ...state, sessionTime: state.isSessionActive ? state.sessionTime + 1 : 0 };
    case 'UPDATE_MESSAGE':
      const existingMessage = state.conversationHistory.find(msg => msg.id === action.payload.id);
      if (existingMessage) {
        return {
          ...state,
          conversationHistory: state.conversationHistory.map(msg =>
            msg.id === action.payload.id ? { ...msg, content: msg.content + action.payload.content } : msg
          ),
        };
      } else {
        const newAssistantMessage: Message = { id: action.payload.id, role: 'assistant', content: action.payload.content, timestamp: new Date().toISOString() };
        return { ...state, conversationHistory: [...state.conversationHistory, newAssistantMessage] };
      }
    default:
      return state;
  }
};

interface ConversationContextType {
  state: ConversationState;
  dispatch: React.Dispatch<ConversationAction>;
}
const ConversationContext = createContext<ConversationContextType | undefined>(undefined);
interface ConversationProviderProps { children: ReactNode; apiClient: ApiClient | null; }

export function ConversationProvider({ children }: ConversationProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(conversationReducer, initialState);
  return (
    <ConversationContext.Provider value={{ state, dispatch }}>
      {children}
    </ConversationContext.Provider>
  );
}

export const useConversation = (): ConversationContextType => {
  const context = useContext(ConversationContext);
  if (context === undefined) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  return context;
};