import { useCallback, useRef, useEffect, useMemo } from 'react';
import { useConversation } from '../context/ConversationContext';
import { ApiClient } from '../services/apiClient';
import { v4 as uuidv4 } from 'uuid';
import { Message } from '../context/ConversationContext';
import { SpeechRecognitionManager } from '../utils/audioUtils';
import { UserSettings } from '../types/settings';
import { analytics } from '../analytics'; // Import analytics service

interface UseConversationManagerProps {
apiClient: ApiClient | null;
userSettings: Partial<UserSettings>;
}

export function useConversationManager({ apiClient, userSettings }: UseConversationManagerProps) {
  const { state, dispatch } = useConversation();
  const currentConversationId = useRef<string>(uuidv4());
  const intervalRef = useRef<number | null>(null);

  const speechManager = useMemo(() => new SpeechRecognitionManager(), []);

  const sendTextMessage = useCallback(async (text: string) => {
    if (!apiClient || !text.trim() || state.appStatus === 'processing' || state.appStatus === 'speaking') {
      return;
    }

    const userMessage: Message = { id: uuidv4(), role: 'user', content: text, timestamp: new Date().toISOString() };
    const assistantMessageId = uuidv4();

    dispatch({ type: 'SEND_MESSAGE_START', payload: { userMessage, assistantMessageId } });

    try {
      await apiClient.sendMessage(
        currentConversationId.current,
        text,
        userSettings.ai_voice_id || 'Joanna',
        state.currentLanguageCode,
        userSettings.mic_mode || 'voice_activity',
        userSettings.barge_in || 'balanced',
        !!userSettings.live_feedback_enabled,
        (textChunk) => dispatch({ type: 'RECEIVE_ASSISTANT_CHUNK', payload: { content: textChunk } }),
        (audioChunk) => console.log("Received AI audio chunk:", audioChunk) // Placeholder for audio playback
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message.';
      dispatch({ type: 'SEND_MESSAGE_FAILURE', payload: errorMessage });
    } finally {
      dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
    }
  }, [apiClient, dispatch, userSettings, state.currentLanguageCode, state.appStatus]);

  useEffect(() => {
    if (state.isSessionActive && state.appStatus === 'listening') {
      speechManager.startListening(
        (transcript, isFinal) => {
          dispatch({ type: 'SET_TRANSCRIPT', payload: transcript });
          if (isFinal) {
            sendTextMessage(transcript);
          }
        },
        (error) => dispatch({ type: 'SEND_MESSAGE_FAILURE', payload: error }),
        () => {
          if (state.isSessionActive) {
            dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
          }
        },
        state.currentLanguageCode
      );
    }
  }, [state.isSessionActive, state.appStatus, speechManager, sendTextMessage, dispatch, state.currentLanguageCode]);


  const startSession = useCallback(() => {
    dispatch({ type: 'START_SESSION' });
    analytics.track('session_started'); // Event tracking
  }, [dispatch]);

  const endSession = useCallback(() => {
    speechManager.stopListening();
    dispatch({ type: 'END_SESSION' });
    analytics.track('session_ended', { duration_seconds: state.sessionTime }); // Event tracking
  }, [dispatch, speechManager, state.sessionTime]);

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

  const clearConversation = useCallback(() => {
    dispatch({ type: 'CLEAR_CONVERSATION' });
    analytics.track('conversation_cleared'); // Event tracking
  }, [dispatch]);

  const downloadTranscript = useCallback(() => {
    const transcript = state.conversationHistory.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n');
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `immigo_transcript_${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    analytics.track('transcript_downloaded'); // Event tracking
  }, [state.conversationHistory]);

  const isTranscribing = state.appStatus === 'listening' && !!state.transcript;

  return {
    ...state,
    isTranscribing,
    startSession,
    endSession,
    sendTextMessage,
    clearConversation,
    downloadTranscript,
    clearError: () => dispatch({ type: 'SEND_MESSAGE_FAILURE', payload: '' }),
  };
}