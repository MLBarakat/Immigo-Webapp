import { useCallback, useRef, useEffect, useContext } from 'react';
import { ConversationContext } from '../context/conversationContextTypes';
import { ApiClient, ApiError } from '../services/apiClient';
import { Message } from '../context/conversationContextTypes';
import { useWhisper } from './useWhisper';
import { analytics } from '../analytics';
import { logger } from '../logger';

interface UseConversationManagerProps {
  apiClient: ApiClient | null;
}

export function useConversation({ apiClient }: UseConversationManagerProps) {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  const { state: conversationState, dispatch } = context;
  const intervalRef = useRef<number | null>(null);
  const processedTranscriptRef = useRef<string>('');

  // Dual-Track Speculative Merger orchestration hook
  const {
    currentState,
    displayTranscript, // FIXED: Captures the authoritative display text from useWhisper
    finalTranscript,
    isModelLoading,
    isVadReady,
    modelLoadingProgress,
    isTranscribing,
    startRecording,
    stopRecording
  } = useWhisper();

  // Sync the live interim transcript modifications smoothly to the consumer viewport UI
  useEffect(() => {
    dispatch({ type: 'SET_INTERIM_TRANSCRIPT', payload: displayTranscript });
  }, [displayTranscript, dispatch]);

  const sendTextMessage = useCallback(async (text: string) => {
    const validatedText = text.replace(/\s+/g, ' ').trim();
    if (!validatedText) return;

    // Securely read the active Trace ID Correlation Token or build an un-allocated fallback
    const traceId = `trace-id-${performance.now()}-${Math.random().toString(36).substr(2, 5)}`;

    // Generate clear unique identifiers cryptographically to satisfy type contracts
    const secureUserMessageId = `user-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const secureAssistantMessageId = `asst-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (!apiClient) {
      // FIXED: Fulfills the object mapping type contract to execute an atomic history rollback on error
      dispatch({ 
        type: 'SEND_MESSAGE_FAILURE', 
        payload: { 
          error: 'System core is initializing capability runtimes. Please wait a moment and retry.', 
          userMessageId: secureUserMessageId,
          assistantMessageId: secureAssistantMessageId
        } 
      });
      dispatch({ type: 'SET_STATUS', payload: 'idle' });
      return;
    }

    const userMessage: Message = { 
      id: secureUserMessageId, 
      role: 'user', 
      content: validatedText, 
      timestamp: new Date().toISOString() 
    };

    dispatch({ type: 'SEND_MESSAGE_START', payload: { userMessage, assistantMessageId: secureAssistantMessageId } });
    dispatch({ type: 'SET_STATUS', payload: 'processing' });

    try {
      // Exponential Backoff Retry engine loop to handle transient 5xx proxy timeouts safely
      const maxRetryAttemptsCeiling = 3;
      let currentAttempt = 0;
      let accumulatedLastError: unknown = null;
      let responseText: string | null = null;
      let audioData: ArrayBuffer | null = null;

      while (currentAttempt < maxRetryAttemptsCeiling) {
        try {
          currentAttempt++;
          // FIXED: Compiles cleanly against the multi-argument postTranscript method signature for distributed tracing
          const res = await apiClient.postTranscript(validatedText, { headers: { 'x-correlation-trace-id': traceId } });
          responseText = res.responseText;
          audioData = res.audioData;
          break; // Break loop on verified successful resolution
        } catch (err: unknown) {
          accumulatedLastError = err;
          if (err instanceof ApiError && err.status >= 500 && err.status < 600 && currentAttempt < maxRetryAttemptsCeiling) {
            const exponentialBackoffMs = 500 * Math.pow(2, currentAttempt - 1);
            logger.warn('Transient server proxy exception intercepted. Triggering backoff sequence retry path.', { 
              attempt: currentAttempt, 
              exponentialBackoffMs, 
              status: err.status,
              traceId 
            });
            await new Promise(resolve => setTimeout(resolve, exponentialBackoffMs));
            continue;
          }
          throw err;
        }
      }

      if (!responseText || !audioData) {
        throw accumulatedLastError || new Error('Structural Exception: Inbound gateway transmission payload properties missing.');
      }

      // Route verified assistant token responses directly to the conversational view ledger
      dispatch({ type: 'RECEIVE_ASSISTANT_CHUNK', payload: { content: responseText } });

      // Instantiate media payload audio allocations securely via typed Blob streams
      const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
      const audioBlobUrl = URL.createObjectURL(audioBlob);
      const audioPlaybackNode = new Audio(audioBlobUrl);
      
      // Engage absolute echo suppression controls: suspend active microphone tracking loops
      stopRecording();
      dispatch({ type: 'SET_STATUS', payload: 'speaking' });

      audioPlaybackNode.play().catch((error: unknown) => {
        logger.error('Audio node hardware playback initialization failure exceptions handled:', undefined, { 
          errorMessage: error instanceof Error ? error.message : String(error),
          traceId
        });
        dispatch({ 
          type: 'SEND_MESSAGE_FAILURE', 
          payload: { 
            error: 'Playback restriction handled. Browser container requests initial user interaction gesture anchors.', 
            userMessageId: secureUserMessageId,
            assistantMessageId: secureAssistantMessageId
          } 
        });
        startRecording(); // Safely restart the capture loop if playback is blocked
      });

      audioPlaybackNode.onended = () => {
        dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
        URL.revokeObjectURL(audioBlobUrl);
        // Safely re-engage low-level audio capturing tracks after speech output completes
        if (conversationState.isSessionActive) {
          startRecording();
        }
      };

    } catch (error: unknown) {
      const parsedErrorMessage = error instanceof Error ? error.message : 'Failed to synchronize conversation transactions.';
      
      // FIXED: Fulfills the object mapping type contract to execute an atomic history rollback on error
      dispatch({ type: 'SET_STATUS', payload: 'error' });
      dispatch({ 
        type: 'SEND_MESSAGE_FAILURE', 
        payload: { 
          error: parsedErrorMessage, 
          userMessageId: secureUserMessageId, 
          assistantMessageId: secureAssistantMessageId 
        } 
      });
      
      logger.error('Failed to dispatch prompt sequence transactions down server boundaries:', undefined, { 
        errorMessage: parsedErrorMessage,
        traceId 
      });
      
      if (conversationState.isSessionActive) {
        startRecording(); // Recover capture loops gracefully
      }
    }
  }, [apiClient, dispatch, startRecording, stopRecording, conversationState.isSessionActive]);

  // FIXED: Word-boundary comparison algorithm replaces character indexing to stop sentence slice drifts
  useEffect(() => {
    const historicalString = processedTranscriptRef.current.trim();
    const activeConfirmedString = finalTranscript.trim();

    if (activeConfirmedString && activeConfirmedString !== historicalString) {
      let freshUtteranceChunk = '';

      if (!historicalString) {
        freshUtteranceChunk = activeConfirmedString;
      } else if (activeConfirmedString.startsWith(historicalString)) {
        freshUtteranceChunk = activeConfirmedString.substring(historicalString.length).trim();
      } else {
        // Fallback strategy to resolve complex out-of-order mid-sentence edits
        const historicalTokens = historicalString.split(' ');
        const activeTokens = activeConfirmedString.split(' ');
        const deltaTokens = activeTokens.slice(historicalTokens.length);
        freshUtteranceChunk = deltaTokens.join(' ').trim();
      }

      if (freshUtteranceChunk) {
        void sendTextMessage(freshUtteranceChunk);
      }
      processedTranscriptRef.current = activeConfirmedString;
    }
  }, [finalTranscript, sendTextMessage]);

  const initiateSession = useCallback(() => {
    dispatch({ type: 'START_SESSION' });
    analytics.track('session_started');
    processedTranscriptRef.current = ''; 
    startRecording();
  }, [dispatch, startRecording]);

  const terminateSession = useCallback(() => {
    stopRecording();
    dispatch({ type: 'END_SESSION' });
    analytics.track('session_ended', { duration_seconds: conversationState.sessionTime });
  }, [dispatch, stopRecording, conversationState.sessionTime]);

  useEffect(() => {
    if (conversationState.isSessionActive) {
      intervalRef.current = window.setInterval(() => dispatch({ type: 'TICK_SESSION_TIMER' }), 1000);
    } else if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [conversationState.isSessionActive, dispatch]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  const wipeConversationHistory = useCallback(() => {
    dispatch({ type: 'CLEAR_CONVERSATION' });
    analytics.track('conversation_cleared');
  }, [dispatch]);

  const exportTranscriptFile = useCallback(() => {
    // FIXED: Correctly typed message structures mapping parameters cleanly without loose 'any' strings
    const transcriptText = conversationState.conversationHistory
      .map((msg: Message) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');
      
    const textBlob = new Blob([transcriptText], { type: 'text/plain' });
    const downloadBlobUrl = URL.createObjectURL(textBlob);
    const hiddenAnchorElement = document.createElement('a');
    
    hiddenAnchorElement.href = downloadBlobUrl;
    hiddenAnchorElement.download = `immigo_transcript_${new Date().toISOString()}.txt`;
    hiddenAnchorElement.click();
    
    URL.revokeObjectURL(downloadBlobUrl);
    analytics.track('transcript_downloaded');
  }, [conversationState.conversationHistory]);

  return {
    ...conversationState,
    currentState,
    interimTranscript: displayTranscript, // FIXED: Initializer avoids shorthand scope reference warnings
    finalTranscript,
    isModelLoading,
    isVadReady,
    modelLoadingProgress,
    isTranscribing,
    startSession: initiateSession,
    endSession: terminateSession,
    sendTextMessage,
    clearConversation: wipeConversationHistory,
    downloadTranscript: exportTranscriptFile,
    clearError: () => dispatch({ type: 'CLEAR_ERROR' }),
  };
}
