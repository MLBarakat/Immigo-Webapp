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
  transcript: string;
  currentLanguageCode: string;
  assistantMessageId: string | null;
}

type ConversationAction =
  | { type: 'START_SESSION' }
  | { type: 'END_SESSION' }
  | { type: 'SET_TRANSCRIPT'; payload: string }
  | { type: 'CLEAR_CONVERSATION' }
  | { type: 'TICK_SESSION_TIMER' }
  | { type: 'SET_LANGUAGE'; payload: string }
  | { type: 'SEND_MESSAGE_START'; payload: { userMessage: Message; assistantMessageId: string } }
  | { type: 'RECEIVE_ASSISTANT_CHUNK'; payload: { content: string } }
  | { type: 'FINISH_ASSISTANT_RESPONSE' }
  | { type: 'SEND_MESSAGE_FAILURE'; payload: string };

const initialState: ConversationState = {
  conversationHistory: [],
  appStatus: 'idle',
  isSessionActive: false,
  sessionTime: 0,
  errorMessage: null,
  transcript: '',
  currentLanguageCode: 'en-US',
  assistantMessageId: null,
};

const conversationReducer = (state: ConversationState, action: ConversationAction): ConversationState => {
  switch (action.type) {
    case 'START_SESSION':
      return { ...state, isSessionActive: true, sessionTime: 0, appStatus: 'listening', errorMessage: null };
    case 'END_SESSION':
      return { ...state, isSessionActive: false, appStatus: 'idle', sessionTime: 0 };
    case 'SET_TRANSCRIPT':
      return { ...state, transcript: action.payload, appStatus: 'listening' };
    case 'CLEAR_CONVERSATION':
      return { ...state, conversationHistory: [] };
    case 'TICK_SESSION_TIMER':
      return { ...state, sessionTime: state.isSessionActive ? state.sessionTime + 1 : 0 };
    case 'SET_LANGUAGE':
      return { ...state, currentLanguageCode: action.payload };

    case 'SEND_MESSAGE_START':
      const newAssistantMessage: Message = { id: action.payload.assistantMessageId, role: 'assistant', content: '', timestamp: new Date().toISOString() };
      return {
        ...state,
        appStatus: 'processing',
        transcript: '',
        errorMessage: null,
        conversationHistory: [...state.conversationHistory, action.payload.userMessage, newAssistantMessage],
        assistantMessageId: action.payload.assistantMessageId,
      };

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
      return {
        ...state,
        appStatus: 'error',
        errorMessage: action.payload,
        assistantMessageId: null,
      };

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