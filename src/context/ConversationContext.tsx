import { useReducer, ReactNode } from 'react';
import {
  ConversationContext,
  conversationReducer,
  initialState,
} from './conversationContextTypes';

interface ConversationProviderProps { children: ReactNode; }

export function ConversationProvider({ children }: ConversationProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(conversationReducer, initialState);
  return (
    <ConversationContext.Provider value={{ state, dispatch }}>
      {children}
    </ConversationContext.Provider>
  );
}