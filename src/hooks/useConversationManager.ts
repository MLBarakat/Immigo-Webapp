import { useCallback, useRef, useEffect } from 'react';
import { useConversation } from '../context/ConversationContext';
import { ApiClient } from '../services/apiClient';
import { v4 as uuidv4 } from 'uuid';
import { Message } from '../context/conversationContextTypes';
import { useWhisper } from './useWhisper';
import { UserSettings } from '../types/settings';
import { analytics } from '../analytics';
import { logger } from '../logger';

interface UseConversationManagerProps {
  apiClient: ApiClient | null;
  userSettings: Partial<UserSettings>;
}

export function useConversationManager({ apiClient }: UseConversationManagerProps) {
  const { state, dispatch } = useConversation();
  const intervalRef = useRef<number | null>(null);
  const processedTranscriptRef = useRef<string>('');

  // VAD-based Whisper hook
  const {
    interimTranscript,
    finalTranscript,
    isModelLoading,
    isVadReady,
    modelLoadingProgress,
    startRecording,
    stopRecording
  } = useWhisper();

  // Effect to update the live interim transcript in the UI
  useEffect(() => {
    dispatch({ type: 'SET_INTERIM_TRANSCRIPT', payload: interimTranscript });
  }, [interimTranscript, dispatch]);

  const sendTextMessage = useCallback(async (text: string) => {
    if (!apiClient) {
      dispatch({ type: 'SEND_MESSAGE_FAILURE', payload: 'System is initializing. Please wait a moment and try again.' });
      dispatch({ type: 'SET_STATUS', payload: 'idle' });
      return;
    }
    if (!text.trim()) {
      return;
    }

    const userMessage: Message = { id: uuidv4(), role: 'user', content: text, timestamp: new Date().toISOString() };
    const assistantMessageId = uuidv4();

    dispatch({ type: 'SEND_MESSAGE_START', payload: { userMessage, assistantMessageId } });
    dispatch({ type: 'SET_STATUS', payload: 'processing' });

    try {
      // 1. Get the real text and audio from the updated API client
      const { responseText, audioData } = await apiClient.postTranscript(text);
      
      // 2. Dispatch the real assistant text to the conversation history
      dispatch({ type: 'RECEIVE_ASSISTANT_CHUNK', payload: { content: responseText } });

      // 3. Play the assistant's audio
      const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.play().catch(error => {
        logger.error("Audio playback failed.", error);
        dispatch({ type: 'SEND_MESSAGE_FAILURE', payload: 'Audio playback failed. Your browser may require interaction first.' });
      });
      dispatch({ type: 'SET_STATUS', payload: 'speaking' });

      audio.onended = () => {
        dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
        URL.revokeObjectURL(audioUrl);
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message.';
      dispatch({ type: 'SET_STATUS', payload: 'idle' });
      // Rollback the optimistic update
      dispatch({ type: 'SEND_MESSAGE_ROLLBACK', payload: { userMessageId: userMessage.id, assistantMessageId } });
      dispatch({ type: 'SEND_MESSAGE_FAILURE', payload: errorMessage });
    }
  }, [apiClient, dispatch]);

  // Effect to automatically send the final transcript when it's ready
  useEffect(() => {
    // If there's new final text that we haven't processed yet
    if (finalTranscript && finalTranscript !== processedTranscriptRef.current) {
      // Extract only the new portion of the text
      const newText = finalTranscript.substring(processedTranscriptRef.current.length).trim();
      
      if (newText) {
        sendTextMessage(newText);
      }

      // Update the ref to mark the new text as processed
      processedTranscriptRef.current = finalTranscript;
    }
  }, [finalTranscript, sendTextMessage]);


  const startSession = useCallback(() => {
    dispatch({ type: 'START_SESSION' });
    analytics.track('session_started');
    // Reset transcript history for the new session
    processedTranscriptRef.current = ''; 
    startRecording();
  }, [dispatch, startRecording]);

  const endSession = useCallback(() => {
    stopRecording();
    dispatch({ type: 'END_SESSION' });
    analytics.track('session_ended', { duration_seconds: state.sessionTime });
  }, [dispatch, stopRecording, state.sessionTime]);

  useEffect(() => {
    if (state.isSessionActive) {
      intervalRef.current = setInterval(() => dispatch({ type: 'TICK_SESSION_TIMER' }), 1000) as unknown as number;
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state.isSessionActive, dispatch]);

  // Ensure we stop recording when the component unmounts.
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  const clearConversation = useCallback(() => {
    dispatch({ type: 'CLEAR_CONVERSATION' });
    analytics.track('conversation_cleared');
  }, [dispatch]);

  const downloadTranscript = useCallback(() => {
    const transcriptText = state.conversationHistory.map((msg: any) => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n');
    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `immigo_transcript_${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    analytics.track('transcript_downloaded');
  }, [state.conversationHistory]);

  return {
    ...state,
    isModelLoading,
    isVadReady,
    modelLoadingProgress,
    isTranscribing: state.appStatus === 'processing',
    startSession,
    endSession,
    sendTextMessage,
    clearConversation,
    downloadTranscript,
    clearError: () => dispatch({ type: 'SEND_MESSAGE_FAILURE', payload: '' }),
  };
}