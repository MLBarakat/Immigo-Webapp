import { useContext } from 'react';
import { ConversationContext, ConversationContextType } from '../context/conversationContextTypes';

export const useConversation = (): ConversationContextType => {
  const context = useContext(ConversationContext);
  if (context === undefined) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  return context;
};