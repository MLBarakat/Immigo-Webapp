import { useCallback, useRef, useEffect } from 'react';
import { useConversation } from '../context/ConversationContext';
import { ApiClient } from '../services/apiClient';
import { v4 as uuidv4 } from 'uuid';
import { Message } from '../context/ConversationContext';

interface UseConversationManagerProps {
apiClient: ApiClient | null;
}

export const useConversationManager = ({ apiClient }: UseConversationManagerProps) => {
const { state, dispatch } = useConversation();
const currentConversationId = useRef<string>(uuidv4());
const intervalRef = useRef<number | null>(null);

const handleTextChunk = useCallback((textChunk: string) => {
dispatch({ type: 'UPDATE_MESSAGE', payload: { id: 'ai-temp-message', content: textChunk } });
  }, [dispatch]);

  const handleAudioChunk = useCallback((audioChunk: Uint8Array) => {
    console.log("Received AI audio chunk:", audioChunk);
  }, []);

  useEffect(() => {
    if (state.isSessionActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        dispatch({ type: 'TICK_SESSION_TIMER' });
      }, 1000) as unknown as number;
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state.isSessionActive, dispatch]);

  const startSession = useCallback(async () => {
    if (!apiClient) {
      dispatch({ type: 'SET_ERROR_MESSAGE', payload: 'API Client not available.' });
      return;
    }
    dispatch({ type: 'START_SESSION' });
    currentConversationId.current = uuidv4();
    console.log("Session started. Conversation ID:", currentConversationId.current);
  }, [apiClient, dispatch]);

  const endSession = useCallback(() => {
    dispatch({ type: 'END_SESSION' });
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    console.log("Session ended.");
  }, [dispatch]);

  const sendUserMessage = useCallback(async (text: string) => {
    if (!apiClient) {
      dispatch({ type: 'SET_ERROR_MESSAGE', payload: 'API Client not available.' });
      return;
    }

    dispatch({ type: 'START_PROCESSING' });

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

    try {
      await apiClient.sendMessage(
        currentConversationId.current,
        text,
        state.aiVoiceId,
        state.currentLanguageCode,
        state.micMode,
        state.bargeIn,
        state.liveFeedbackEnabled,
        handleTextChunk,
        handleAudioChunk
      );
      dispatch({ type: 'STOP_SPEAKING' });
    } catch (error: any) {
      console.error('Error sending message:', error);
      dispatch({ type: 'SET_ERROR_MESSAGE', payload: error.message || 'Failed to send message.' });
      dispatch({ type: 'STOP_SPEAKING' });
    }
  }, [apiClient, dispatch, state.aiVoiceId, state.currentLanguageCode, state.micMode, state.bargeIn, state.liveFeedbackEnabled, handleTextChunk, handleAudioChunk]);

  const clearConversation = useCallback(async () => {
    dispatch({ type: 'CLEAR_CONVERSATION' });
    console.log("Conversation cleared.");
  }, [dispatch]);

  const downloadTranscript = useCallback(() => {
    const transcript = state.conversationHistory.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n');
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `immigo_transcript_${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [state.conversationHistory]);

  return {
    ...state,
    startSession,
    endSession,
    sendUserMessage,
    clearConversation,
    downloadTranscript,
    clearError: () => dispatch({ type: 'SET_ERROR_MESSAGE', payload: null }),
  };
};