import { useCallback, useRef, useEffect } from 'react';
import { useConversation } from '../context/ConversationContext';
import { ApiClient } from '../services/apiClient';
import { v4 as uuidv4 } from 'uuid';
import { Message } from '../context/conversationContextTypes';
import { useWhisper } from './useWhisper'; // Import the new hook
import { UserSettings } from '../types/settings';
import { analytics } from '../analytics';

interface UseConversationManagerProps {
  apiClient: ApiClient | null;
  userSettings: Partial<UserSettings>;
}

export function useConversationManager({ apiClient }: UseConversationManagerProps) {
  const { state, dispatch } = useConversation();
  const intervalRef = useRef<number | null>(null);

  // Replace DeepgramManager with the useWhisper hook
  const {
    transcript,
    isModelLoading,
    modelLoadingProgress,
    isTranscribing,
    startRecording,
    stopRecording
  } = useWhisper();

  // Effect to sync whisper's transcribing status with the app's status
  useEffect(() => {
    if (isTranscribing) {
      dispatch({ type: 'SET_STATUS', payload: 'processing' });
    } else if (state.appStatus === 'processing' && !isTranscribing) {
      // When transcription is done, return to listening if session is active
      dispatch({ type: 'SET_STATUS', payload: state.isSessionActive ? 'listening' : 'idle' });
    }
  }, [isTranscribing, dispatch, state.appStatus, state.isSessionActive]);

  const sendTextMessage = useCallback(async (text: string) => {
    if (!apiClient || !text.trim()) {
      return;
    }

    const userMessage: Message = { id: uuidv4(), role: 'user', content: text, timestamp: new Date().toISOString() };
    const assistantMessageId = uuidv4();

    // Dispatch user message and set status to processing for the AI response
    dispatch({ type: 'SEND_MESSAGE_START', payload: { userMessage, assistantMessageId } });

    try {
      const audioData = await apiClient.postTranscript(text);
      
      // Simulate receiving text response for now
      const simulatedTextResponse = "This is a simulated response to your transcript.";
      dispatch({ type: 'RECEIVE_ASSISTANT_CHUNK', payload: { content: simulatedTextResponse } });

      const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.play();
      dispatch({ type: 'SET_STATUS', payload: 'speaking' });

      audio.onended = () => {
        dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
        URL.revokeObjectURL(audioUrl);
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message.';
      dispatch({ type: 'SEND_MESSAGE_FAILURE', payload: errorMessage });
    }
  }, [apiClient, dispatch]);

  // Effect to automatically send the transcript when it's ready
  useEffect(() => {
    if (transcript?.text) {
      sendTextMessage(transcript.text);
    }
  }, [transcript, sendTextMessage]);


  const startSession = useCallback(() => {
    dispatch({ type: 'START_SESSION' });
    analytics.track('session_started');
    startRecording(); // Use whisper hook
  }, [dispatch, startRecording]);

  const endSession = useCallback(() => {
    stopRecording(); // Use whisper hook
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
      stopRecording(); // Ensure cleanup on component unmount
    };
  }, [state.isSessionActive, dispatch, stopRecording]);

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
    isModelLoading, // Pass down model loading state
    modelLoadingProgress, // Pass down model loading progress
    isTranscribing: state.appStatus === 'processing', // Derive from app status
    startSession,
    endSession,
    sendTextMessage,
    clearConversation,
    downloadTranscript,
    clearError: () => dispatch({ type: 'SEND_MESSAGE_FAILURE', payload: '' }),
  };
}