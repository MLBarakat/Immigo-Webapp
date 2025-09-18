import { useCallback, useRef, useEffect, useMemo } from 'react';
import { useConversation } from '../context/ConversationContext';
import { ApiClient } from '../services/apiClient';
import { v4 as uuidv4 } from 'uuid';
import { Message } from '../context/ConversationContext';
import { SpeechRecognitionManager } from '../utils/audioUtils';
import { UserSettings } from '../types/settings';

interface UseConversationManagerProps {
apiClient: ApiClient | null;
userSettings: Partial<UserSettings>;
}

export function useConversationManager({ apiClient, userSettings }: UseConversationManagerProps) {
  const { state, dispatch } = useConversation();
  const currentConversationId = useRef<string>(uuidv4());
  const intervalRef = useRef<number | null>(null);

  const speechManager = useMemo(() => new SpeechRecognitionManager(), []);

  const handleTextChunk = useCallback((textChunk: string) => {
    dispatch({ type: 'UPDATE_MESSAGE', payload: { id: 'ai-temp-message', content: textChunk } });
  }, [dispatch]);

  const handleAudioChunk = useCallback((audioChunk: Uint8Array) => {
    console.log("Received AI audio chunk:", audioChunk); // Placeholder for audio playback
  }, []);

  const sendUserMessage = useCallback(async (text: string) => {
    if (!apiClient || text.trim() === '') return;

    dispatch({ type: 'CLEAR_TRANSCRIPT' });
    dispatch({ type: 'SET_APP_STATUS', payload: 'processing' });

    const userMessage: Message = { id: uuidv4(), role: 'user', content: text, timestamp: new Date().toISOString() };
    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

    try {
      const tempAiMessage: Message = { id: 'ai-temp-message', role: 'assistant', content: '...', timestamp: new Date().toISOString() };
      dispatch({ type: 'ADD_MESSAGE', payload: tempAiMessage });

      await apiClient.sendMessage(
        currentConversationId.current,
        text,
        userSettings.ai_voice_id || 'Joanna',
        'en-US',
        userSettings.mic_mode || 'voice_activity',
        userSettings.barge_in || 'balanced',
        !!userSettings.live_feedback_enabled,
        handleTextChunk,
        handleAudioChunk
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message.';
      dispatch({ type: 'SET_ERROR_MESSAGE', payload: errorMessage });
    } finally {
      if (state.isSessionActive) {
        dispatch({ type: 'SET_APP_STATUS', payload: 'listening' });
        speechManager.startListening(
          (transcript, isFinal) => {
            dispatch({ type: 'SET_TRANSCRIPT', payload: transcript });
            if (isFinal) {
              sendUserMessage(transcript);
            }
          },
          (error) => dispatch({ type: 'SET_ERROR_MESSAGE', payload: error }),
          () => { if (state.isSessionActive) dispatch({ type: 'SET_APP_STATUS', payload: 'listening' }); }
        );
      } else {
        dispatch({ type: 'SET_APP_STATUS', payload: 'idle' });
      }
    }
  }, [apiClient, dispatch, state.isSessionActive, userSettings, handleTextChunk, handleAudioChunk, speechManager]);

  const startSession = useCallback(() => {
    dispatch({ type: 'START_SESSION' });
    speechManager.startListening(
      (transcript, isFinal) => {
        dispatch({ type: 'SET_TRANSCRIPT', payload: transcript });
        if (isFinal) {
          sendUserMessage(transcript);
        }
      },
      (error) => dispatch({ type: 'SET_ERROR_MESSAGE', payload: error }),
      () => {
        if (state.isSessionActive) {
          dispatch({ type: 'SET_APP_STATUS', payload: 'listening' });
        }
      }
    );
  }, [dispatch, sendUserMessage, speechManager, state.isSessionActive]);

  const endSession = useCallback(() => {
    speechManager.stopListening();
    dispatch({ type: 'END_SESSION' });
  }, [dispatch, speechManager]);

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

  const clearConversation = useCallback(() => { dispatch({ type: 'CLEAR_CONVERSATION' }); }, [dispatch]);

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

  const sendTextMessage = useCallback(async (text: string) => {
    if (state.appStatus !== 'idle') return;
    await sendUserMessage(text);
  }, [state.appStatus, sendUserMessage]);

  const isTranscribing = state.appStatus === 'listening';

  return {
    ...state,
    isTranscribing,
    startSession,
    endSession,
    startAudioInput: startSession,
    stopAudioInput: endSession,
    sendTextMessage,
    clearConversation,
    downloadTranscript,
    clearError: () => dispatch({ type: 'SET_ERROR_MESSAGE', payload: null }),
  };
}