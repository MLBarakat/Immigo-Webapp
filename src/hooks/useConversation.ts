import { useCallback, useRef, useEffect, useContext } from 'react';
import { ConversationContext } from '../context/conversationContextTypes';
import { ApiClient, ApiError } from '../services/apiClient';
import { Message } from '../context/conversationContextTypes';
import { ChatPersistenceService } from '../services/chatPersistenceService';
import { useWhisper } from './useWhisper';
import { analytics } from '../analytics';
import { logger } from '../logger';

interface UseConversationManagerProps {
  apiClient: ApiClient | null;
  userId?: string | null;
}

export function useConversation({ apiClient, userId }: UseConversationManagerProps) {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  const { state: conversationState, dispatch } = context;
  const intervalRef = useRef<number | null>(null);
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const processedTranscriptRef = useRef<string>('');
  const sessionIdRef = useRef<string | null>(conversationState.sessionId);
  // Tracks which bank question the server last asked, so the next answer is
  // graded against the correct item (server-owned grounded grading).
  const currentItemIdRef = useRef<string | null>(null);
  // One-shot flag: set when the server asks the user to confirm/repeat an
  // answer or complete a multi-part one (turn-policy's needs_confirmation).
  // While set (and matching the current item), the next answer is sent as a
  // confirmation retry so the server commits the honest final verdict.
  const awaitingConfirmationRef = useRef<string | null>(null);
  // True while Polly audio is actively playing — used to mute the VAD so the
  // microphone does not pick up the speaker output and loop it back as input.
  const isPollyPlayingRef = useRef<boolean>(false);
  // Timer handle for the post-playback AEC settle window (clears on unmount).
  const pollyMuteGateTimerRef = useRef<number | null>(null);

  // Dual-Track Speculative Merger orchestration hook
  const {
    currentState,
    displayTranscript,
    finalTranscript,
    isModelLoading,
    isVadReady,
    modelLoadingProgress,
    isTranscribing,
    startRecording,
    stopRecording,
    clearTranscript
  } = useWhisper({
    onSpeechStart: () => {
      // If Polly is still inside the AEC mute-gate window, the VAD detected
      // Polly's own speaker output — suppress the callback entirely so we
      // don't interrupt or loop back the assistant's own voice.
      if (isPollyPlayingRef.current) return;

      const activePlayback = audioPlaybackRef.current;
      if (!activePlayback) return;
      activePlayback.pause();
      activePlayback.currentTime = 0;
      audioPlaybackRef.current = null;
      dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
    }
  });

  useEffect(() => {
    sessionIdRef.current = conversationState.sessionId;
  }, [conversationState.sessionId]);

  // Sync live interim transcript modifications to viewport UI
  useEffect(() => {
    dispatch({ type: 'SET_INTERIM_TRANSCRIPT', payload: displayTranscript });
  }, [displayTranscript, dispatch]);

  // Load initial chat history on mount or when userId changes
  useEffect(() => {
    if (!userId) return;

    let isMounted = true;
    ChatPersistenceService.loadRecentMessages(userId, 25).then(payload => {
      if (!isMounted) return;
      const formattedMessages: Message[] = payload.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.created_at,
      }));
      dispatch({
        type: 'LOAD_HISTORICAL_MESSAGES',
        payload: {
          messages: formattedMessages,
          hasMore: payload.hasMore,
          oldestCursor: payload.oldestCursor,
          replace: true
        }
      });
    }).catch(err => {
      logger.error('Failed to hydrate chat history:', undefined, { error: String(err) });
    });

    return () => {
      isMounted = false;
    };
  }, [userId, dispatch]);

  const loadOlderMessages = useCallback(async () => {
    if (!userId || !conversationState.oldestMessageCursor || !conversationState.hasMoreHistory) return;

    try {
      const payload = await ChatPersistenceService.loadOlderMessages(
        userId,
        conversationState.oldestMessageCursor,
        25
      );
      const formattedMessages: Message[] = payload.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.created_at,
      }));

      dispatch({
        type: 'LOAD_HISTORICAL_MESSAGES',
        payload: {
          messages: formattedMessages,
          hasMore: payload.hasMore,
          oldestCursor: payload.oldestCursor,
          replace: false
        }
      });
    } catch (err) {
      logger.error('Failed to load older messages:', undefined, { error: String(err) });
    }
  }, [userId, conversationState.oldestMessageCursor, conversationState.hasMoreHistory, dispatch]);

  const sendTextMessage = useCallback(async (text: string) => {
    const validatedText = text.replace(/\s+/g, ' ').trim();
    if (!validatedText) return;

    const traceId = `trace-id-${performance.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const secureUserMessageId = `user-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const secureAssistantMessageId = `asst-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (!apiClient) {
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
    const activeSessionId = sessionIdRef.current || conversationState.sessionId;

    dispatch({ type: 'SEND_MESSAGE_START', payload: { userMessage, assistantMessageId: secureAssistantMessageId } });
    dispatch({ type: 'SET_STATUS', payload: 'processing' });
    clearTranscript?.();

    // Persist User Message to Supabase
    if (userId && activeSessionId) {
      void ChatPersistenceService.persistMessage(
        activeSessionId,
        userId,
        'user',
        validatedText
      );
    }

    // Build 6-turn sliding window from recent conversation history
    const slidingWindow = conversationState.conversationHistory
      .slice(-6)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const maxRetryAttemptsCeiling = 3;
      let currentAttempt = 0;
      let accumulatedLastError: unknown = null;
      let responseText: string | null = null;
      let audioData: ArrayBuffer | null = null;
      let nextItemId: string | null = null;
      let needsConfirmation = false;

      // If we're mid-confirmation/mid-multi-part-answer on THIS item, tell the
      // server this is the follow-up turn so it commits a final verdict.
      const isConfirmationRetry = awaitingConfirmationRef.current !== null
        && awaitingConfirmationRef.current === currentItemIdRef.current;

      while (currentAttempt < maxRetryAttemptsCeiling) {
        try {
          currentAttempt++;
          const res = await apiClient.postTranscript(
            validatedText,
            slidingWindow,
            activeSessionId,
            currentItemIdRef.current,
            isConfirmationRetry,
            { headers: { 'x-correlation-trace-id': traceId } }
          );
          responseText = res.responseText;
          audioData = res.audioData;
          nextItemId = res.nextItemId;
          needsConfirmation = res.needsConfirmation;
          break;
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

      // Remember the question the server just asked; the NEXT answer is graded against it.
      currentItemIdRef.current = nextItemId;

      // Confirmation state machine (one-shot):
      //  - server asked to confirm/complete -> arm the retry flag for this item
      //  - otherwise                        -> clear it (the round is over)
      awaitingConfirmationRef.current = needsConfirmation ? nextItemId : null;

      dispatch({ type: 'RECEIVE_ASSISTANT_CHUNK', payload: { content: responseText } });

      // Persist Assistant Message to Supabase
      if (userId && activeSessionId) {
        void ChatPersistenceService.persistMessage(
          activeSessionId,
          userId,
          'assistant',
          responseText
        );
      }

      if (!conversationState.isSessionActive) {
        dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
        return;
      }

      const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
      const audioBlobUrl = URL.createObjectURL(audioBlob);
      const audioPlaybackNode = new Audio(audioBlobUrl);
      audioPlaybackRef.current = audioPlaybackNode;
      dispatch({ type: 'SET_STATUS', payload: 'speaking' });

      // Raise the Polly mute gate BEFORE playback starts so that any AEC
      // bleed-through during the first frames is suppressed.
      isPollyPlayingRef.current = true;
      if (pollyMuteGateTimerRef.current !== null) {
        window.clearTimeout(pollyMuteGateTimerRef.current);
        pollyMuteGateTimerRef.current = null;
      }

      audioPlaybackNode.play().catch((error: unknown) => {
        logger.error('Audio node hardware playback initialization failure exceptions handled:', undefined, { 
          errorMessage: error instanceof Error ? error.message : String(error),
          traceId
        });
        // Lower the mute gate immediately if playback failed.
        isPollyPlayingRef.current = false;
        dispatch({ 
          type: 'SEND_MESSAGE_FAILURE', 
          payload: { 
            error: 'Playback restriction handled. Browser container requests initial user interaction gesture anchors.', 
            userMessageId: secureUserMessageId,
            assistantMessageId: secureAssistantMessageId
          } 
        });
        audioPlaybackRef.current = null;
        startRecording();
      });

      audioPlaybackNode.onended = () => {
        dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
        audioPlaybackRef.current = null;
        URL.revokeObjectURL(audioBlobUrl);

        // Keep the mute gate active for a short debounce period after playback
        // ends so residual AEC / speaker-bleed frames are discarded before we
        // open the microphone for real user input.
        pollyMuteGateTimerRef.current = window.setTimeout(() => {
          isPollyPlayingRef.current = false;
          pollyMuteGateTimerRef.current = null;
          startRecording();
        }, 300); // 300 ms AEC settle window
      };

    } catch (error: unknown) {
      const parsedErrorMessage = error instanceof Error ? error.message : 'Failed to synchronize conversation transactions.';
      
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
        startRecording();
      }
    }
  }, [apiClient, userId, conversationState.sessionId, conversationState.conversationHistory, dispatch, startRecording, clearTranscript, conversationState.isSessionActive]);

  // Word-boundary comparison for live audio transcription handoff
  useEffect(() => {
    // A new recording starts with an empty committed transcript. Clear the
    // previous utterance baseline so the next utterance is sent in full.
    if (!finalTranscript.trim()) {
      processedTranscriptRef.current = '';
      return;
    }

    const historicalString = processedTranscriptRef.current.trim();
    const activeConfirmedString = finalTranscript.trim();

    if (activeConfirmedString && activeConfirmedString !== historicalString) {
      let freshUtteranceChunk = '';

      if (!historicalString) {
        freshUtteranceChunk = activeConfirmedString;
      } else if (activeConfirmedString.startsWith(historicalString)) {
        freshUtteranceChunk = activeConfirmedString.substring(historicalString.length).trim();
      } else {
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

  const initiateSession = useCallback(async () => {
    dispatch({ type: 'START_SESSION' });
    analytics.track('session_started');
    processedTranscriptRef.current = '';
    sessionIdRef.current = null;
    currentItemIdRef.current = null;
    awaitingConfirmationRef.current = null;

    let newSessionId: string | null = null;
    if (userId) {
      newSessionId = await ChatPersistenceService.createSession(userId);
      sessionIdRef.current = newSessionId;
      dispatch({ type: 'SET_SESSION_ID', payload: newSessionId });
    }

    // Item 6: proactively fetch the personalized greeting BEFORE recording
    // begins, instead of waiting for a (often garbled) first utterance to
    // implicitly trigger it. This also means currentItemIdRef is set from a
    // real server response before the mic ever opens for real user input —
    // the first answer is graded against the right question from the start.
    if (!apiClient) {
      startRecording();
      return;
    }

    const traceId = `trace-id-${performance.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const secureUserMessageId = `user-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const secureAssistantMessageId = `asst-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const res = await apiClient.postSessionStart(newSessionId, {
        headers: { 'x-correlation-trace-id': traceId },
      });

      currentItemIdRef.current = res.nextItemId;
      awaitingConfirmationRef.current = res.needsConfirmation ? res.nextItemId : null;

      // No real user utterance preceded this — an empty-content placeholder
      // keeps the existing SEND_MESSAGE_START contract (which always pairs a
      // user + assistant message) without inventing new reducer actions.
      const placeholderUserMessage: Message = {
        id: secureUserMessageId,
        role: 'user',
        content: '',
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: 'SEND_MESSAGE_START', payload: { userMessage: placeholderUserMessage, assistantMessageId: secureAssistantMessageId } });
      dispatch({ type: 'RECEIVE_ASSISTANT_CHUNK', payload: { content: res.responseText } });

      if (userId && newSessionId) {
        void ChatPersistenceService.persistMessage(newSessionId, userId, 'assistant', res.responseText);
      }

      // Same playback + AEC mute-gate + resume-recording sequencing as every
      // other assistant response, so the mic doesn't open until the greeting
      // audio has fully finished (plus the settle window).
      const audioBlob = new Blob([res.audioData], { type: 'audio/mpeg' });
      const audioBlobUrl = URL.createObjectURL(audioBlob);
      const audioPlaybackNode = new Audio(audioBlobUrl);
      audioPlaybackRef.current = audioPlaybackNode;
      dispatch({ type: 'SET_STATUS', payload: 'speaking' });

      isPollyPlayingRef.current = true;
      if (pollyMuteGateTimerRef.current !== null) {
        window.clearTimeout(pollyMuteGateTimerRef.current);
        pollyMuteGateTimerRef.current = null;
      }

      audioPlaybackNode.play().catch((error: unknown) => {
        logger.error('Greeting audio playback initialization failure:', undefined, {
          errorMessage: error instanceof Error ? error.message : String(error),
          traceId,
        });
        isPollyPlayingRef.current = false;
        audioPlaybackRef.current = null;
        startRecording();
      });

      audioPlaybackNode.onended = () => {
        dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
        audioPlaybackRef.current = null;
        URL.revokeObjectURL(audioBlobUrl);
        pollyMuteGateTimerRef.current = window.setTimeout(() => {
          isPollyPlayingRef.current = false;
          pollyMuteGateTimerRef.current = null;
          startRecording();
        }, 300);
      };
    } catch (error: unknown) {
      // Resilience: if the proactive greeting call fails for any reason, fall
      // back to the old behavior (start listening; the server's implicit
      // greeting-on-first-utterance path still covers this as a safety net).
      logger.error('Proactive session-start greeting failed; falling back to listen-first.', undefined, {
        error: error instanceof Error ? error.message : String(error),
        traceId,
      });
      startRecording();
    }
  }, [userId, dispatch, startRecording, apiClient]);

  const terminateSession = useCallback(async () => {
    stopRecording();
    const activeSessionId = sessionIdRef.current || conversationState.sessionId;
    dispatch({ type: 'END_SESSION' });
    sessionIdRef.current = null;
    currentItemIdRef.current = null;
    awaitingConfirmationRef.current = null;
    dispatch({ type: 'SET_SESSION_ID', payload: null });
    analytics.track('session_ended', { duration_seconds: conversationState.sessionTime });

    if (activeSessionId) {
      await ChatPersistenceService.closeSession(activeSessionId);
      if (apiClient) {
        void apiClient.completeSession(activeSessionId);
      }
    }
  }, [conversationState.sessionId, conversationState.sessionTime, apiClient, dispatch, stopRecording]);

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

  const stopRecordingRef = useRef(stopRecording);
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  useEffect(() => {
    return () => {
      stopRecordingRef.current();
      if (pollyMuteGateTimerRef.current !== null) {
        window.clearTimeout(pollyMuteGateTimerRef.current);
      }
    };
  }, []);

  const wipeConversationHistory = useCallback(() => {
    dispatch({ type: 'CLEAR_CONVERSATION' });
    analytics.track('conversation_cleared');
  }, [dispatch]);

  const exportTranscriptFile = useCallback(() => {
    const transcriptText = conversationState.conversationHistory
      .map((msg: Message) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');
      
    const textBlob = new Blob([transcriptText], { type: 'plain' });
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
    interimTranscript: displayTranscript,
    finalTranscript,
    isModelLoading,
    isVadReady,
    modelLoadingProgress,
    isTranscribing,
    startSession: initiateSession,
    endSession: terminateSession,
    sendTextMessage,
    loadOlderMessages,
    clearConversation: wipeConversationHistory,
    downloadTranscript: exportTranscriptFile,
    clearError: () => dispatch({ type: 'CLEAR_ERROR' }),
  };
}
