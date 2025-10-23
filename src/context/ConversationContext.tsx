import React, { useReducer, ReactNode } from 'react';
import { ApiClient } from '../services/apiClient';
import {
  ConversationContext,
  conversationReducer,
  initialState,
  ConversationContextType,
} from './conversationContextTypes';

interface ConversationProviderProps { children: ReactNode; apiClient: ApiClient | null; }

export function ConversationProvider({ children }: ConversationProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(conversationReducer, initialState);
  return (
    <ConversationContext.Provider value={{ state, dispatch }}>
      {children}
    </ConversationContext.Provider>
  );
}
