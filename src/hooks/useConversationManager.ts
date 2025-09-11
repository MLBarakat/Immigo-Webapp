import { useCallback, useEffect, useRef } from 'react';
import { useConversation } from '../context/ConversationContext';
import * as audioUtils from '../utils/audioUtils';
import { Message } from '../types/conversation';

// This is a simplified representation of the updated hook.
// The key changes are the addition of `sendTextMessage` and the refactoring to use `processMessage`.

export const useConversationManager = () => {
  const { state, dispatch } = useConversation();
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const processMessage = useCallback(async (message: string, history: Message[]) => {
    dispatch({ type: 'SET_APP_STATUS', payload: 'processing' });
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_API_KEY}`,
        },
        body: JSON.stringify({ message, conversationHistory: history }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'API request failed' }));
        throw new Error(errorData.message);
      }

      const data = await response.json();
      dispatch({
        type: 'ADD_MESSAGE',
        payload: { role: 'assistant', content: data.responseText, timestamp: new Date().toISOString() },
      });

      dispatch({ type: 'SET_APP_STATUS', payload: 'speaking' });
      await audioUtils.playAudio(data.responseAudio);
      dispatch({ type: 'SET_APP_STATUS', payload: 'idle' });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      dispatch({ type: 'SET_ERROR', payload: `Failed to get response: ${errorMessage}` });
    }
  }, [dispatch]);

  const sendTextMessage = async (message: string) => {
    dispatch({
      type: 'ADD_MESSAGE',
      payload: { role: 'user', content: message, timestamp: new Date().toISOString() },
    });
    await processMessage(message, state.conversationHistory);
  };

  // ... (startSession and endSession logic would also be here, updated to use processMessage)

  return { sendTextMessage /*, startSession, endSession */ };
};