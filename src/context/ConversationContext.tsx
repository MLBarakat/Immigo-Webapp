import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { ConversationState, ConversationAction, AppStatus } from '../types/conversation';

const initialState: ConversationState = {
  conversationHistory: [],
  appStatus: 'idle',
  errorMessage: null,
  isSessionActive: false,
  currentAudio: null,
  abortController: null,
};

function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  switch (action.type) {
    case 'START_SESSION':
      return {
        ...state,
        isSessionActive: true,
        appStatus: 'idle',
        errorMessage: null,
        conversationHistory: [],
      };
    
    case 'END_SESSION':
      // Stop current audio if playing
      if (state.currentAudio) {
        state.currentAudio.pause();
        state.currentAudio.currentTime = 0;
      }
      
      // Abort any pending requests
      if (state.abortController) {
        state.abortController.abort();
      }
      
      return {
        ...state,
        isSessionActive: false,
        appStatus: 'idle',
        currentAudio: null,
        abortController: null,
      };
    
    case 'SET_STATUS':
      return {
        ...state,
        appStatus: action.payload,
        errorMessage: action.payload === 'error' ? state.errorMessage : null,
      };
    
    case 'SET_ERROR':
      return {
        ...state,
        appStatus: 'error',
        errorMessage: action.payload,
      };
    
    case 'CLEAR_ERROR':
      return {
        ...state,
        errorMessage: null,
        appStatus: state.isSessionActive ? 'idle' : 'idle',
      };
    
    case 'ADD_MESSAGE':
      return {
        ...state,
        conversationHistory: [...state.conversationHistory, action.payload],
      };
    
    case 'START_LISTENING':
      return {
        ...state,
        appStatus: 'listening',
        errorMessage: null,
      };
    
    case 'START_PROCESSING':
      return {
        ...state,
        appStatus: 'processing',
      };
    
    case 'START_SPEAKING':
      return {
        ...state,
        appStatus: 'speaking',
        currentAudio: action.payload,
      };
    
    case 'STOP_SPEAKING':
      return {
        ...state,
        appStatus: 'idle',
        currentAudio: null,
      };
    
    case 'SET_ABORT_CONTROLLER':
      return {
        ...state,
        abortController: action.payload,
      };
    
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