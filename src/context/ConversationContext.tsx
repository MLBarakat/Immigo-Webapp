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
  currentLanguageCode: string;
  fontSize: 'small' | 'default' | 'large';
  aiVoiceId: string;
  liveFeedbackEnabled: boolean;
  micMode: 'voice_activity' | 'push_to_talk';
  bargeIn: 'relaxed' | 'balanced' | 'aggressive';
  isTranscribing: boolean; // NEW
  transcript: string; // NEW
}

type ConversationAction =
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'SET_APP_STATUS'; payload: AppStatus }
  | { type: 'START_SESSION' }
  | { type: 'END_SESSION' }
  | { type: 'TICK_SESSION_TIMER' }
  | { type: 'SET_ERROR_MESSAGE'; payload: string | null }
  | { type: 'CLEAR_CONVERSATION' }
  | { type: 'SET_LANGUAGE'; payload: string }
  | { type: 'SET_FONT_SIZE'; payload: 'small' | 'default' | 'large' }
  | { type: 'SET_AI_VOICE'; payload: string }
  | { type: 'SET_LIVE_FEEDBACK'; payload: boolean }
  | { type: 'SET_MIC_MODE'; payload: 'voice_activity' | 'push_to_talk' }
  | { type: 'SET_BARGE_IN'; payload: 'relaxed' | 'balanced' | 'aggressive' }
  | { type: 'START_PROCESSING' }
  | { type: 'STOP_SPEAKING' }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; content: string } }
  | { type: 'START_TRANSCRIPTION' } // NEW
  | { type: 'STOP_TRANSCRIPTION' } // NEW
  | { type: 'SET_TRANSCRIPT'; payload: string }; // NEW

const initialState: ConversationState = {
  conversationHistory: [],
  appStatus: 'idle',
  isSessionActive: false,
  sessionTime: 0,
  errorMessage: null,
  currentLanguageCode: 'en-US',
  fontSize: 'default',
  aiVoiceId: 'Joanna',
  liveFeedbackEnabled: true,
  micMode: 'voice_activity',
  bargeIn: 'balanced',
  isTranscribing: false, // NEW
  transcript: '', // NEW
};

const conversationReducer = (state: ConversationState, action: ConversationAction): ConversationState => {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return { ...state, conversationHistory: [...state.conversationHistory, action.payload] };
    case 'START_SESSION':
      return { ...state, isSessionActive: true, sessionTime: 0 };
    case 'END_SESSION':
      return { ...state, isSessionActive: false, appStatus: 'idle', isTranscribing: false, transcript: '' };
    case 'TICK_SESSION_TIMER':
      return { ...state, sessionTime: state.sessionTime + 1 };
    case 'SET_ERROR_MESSAGE':
      return { ...state, errorMessage: action.payload, appStatus: action.payload ? 'error' : 'idle' };
    case 'START_TRANSCRIPTION':
      return { ...state, isTranscribing: true, appStatus: 'listening', transcript: '' };
    case 'STOP_TRANSCRIPTION':
      return { ...state, isTranscribing: false, appStatus: state.isSessionActive ? 'idle' : 'idle', transcript: '' };
    case 'SET_TRANSCRIPT':
      return { ...state, transcript: action.payload };
    // Other cases...
    case 'SET_APP_STATUS': return { ...state, appStatus: action.payload };
    case 'CLEAR_CONVERSATION': return { ...state, conversationHistory: [] };
    case 'SET_LANGUAGE': return { ...state, currentLanguageCode: action.payload };
    case 'SET_FONT_SIZE': return { ...state, fontSize: action.payload };
    case 'SET_AI_VOICE': return { ...state, aiVoiceId: action.payload };
    case 'SET_LIVE_FEEDBACK': return { ...state, liveFeedbackEnabled: action.payload };
    case 'SET_MIC_MODE': return { ...state, micMode: action.payload };
    case 'SET_BARGE_IN': return { ...state, bargeIn: action.payload };
    case 'START_PROCESSING': return { ...state, appStatus: 'processing' };
    case 'STOP_SPEAKING': return { ...state, appStatus: 'listening' };
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
        const newAssistantMessage: Message = {
          id: action.payload.id,
          role: 'assistant',
          content: action.payload.content,
          timestamp: new Date().toISOString(),
        };
        return {
          ...state,
          conversationHistory: [...state.conversationHistory, newAssistantMessage],
        };
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