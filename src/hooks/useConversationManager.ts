import { useCallback, useRef, useEffect, useMemo } from 'react';
import { useConversation } from '../context/ConversationContext';
import { ApiClient } from '../services/apiClient';
import { v4 as uuidv4 } from 'uuid';
import { Message } from '../context/ConversationContext';
import { SpeechRecognitionManager } from '../utils/audioUtils';

interface UseConversationManagerProps {
apiClient: ApiClient | null;
}

export function useConversationManager({ apiClient }: UseConversationManagerProps) {
  const { state, dispatch } = useConversation();
  const currentConversationId = useRef<string>(uuidv4());
  const intervalRef = useRef<number | null>(null);

  const speechManager = useMemo(() => new SpeechRecognitionManager(), []);

  const handleTextChunk = useCallback((textChunk: string) => {
    dispatch({ type: 'UPDATE_MESSAGE', payload: { id: 'ai-temp-message', content: textChunk } });
  }, [dispatch]);

  const handleAudioChunk = useCallback((audioChunk: Uint8Array) => {
    console.log("Received AI audio chunk:", audioChunk);
  }, []);

  const sendUserMessage = useCallback(async (text: string) => {
    if (!apiClient || text.trim() === '') return;

    speechManager.stopListening(); // Stop listening when sending a message
    dispatch({ type: 'STOP_TRANSCRIPTION' });
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message.';
      console.error('Error sending message:', error);
      dispatch({ type: 'SET_ERROR_MESSAGE', payload: errorMessage });
    } finally {
      dispatch({ type: 'SET_APP_STATUS', payload: state.isSessionActive ? 'listening' : 'idle' });
    }
  }, [apiClient, dispatch, state.aiVoiceId, state.currentLanguageCode, state.micMode, state.bargeIn, state.liveFeedbackEnabled, handleTextChunk, handleAudioChunk, speechManager, state.isSessionActive]);

  const handleTranscriptionResult = useCallback((transcript: string, isFinal: boolean) => {
    dispatch({ type: 'SET_TRANSCRIPT', payload: transcript });
    if (isFinal) {
      sendUserMessage(transcript);
    }
  }, [dispatch, sendUserMessage]);

  const handleTranscriptionError = useCallback((error: string) => {
    dispatch({ type: 'SET_ERROR_MESSAGE', payload: `Speech recognition error: ${error}` });
    dispatch({ type: 'STOP_TRANSCRIPTION' });
  }, [dispatch]);

  const startAudioInput = useCallback(() => {
    if (!state.isSessionActive) return;
    dispatch({ type: 'START_TRANSCRIPTION' });
    speechManager.startListening(
      handleTranscriptionResult,
      handleTranscriptionError,
      () => dispatch({ type: 'STOP_TRANSCRIPTION' }),
      state.currentLanguageCode
    );
  }, [state.isSessionActive, speechManager, handleTranscriptionResult, handleTranscriptionError, dispatch, state.currentLanguageCode]);

  const stopAudioInput = useCallback(() => {
    speechManager.stopListening();
    dispatch({ type: 'STOP_TRANSCRIPTION' });
  }, [speechManager, dispatch]);

  useEffect(() => {
    if (state.isSessionActive) {
      intervalRef.current = setInterval(() => dispatch({ type: 'TICK_SESSION_TIMER' }), 1000) as unknown as number;
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      speechManager.stopListening();
    };
  }, [state.isSessionActive, dispatch, speechManager]);

  const startSession = useCallback(() => {
    if (!apiClient) {
      dispatch({ type: 'SET_ERROR_MESSAGE', payload: 'API Client not available.' });
      return;
    }
    dispatch({ type: 'START_SESSION' });
    currentConversationId.current = uuidv4();
  }, [apiClient, dispatch]);

  const endSession = useCallback(() => {
    dispatch({ type: 'END_SESSION' });
  }, [dispatch]);

  const clearConversation = useCallback(() => {
    dispatch({ type: 'CLEAR_CONVERSATION' });
  }, [dispatch]);

  const downloadTranscript = useCallback(() => {
    const transcript = state.conversationHistory.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n');
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `immigo_transcript_${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.conversationHistory]);

  return {
    ...state,
    startSession,
    endSession,
    sendUserMessage,
    clearConversation,
    downloadTranscript,
    startAudioInput,
    stopAudioInput,
    clearError: () => dispatch({ type: 'SET_ERROR_MESSAGE', payload: null }),
  };
}