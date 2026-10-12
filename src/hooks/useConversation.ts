import { useCallback, useRef, useEffect, useLayoutEffect, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConversationContext } from '../context/conversationContextTypes';
import { SimulationMode } from '../context/conversationContextTypes';
import { ApiClient, ApiError } from '../services/apiClient';
import { Message } from '../context/conversationContextTypes';
import { ChatPersistenceService } from '../services/chatPersistenceService';
import { fetchLiveSessionStats } from '../services/liveProgressService';
import { useWhisper } from './useWhisper';
import { analytics } from '../analytics';
import { logger } from '../logger';
import type { BargeIn } from '../types/settings';
import {
  getBargeInHoldDurationMs,
  hasEnoughBargeInSpeech,
  isExplicitBargeInCommand,
  isPlaybackEchoTranscript,
} from '../utils/bargeIn';

interface UseConversationManagerProps {
  apiClient: ApiClient | null;
  userId?: string | null;
  voiceId?: string | null;
  simulationMode?: SimulationMode;
  preferredLanguage?: string;
  bargeIn?: BargeIn;
}

interface AssistantReveal {
  words: string[];
  revealedWords: number;
  timerId: number;
  audioNode: HTMLAudioElement | null;
}

const SILENCE_NUDGE_DELAY_MS = 15_000;

export function useConversation({ apiClient, userId, voiceId, simulationMode = 'standard', preferredLanguage = 'en-US', bargeIn = 'balanced' }: UseConversationManagerProps) {
  const { t, i18n } = useTranslation('conversation');
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  const { state: conversationState, dispatch } = context;
  const [isGeneratingProgressReport, setIsGeneratingProgressReport] = useState(false);
  const pendingTranscriptClearRef = useRef(false);
  const voiceIdRef = useRef<string | null>(voiceId ?? null);
  const simulationModeRef = useRef<SimulationMode>(simulationMode);
  const preferredLanguageRef = useRef(preferredLanguage);
  const bargeInRef = useRef<BargeIn>(bargeIn);
  useEffect(() => {
    voiceIdRef.current = voiceId ?? null;
  }, [voiceId]);
  useEffect(() => {
    simulationModeRef.current = simulationMode;
  }, [simulationMode]);
  useEffect(() => {
    preferredLanguageRef.current = preferredLanguage;
  }, [preferredLanguage]);
  useEffect(() => {
    bargeInRef.current = bargeIn;
  }, [bargeIn]);

  const intervalRef = useRef<number | null>(null);
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const audioPlaybackUrlRef = useRef<string | null>(null);
  const audioPlaybackGenerationRef = useRef(0);
  const processedTranscriptRef = useRef<string>('');
  const activeTurnControllerRef = useRef<AbortController | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const turnGenerationRef = useRef(0);
  const sessionIdRef = useRef<string | null>(conversationState.sessionId);
  // Tracks which bank question the server last asked, so the next answer is
  // graded against the correct item (server-owned grounded grading).
  const currentItemIdRef = useRef<string | null>(null);
  const openingResponseRef = useRef(false);
  const hydratedHistoryUserIdRef = useRef<string | null>(null);
  const skipNextHistoryCacheWriteRef = useRef(false);
  const historyChangedBeforeHydrationRef = useRef(false);
  const historyClearedBeforeHydrationRef = useRef(false);
  const latestConversationHistoryRef = useRef(conversationState.conversationHistory);
  const voiceSessionRef = useRef(conversationState.isSessionActive);
  const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(conversationState.isSessionActive);
  // One-shot flag: set when the server asks the user to confirm/repeat an
  // answer or complete a multi-part one (turn-policy's needs_confirmation).
  // While set (and matching the current item), the next answer is sent as a
  // confirmation retry so the server commits the honest final verdict.
  const awaitingConfirmationRef = useRef<string | null>(null);
  // Counts GRADED turns this session, to trigger a periodic narrative-report
  // refresh every 10 answers (in addition to the session-end refresh) without
  // regenerating the expensive LLM narrative after every single question.
  const answeredCountRef = useRef<number>(0);
  // Guards the on-screen welcome banner fetch to exactly once per app load —
  // it is independent of starting/ending a practice session (no audio, no
  // recording side effects), so it must not re-fire on every render or on
  // every session start/end.
  const hasFetchedWelcomeBannerRef = useRef(false);
  // True while Polly audio is actively playing; paired with the playback node
  // to constrain interruption handling to audible assistant speech.
  const isPollyPlayingRef = useRef<boolean>(false);
  const isAssistantAudioActiveRef = useRef(false);
  // Timer handle for the post-playback AEC settle window (clears on unmount).
  const pollyMuteGateTimerRef = useRef<number | null>(null);
  const interruptionTimerRef = useRef<number | null>(null);
  const silenceNudgeTimerRef = useRef<number | null>(null);
  const silenceNudgeControllerRef = useRef<AbortController | null>(null);
  const hasSentSilenceNudgeRef = useRef(false);
  const activePollyTextRef = useRef('');
  const speechStartedDuringPollyRef = useRef(false);
  const assistantRevealRef = useRef<AssistantReveal | null>(null);

  const stopAssistantReveal = useCallback((complete = false) => {
    const reveal = assistantRevealRef.current;
    if (!reveal) return;
    window.clearInterval(reveal.timerId);
    if (complete && reveal.revealedWords < reveal.words.length) {
      dispatch({
        type: 'RECEIVE_ASSISTANT_CHUNK',
        payload: { content: ` ${reveal.words.slice(reveal.revealedWords).join(' ')}` },
      });
    }
    assistantRevealRef.current = null;
  }, [dispatch]);

  const startAssistantReveal = useCallback((messageId: string, content: string, audioNode: HTMLAudioElement | null = null) => {
    stopAssistantReveal();
    const words = content.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return;
    dispatch({
      type: 'ADD_ASSISTANT_MESSAGE',
      payload: { assistantMessageId: messageId, content: words[0] },
    });
    if (words.length === 1) {
      if (!audioNode) {
        dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
        if (activeAssistantMessageIdRef.current === messageId) activeAssistantMessageIdRef.current = null;
      }
      return;
    }

    const reveal: AssistantReveal = {
      words,
      revealedWords: 1,
      timerId: 0,
      audioNode,
    };
    reveal.timerId = window.setInterval(() => {
      if (assistantRevealRef.current !== reveal) return;
      let targetWordCount: number;
      if (reveal.audioNode) {
        const duration = reveal.audioNode.duration;
        if (!Number.isFinite(duration) || duration <= 0) return;
        targetWordCount = Math.min(
          words.length,
          Math.max(1, Math.floor((reveal.audioNode.currentTime / duration) * words.length) + 1)
        );
      } else {
        targetWordCount = reveal.revealedWords + 1;
      }
      if (targetWordCount > reveal.revealedWords) {
        dispatch({
          type: 'RECEIVE_ASSISTANT_CHUNK',
          payload: { content: ` ${words.slice(reveal.revealedWords, targetWordCount).join(' ')}` },
        });
        reveal.revealedWords = targetWordCount;
      }
      if (!audioNode && reveal.revealedWords >= words.length) {
        stopAssistantReveal();
        dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
        if (activeAssistantMessageIdRef.current === messageId) activeAssistantMessageIdRef.current = null;
      }
    }, audioNode ? 50 : 80);
    assistantRevealRef.current = reveal;
  }, [dispatch, stopAssistantReveal]);

  const clearAudioPlayback = useCallback(() => {
    audioPlaybackGenerationRef.current += 1;
    stopAssistantReveal();
    if (interruptionTimerRef.current !== null) {
      window.clearTimeout(interruptionTimerRef.current);
      interruptionTimerRef.current = null;
    }

    if (pollyMuteGateTimerRef.current !== null) {
      window.clearTimeout(pollyMuteGateTimerRef.current);
      pollyMuteGateTimerRef.current = null;
    }

    const audioPlayback = audioPlaybackRef.current;
    if (audioPlayback) {
      audioPlayback.onended = null;
      audioPlayback.onerror = null;
      audioPlayback.pause();
      audioPlayback.currentTime = 0;
    }
    audioPlaybackRef.current = null;

    if (audioPlaybackUrlRef.current) {
      URL.revokeObjectURL(audioPlaybackUrlRef.current);
      audioPlaybackUrlRef.current = null;
    }

    isPollyPlayingRef.current = false;
    isAssistantAudioActiveRef.current = false;
  }, [stopAssistantReveal]);

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
      speechStartedDuringPollyRef.current = isAssistantAudioActiveRef.current;
    },
  });

  useEffect(() => {
    sessionIdRef.current = conversationState.sessionId;
  }, [conversationState.sessionId]);
  useLayoutEffect(() => {
    latestConversationHistoryRef.current = conversationState.conversationHistory;
  }, [conversationState.conversationHistory]);

  // Sync live interim transcript modifications to viewport UI
  useEffect(() => {
    const transcript = displayTranscript.trim();
    if (pendingTranscriptClearRef.current) {
      if (!transcript) pendingTranscriptClearRef.current = false;
      return;
    }
    dispatch({ type: 'SET_INTERIM_TRANSCRIPT', payload: displayTranscript });
  }, [displayTranscript, dispatch]);

  useEffect(() => {
    const activePlayback = audioPlaybackRef.current;
    const recognizedSpeech = displayTranscript.trim();
    if (!activePlayback || !isAssistantAudioActiveRef.current || !recognizedSpeech) return;

    if (!hasEnoughBargeInSpeech(recognizedSpeech)) return;
    if (!isExplicitBargeInCommand(recognizedSpeech)
      && isPlaybackEchoTranscript(recognizedSpeech, activePollyTextRef.current)) {
      if (interruptionTimerRef.current !== null) {
        window.clearTimeout(interruptionTimerRef.current);
        interruptionTimerRef.current = null;
      }
      return;
    }

    if (interruptionTimerRef.current !== null) return;
    interruptionTimerRef.current = window.setTimeout(() => {
      interruptionTimerRef.current = null;
      if (audioPlaybackRef.current !== activePlayback || !isAssistantAudioActiveRef.current) return;
      clearAudioPlayback();
      dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
    }, getBargeInHoldDurationMs(bargeInRef.current));
  }, [displayTranscript, dispatch, clearAudioPlayback]);

  // Restore this tab's latest conversation immediately; fetch the database
  // history when no local snapshot exists, or to retain its pagination cursor.
  useLayoutEffect(() => {
    hydratedHistoryUserIdRef.current = null;
    if (!userId) return;

    let isMounted = true;
    const cacheKey = `immigo_conversation_${userId}`;
    let cachedMessages: Message[] | null = null;
    try {
      const stored = sessionStorage.getItem(cacheKey);
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.every((entry): entry is Message =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof entry.id === 'string' &&
          (entry.role === 'user' || entry.role === 'assistant') &&
          typeof entry.content === 'string' &&
          typeof entry.timestamp === 'string'
        )) {
          cachedMessages = parsed.slice(-100);
        } else {
          logger.warn('Ignoring invalid per-tab conversation cache.', { userId });
        }
      }
    } catch (error: unknown) {
      logger.error('Failed to read per-tab conversation cache.', undefined, {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (cachedMessages !== null) {
      skipNextHistoryCacheWriteRef.current = true;
      dispatch({
        type: 'LOAD_HISTORICAL_MESSAGES',
        payload: { messages: cachedMessages, hasMore: false, oldestCursor: null, replace: true },
      });
    }
    hydratedHistoryUserIdRef.current = userId;

    void ChatPersistenceService.loadRecentMessages(userId, 25).then(payload => {
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
          messages: cachedMessages !== null || historyClearedBeforeHydrationRef.current
            ? []
            : formattedMessages,
          hasMore: payload.hasMore,
          oldestCursor: payload.oldestCursor,
          replace: cachedMessages === null && !historyChangedBeforeHydrationRef.current
        }
      });
    }).catch(err => {
      logger.error('Failed to hydrate chat history:', undefined, { error: String(err) });
    });

    return () => {
      isMounted = false;
    };
  }, [userId, dispatch]);

  useEffect(() => {
    if (!userId || hydratedHistoryUserIdRef.current !== userId) return;
    if (skipNextHistoryCacheWriteRef.current) {
      skipNextHistoryCacheWriteRef.current = false;
      return;
    }
    try {
      sessionStorage.setItem(
        `immigo_conversation_${userId}`,
        JSON.stringify(conversationState.conversationHistory.slice(-100))
      );
    } catch (error: unknown) {
      logger.error('Failed to persist per-tab conversation cache.', undefined, {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [conversationState.conversationHistory, userId]);

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

  const generatePeriodicProgressReport = useCallback(async (activeSessionId: string) => {
    if (!apiClient) return;
    setIsGeneratingProgressReport(true);
    try {
      const { date, reportMarkdown } = await apiClient.completeSession(activeSessionId);
      if (!reportMarkdown.trim()) {
        throw new Error('The report service completed without returning a progress report.');
      }
      const reportDate = new Date(`${date}T00:00:00`).toLocaleDateString(i18n.language);
      dispatch({
        type: 'ADD_STANDALONE_ASSISTANT_MESSAGE',
        payload: {
          assistantMessageId: `progress-report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          content: `Your progress report for ${reportDate} is ready.\n\n${reportMarkdown}`,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Periodic progress report generation failed.', undefined, {
        sessionId: activeSessionId,
        error: message,
      });
      dispatch({
        type: 'ADD_STANDALONE_ASSISTANT_MESSAGE',
        payload: {
          assistantMessageId: `progress-report-error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          content: 'I could not generate your progress report right now. Your session is still active; I will try again when it ends.',
        },
      });
    } finally {
      setIsGeneratingProgressReport(false);
    }
  }, [apiClient, dispatch, i18n.language]);

  const sendTextMessage = useCallback(async (text: string) => {
    const validatedText = text.replace(/\s+/g, ' ').trim();
    if (!validatedText) return;
    pendingTranscriptClearRef.current = true;
    const isOpeningResponse = openingResponseRef.current;
    openingResponseRef.current = false;
    silenceNudgeControllerRef.current?.abort();
    silenceNudgeControllerRef.current = null;
    if (silenceNudgeTimerRef.current !== null) {
      window.clearTimeout(silenceNudgeTimerRef.current);
      silenceNudgeTimerRef.current = null;
    }
    hasSentSilenceNudgeRef.current = false;
    historyChangedBeforeHydrationRef.current = true;

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

    if (activeTurnControllerRef.current) {
      activeTurnControllerRef.current.abort();
      if (activeAssistantMessageIdRef.current) {
        dispatch({
          type: 'REMOVE_PENDING_ASSISTANT_MESSAGE',
          payload: { assistantMessageId: activeAssistantMessageIdRef.current },
        });
      }
    }
    const turnController = new AbortController();
    activeTurnControllerRef.current = turnController;
    const turnGeneration = ++turnGenerationRef.current;
    activeAssistantMessageIdRef.current = secureAssistantMessageId;

    const userMessage: Message = { 
      id: secureUserMessageId, 
      role: 'user', 
      content: validatedText, 
      timestamp: new Date().toISOString() 
    };
    let activeSessionId = sessionIdRef.current || conversationState.sessionId;
    if (!activeSessionId && userId && !voiceSessionRef.current) {
      activeSessionId = await ChatPersistenceService.createSession(userId);
      if (turnGeneration !== turnGenerationRef.current) return;
      if (activeSessionId) {
        sessionIdRef.current = activeSessionId;
        dispatch({ type: 'SET_SESSION_ID', payload: activeSessionId });
        analytics.track('session_started', { mode: 'text' });
      }
    }

    if (conversationState.isSessionActive) stopRecording();
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
      .filter(m => !m.id.startsWith('progress-report-'))
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
      let verdict: 'correct' | 'incorrect' | 'partial' | null = null;

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
              { headers: { 'x-correlation-trace-id': traceId }, signal: turnController.signal, voiceId: voiceIdRef.current ?? undefined, simulationMode: simulationModeRef.current, preferredLanguage: preferredLanguageRef.current, openingResponse: isOpeningResponse }
          );
          responseText = res.responseText;
          audioData = res.audioData;
          nextItemId = res.nextItemId;
          needsConfirmation = res.needsConfirmation;
          verdict = res.verdict;
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
      if (turnGeneration !== turnGenerationRef.current) return;

      // Remember the question the server just asked; the NEXT answer is graded against it.
      currentItemIdRef.current = nextItemId;

      // Confirmation state machine (one-shot):
      //  - server asked to confirm/complete -> arm the retry flag for this item
      //  - otherwise                        -> clear it (the round is over)
      awaitingConfirmationRef.current = needsConfirmation ? nextItemId : null;

      // A grade was actually committed (not a repeat/hint/clarify/near-miss
      // turn) -> refresh the free, real-time stats, and every 10th committed
      // answer, also refresh the (expensive) narrative report mid-session so
      // it doesn't go stale for the whole session, without regenerating it
      // after every single question.
      if (verdict !== null) {
        answeredCountRef.current += 1;
        if (activeSessionId) {
          void fetchLiveSessionStats(activeSessionId).then((stats) => {
            if (stats) dispatch({ type: 'SET_LIVE_STATS', payload: stats });
          });
        }
        if (answeredCountRef.current % 10 === 0) {
          if (activeSessionId) {
            void generatePeriodicProgressReport(activeSessionId);
          } else {
            dispatch({
              type: 'ADD_STANDALONE_ASSISTANT_MESSAGE',
              payload: {
                assistantMessageId: `progress-report-error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                content: 'I could not save your progress report because this session is not linked to a saved account session.',
              },
            });
          }
        }
      }

      // Persist Assistant Message to Supabase
      if (userId && activeSessionId) {
        void ChatPersistenceService.persistMessage(
          activeSessionId,
          userId,
          'assistant',
          responseText
        );
      }

      if (!conversationState.isSessionActive || !voiceSessionRef.current) {
        dispatch({ type: 'SET_STATUS', payload: 'speaking' });
        startAssistantReveal(secureAssistantMessageId, responseText);
        activeTurnControllerRef.current = null;
        activeAssistantMessageIdRef.current = null;
        return;
      }

      const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
      const audioBlobUrl = URL.createObjectURL(audioBlob);
      const audioPlaybackNode = new Audio(audioBlobUrl);
      const playbackGeneration = ++audioPlaybackGenerationRef.current;
      audioPlaybackRef.current = audioPlaybackNode;
      audioPlaybackUrlRef.current = audioBlobUrl;
      activePollyTextRef.current = responseText;
      dispatch({ type: 'SET_STATUS', payload: 'speaking' });
      startAssistantReveal(secureAssistantMessageId, responseText, audioPlaybackNode);

      // Keep capture active during playback so VAD can recognize a real
      // interruption; browser echo cancellation and the barge-in holdoff
      // suppress speaker bleed.
      isPollyPlayingRef.current = true;
      isAssistantAudioActiveRef.current = true;
      startRecording();
      if (pollyMuteGateTimerRef.current !== null) {
        window.clearTimeout(pollyMuteGateTimerRef.current);
        pollyMuteGateTimerRef.current = null;
      }

      audioPlaybackNode.play().catch((error: unknown) => {
        if (playbackGeneration !== audioPlaybackGenerationRef.current) return;
        logger.error('Audio node hardware playback initialization failure exceptions handled:', undefined, { 
          errorMessage: error instanceof Error ? error.message : String(error),
          traceId
        });
        // Lower the mute gate immediately if playback failed.
        clearAudioPlayback();
        dispatch({ 
          type: 'SEND_MESSAGE_FAILURE', 
          payload: { 
            error: 'Playback restriction handled. Browser container requests initial user interaction gesture anchors.', 
            userMessageId: secureUserMessageId,
            assistantMessageId: secureAssistantMessageId
          } 
        });
        startRecording();
      });

      audioPlaybackNode.onended = () => {
        if (playbackGeneration !== audioPlaybackGenerationRef.current) return;
        isAssistantAudioActiveRef.current = false;
        stopAssistantReveal(true);
        dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
        clearAudioPlayback();

        // Keep the mute gate active for a short debounce period after playback
        // ends so residual AEC / speaker-bleed frames are discarded before we
        // open the microphone for real user input.
        pollyMuteGateTimerRef.current = window.setTimeout(() => {
          isPollyPlayingRef.current = false;
          pollyMuteGateTimerRef.current = null;
        }, 300); // 300 ms AEC settle window
      };
      activeTurnControllerRef.current = null;
      activeAssistantMessageIdRef.current = null;

    } catch (error: unknown) {
      if (turnController.signal.aborted || turnGeneration !== turnGenerationRef.current) return;
      if (isOpeningResponse) openingResponseRef.current = true;
      activeAssistantMessageIdRef.current = null;
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
      
      if (conversationState.isSessionActive && voiceSessionRef.current) {
        startRecording();
      }
    } finally {
      if (activeTurnControllerRef.current === turnController) {
        activeTurnControllerRef.current = null;
      }
    }
  }, [apiClient, userId, conversationState.sessionId, conversationState.conversationHistory, dispatch, startRecording, stopRecording, clearTranscript, clearAudioPlayback, conversationState.isSessionActive, startAssistantReveal, stopAssistantReveal, generatePeriodicProgressReport]);

  const requestSilenceNudge = useCallback(async () => {
    const currentItemId = currentItemIdRef.current;
    const activeSessionId = sessionIdRef.current || conversationState.sessionId;
    if (!apiClient || !currentItemId || !voiceSessionRef.current) return;

    const traceId = `trace-id-${performance.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const assistantMessageId = `asst-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const controller = new AbortController();
    silenceNudgeControllerRef.current = controller;
    try {
      const response = await apiClient.postSilenceNudge(activeSessionId, currentItemId, {
        headers: { 'x-correlation-trace-id': traceId },
        signal: controller.signal,
        voiceId: voiceIdRef.current ?? undefined,
        simulationMode: simulationModeRef.current,
        preferredLanguage: preferredLanguageRef.current,
      });
      if (controller.signal.aborted) return;
      if (!voiceSessionRef.current || !response.responseText || response.audioData.byteLength === 0) return;

      openingResponseRef.current = false;
      currentItemIdRef.current = response.nextItemId ?? currentItemId;
      if (userId && activeSessionId) {
        void ChatPersistenceService.persistMessage(activeSessionId, userId, 'assistant', response.responseText);
      }

      const audioUrl = URL.createObjectURL(new Blob([response.audioData], { type: 'audio/mpeg' }));
      const audioNode = new Audio(audioUrl);
      const playbackGeneration = ++audioPlaybackGenerationRef.current;
      audioPlaybackRef.current = audioNode;
      audioPlaybackUrlRef.current = audioUrl;
      activePollyTextRef.current = response.responseText;
      dispatch({ type: 'SET_STATUS', payload: 'speaking' });
      startAssistantReveal(assistantMessageId, response.responseText, audioNode);
      isPollyPlayingRef.current = true;
      isAssistantAudioActiveRef.current = true;
      startRecording();
      audioNode.onended = () => {
        if (playbackGeneration !== audioPlaybackGenerationRef.current) return;
        isAssistantAudioActiveRef.current = false;
        stopAssistantReveal(true);
        dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
        clearAudioPlayback();
        pollyMuteGateTimerRef.current = window.setTimeout(() => {
          isPollyPlayingRef.current = false;
          pollyMuteGateTimerRef.current = null;
        }, 300);
      };
      audioNode.play().catch((error: unknown) => {
        if (playbackGeneration !== audioPlaybackGenerationRef.current) return;
        logger.error('Silence reminder audio playback failed.', undefined, {
          error: error instanceof Error ? error.message : String(error),
          traceId,
        });
        clearAudioPlayback();
        dispatch({ type: 'SET_STATUS', payload: 'listening' });
        startRecording();
      });
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      logger.error('Unable to return the conversation to its current question after silence.', undefined, {
        error: error instanceof Error ? error.message : String(error),
        traceId,
      });
      if (voiceSessionRef.current) dispatch({ type: 'SET_STATUS', payload: 'error' });
    } finally {
      if (silenceNudgeControllerRef.current === controller) silenceNudgeControllerRef.current = null;
    }
  }, [apiClient, conversationState.sessionId, userId, dispatch, startAssistantReveal, stopAssistantReveal, startRecording, clearAudioPlayback]);

  useEffect(() => {
    if (displayTranscript.trim()) {
      silenceNudgeControllerRef.current?.abort();
      silenceNudgeControllerRef.current = null;
      hasSentSilenceNudgeRef.current = false;
      return;
    }
    if (!conversationState.isSessionActive
      || !isVoiceSessionActive
      || !currentItemIdRef.current
      || conversationState.appStatus === 'processing'
      || conversationState.appStatus === 'speaking'
      || conversationState.appStatus === 'error'
      || hasSentSilenceNudgeRef.current) {
      if (silenceNudgeTimerRef.current !== null) {
        window.clearTimeout(silenceNudgeTimerRef.current);
        silenceNudgeTimerRef.current = null;
      }
      return;
    }

    silenceNudgeTimerRef.current = window.setTimeout(() => {
      silenceNudgeTimerRef.current = null;
      hasSentSilenceNudgeRef.current = true;
      void requestSilenceNudge();
    }, SILENCE_NUDGE_DELAY_MS);

    return () => {
      if (silenceNudgeTimerRef.current !== null) {
        window.clearTimeout(silenceNudgeTimerRef.current);
        silenceNudgeTimerRef.current = null;
      }
    };
  }, [conversationState.isSessionActive, conversationState.appStatus, isVoiceSessionActive, displayTranscript, requestSilenceNudge]);

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
        const isEchoFromPlayback = speechStartedDuringPollyRef.current
          && !isExplicitBargeInCommand(freshUtteranceChunk)
          && isPlaybackEchoTranscript(freshUtteranceChunk, activePollyTextRef.current);
        speechStartedDuringPollyRef.current = false;
        if (!isEchoFromPlayback) void sendTextMessage(freshUtteranceChunk);
      }
      processedTranscriptRef.current = activeConfirmedString;
    }
  }, [finalTranscript, sendTextMessage]);

  const initiateSession = useCallback(async () => {
    historyChangedBeforeHydrationRef.current = true;
    const existingSessionId = sessionIdRef.current || conversationState.sessionId;
    const continuingTextSession = Boolean(existingSessionId && !conversationState.isSessionActive);
    voiceSessionRef.current = true;
    setIsVoiceSessionActive(true);
    dispatch({ type: 'START_SESSION' });
    if (!continuingTextSession) analytics.track('session_started', { mode: 'voice' });
    processedTranscriptRef.current = '';
    pendingTranscriptClearRef.current = false;
    if (!continuingTextSession) {
      sessionIdRef.current = null;
      currentItemIdRef.current = null;
      awaitingConfirmationRef.current = null;
      answeredCountRef.current = 0;
      openingResponseRef.current = true;
    }

    let newSessionId: string | null = existingSessionId;
    if (!newSessionId && userId) {
      newSessionId = await ChatPersistenceService.createSession(userId);
      if (!voiceSessionRef.current) {
        if (newSessionId) {
          await ChatPersistenceService.closeSession(newSessionId).catch((error: unknown) => {
            logger.error('Closing a session that was paused during startup failed.', undefined, {
              sessionId: newSessionId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
        return;
      }
      sessionIdRef.current = newSessionId;
      dispatch({ type: 'SET_SESSION_ID', payload: newSessionId });
    }

    if (continuingTextSession && currentItemIdRef.current) {
      dispatch({ type: 'SET_STATUS', payload: 'listening' });
      startRecording();
      return;
    }

    // Select the current question before opening the microphone, but leave
    // the first response to the user rather than speaking another opener.
    if (!apiClient) {
      startRecording();
      return;
    }

    const traceId = `trace-id-${performance.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const secureAssistantMessageId = `asst-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // One quick retry before giving up: the single most common cause of a
    // sessionStart failure is a brand-new account hitting a transient,
    // self-resolving race (cold Lambda start, freshly-inserted rows that RLS/
    // triggers are still catching up on) — a short retry fixes the majority
    // of these without ever reaching the fallback path below.
    const attemptSessionStart = async () => {
      const sessionOptions = {
        headers: { 'x-correlation-trace-id': traceId },
        voiceId: voiceIdRef.current ?? undefined,
        simulationMode: simulationModeRef.current,
        preferredLanguage: preferredLanguageRef.current,
      };
      try {
        return await apiClient!.postSessionStart(newSessionId, sessionOptions);
      } catch (firstError) {
        logger.warn('postSessionStart failed once; retrying shortly.', { error: String(firstError), traceId });
        await new Promise((resolve) => setTimeout(resolve, 800));
        return await apiClient!.postSessionStart(newSessionId, sessionOptions);
      }
    };

    try {
      const res = await attemptSessionStart();
      if (!voiceSessionRef.current) return;

      currentItemIdRef.current = res.nextItemId;
      awaitingConfirmationRef.current = res.needsConfirmation ? res.nextItemId : null;

      if (!res.responseText && res.audioData.byteLength === 0) {
        dispatch({ type: 'SET_STATUS', payload: 'listening' });
        startRecording();
        return;
      }

      if (userId && newSessionId) {
        void ChatPersistenceService.persistMessage(newSessionId, userId, 'assistant', res.responseText);
      }

      // Keep capture active during playback for barge-in. The assistant bubble
      // is created with its first word only after the response is ready.
      const audioBlob = new Blob([res.audioData], { type: 'audio/mpeg' });
      const audioBlobUrl = URL.createObjectURL(audioBlob);
      const audioPlaybackNode = new Audio(audioBlobUrl);
      const playbackGeneration = ++audioPlaybackGenerationRef.current;
      audioPlaybackRef.current = audioPlaybackNode;
      audioPlaybackUrlRef.current = audioBlobUrl;
      activePollyTextRef.current = res.responseText;
      dispatch({ type: 'SET_STATUS', payload: 'speaking' });
      activeAssistantMessageIdRef.current = secureAssistantMessageId;
      startAssistantReveal(secureAssistantMessageId, res.responseText, audioPlaybackNode);

      isPollyPlayingRef.current = true;
      isAssistantAudioActiveRef.current = true;
      startRecording();
      if (pollyMuteGateTimerRef.current !== null) {
        window.clearTimeout(pollyMuteGateTimerRef.current);
        pollyMuteGateTimerRef.current = null;
      }

      audioPlaybackNode.play().catch((error: unknown) => {
        if (playbackGeneration !== audioPlaybackGenerationRef.current) return;
        logger.error('Greeting audio playback initialization failure:', undefined, {
          errorMessage: error instanceof Error ? error.message : String(error),
          traceId,
        });
        clearAudioPlayback();
        startRecording();
      });

      audioPlaybackNode.onended = () => {
        if (playbackGeneration !== audioPlaybackGenerationRef.current) return;
        isAssistantAudioActiveRef.current = false;
        stopAssistantReveal(true);
        dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
        clearAudioPlayback();
        pollyMuteGateTimerRef.current = window.setTimeout(() => {
          isPollyPlayingRef.current = false;
          pollyMuteGateTimerRef.current = null;
        }, 300);
      };
    } catch (error: unknown) {
      if (!voiceSessionRef.current) return;
      logger.error('Silent session question setup failed after retry; continuing to listen without a startup response.', undefined, {
        error: error instanceof Error ? error.message : String(error),
        traceId,
      });
      dispatch({ type: 'SET_STATUS', payload: 'listening' });
      startRecording();
    }
  }, [userId, conversationState.sessionId, conversationState.isSessionActive, dispatch, startRecording, apiClient, clearAudioPlayback, startAssistantReveal, stopAssistantReveal]);

  const terminateSession = useCallback(async () => {
    if (silenceNudgeTimerRef.current !== null) {
      window.clearTimeout(silenceNudgeTimerRef.current);
      silenceNudgeTimerRef.current = null;
    }
    silenceNudgeControllerRef.current?.abort();
    silenceNudgeControllerRef.current = null;
    activeTurnControllerRef.current?.abort();
    activeTurnControllerRef.current = null;
    if (activeAssistantMessageIdRef.current) {
      dispatch({
        type: 'REMOVE_PENDING_ASSISTANT_MESSAGE',
        payload: { assistantMessageId: activeAssistantMessageIdRef.current },
      });
      activeAssistantMessageIdRef.current = null;
    }
    clearAudioPlayback();
    stopRecording();
    const activeSessionId = sessionIdRef.current || conversationState.sessionId;
    if (activeSessionId) setIsGeneratingProgressReport(true);
    dispatch({ type: 'END_SESSION' });
    pendingTranscriptClearRef.current = false;
    sessionIdRef.current = null;
    currentItemIdRef.current = null;
    openingResponseRef.current = false;
    voiceSessionRef.current = false;
    setIsVoiceSessionActive(false);
    awaitingConfirmationRef.current = null;
    answeredCountRef.current = 0;
    dispatch({ type: 'SET_SESSION_ID', payload: null });
    analytics.track('session_ended', { duration_seconds: conversationState.sessionTime, mode: 'voice' });

    if (activeSessionId) {
      try {
        await ChatPersistenceService.closeSession(activeSessionId);
      } catch (error: unknown) {
        logger.error('Closing the interview session failed.', undefined, {
          sessionId: activeSessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      try {
        if (apiClient) await apiClient.completeSession(activeSessionId);
      } catch (error: unknown) {
          logger.error('Session progress report request failed.', undefined, {
            sessionId: activeSessionId,
            error: error instanceof Error ? error.message : String(error),
          });
      } finally {
        setIsGeneratingProgressReport(false);
      }
    }
  }, [conversationState.sessionId, conversationState.sessionTime, apiClient, dispatch, stopRecording, clearAudioPlayback]);

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

  // On-screen welcome banner (TEXT ONLY, never spoken): fetched once when the
  // app loads, independent of tapping "Start Session". Displayed as a plain
  // chat message — no audio, no mute-gate, no recording side effects at all.
  // No paired user message: this is the very first thing in the conversation,
  // so there must be nothing (not even an empty bubble) before it.
  useEffect(() => {
    if (!apiClient || !userId || hasFetchedWelcomeBannerRef.current || conversationState.conversationHistory.length > 0) return;
    hasFetchedWelcomeBannerRef.current = true;

    void (async () => {
      try {
        const { message } = await apiClient.fetchWelcomeBanner();
        if (latestConversationHistoryRef.current.length > 0) return;
        const assistantMessageId = `asst-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessageId, content: message } });
      } catch (error: unknown) {
        // Non-fatal: the welcome banner is a nice-to-have, not required to
        // start practicing. Log and move on; no user-facing error needed.
        logger.error('Welcome banner fetch failed (non-fatal).', undefined, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, [apiClient, userId, dispatch, conversationState.conversationHistory.length]);

  const stopRecordingRef = useRef(stopRecording);
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  useEffect(() => {
    return () => {
      if (silenceNudgeTimerRef.current !== null) window.clearTimeout(silenceNudgeTimerRef.current);
      silenceNudgeControllerRef.current?.abort();
      clearAudioPlayback();
      stopRecordingRef.current();
    };
  }, [clearAudioPlayback]);

  const wipeConversationHistory = useCallback(async () => {
    historyChangedBeforeHydrationRef.current = true;
    historyClearedBeforeHydrationRef.current = true;
    const activeSessionId = sessionIdRef.current || conversationState.sessionId;
    if (activeSessionId) setIsGeneratingProgressReport(true);
    if (conversationState.isSessionActive) {
      clearAudioPlayback();
      stopRecording();
      dispatch({ type: 'END_SESSION' });
    }
    if (activeSessionId && !conversationState.isSessionActive) {
      analytics.track('session_ended', { mode: 'text' });
    }

    pendingTranscriptClearRef.current = false;
    sessionIdRef.current = null;
    currentItemIdRef.current = null;
    openingResponseRef.current = false;
    voiceSessionRef.current = false;
    setIsVoiceSessionActive(false);
    awaitingConfirmationRef.current = null;
    answeredCountRef.current = 0;
    dispatch({ type: 'SET_SESSION_ID', payload: null });
    dispatch({ type: 'CLEAR_CONVERSATION' });
    analytics.track('conversation_cleared');
    if (activeSessionId) {
      try {
        await ChatPersistenceService.closeSession(activeSessionId);
      } catch (error: unknown) {
        logger.error('Closing the interview session after clearing failed.', undefined, {
          sessionId: activeSessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      try {
        if (apiClient) await apiClient.completeSession(activeSessionId);
      } catch (error: unknown) {
        logger.error('Session report generation after clearing failed.', undefined, {
          sessionId: activeSessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsGeneratingProgressReport(false);
      }
    }
  }, [conversationState.isSessionActive, conversationState.sessionId, clearAudioPlayback, stopRecording, apiClient, dispatch]);

  const exportTranscriptFile = useCallback(() => {
    const exportedAt = new Date();
    const transcriptText = [
      t('workspace.transcript.title'),
      `${t('workspace.transcript.sessionId')}: ${conversationState.sessionId ?? t('workspace.transcript.notAssigned')}`,
      `${t('workspace.transcript.duration')}: ${Math.floor(conversationState.sessionTime / 60).toString().padStart(2, '0')}:${(conversationState.sessionTime % 60).toString().padStart(2, '0')}`,
      `${t('workspace.transcript.exported')}: ${exportedAt.toLocaleString(i18n.language)}`,
      '',
      ...conversationState.conversationHistory.map((msg: Message) => {
        const speaker = t(msg.role === 'assistant' ? 'workspace.transcript.officer' : 'workspace.transcript.user');
        return `[${new Date(msg.timestamp).toLocaleString(i18n.language)}] ${speaker}:\n${msg.content}`;
      }),
    ].join('\n\n');

    const textBlob = new Blob([transcriptText], { type: 'text/plain;charset=utf-8' });
    const downloadBlobUrl = URL.createObjectURL(textBlob);
    const hiddenAnchorElement = document.createElement('a');
    hiddenAnchorElement.href = downloadBlobUrl;
    hiddenAnchorElement.download = `immigo_transcript_${exportedAt.toISOString().replace(/[:.]/g, '-')}.txt`;
    hiddenAnchorElement.style.display = 'none';
    document.body.appendChild(hiddenAnchorElement);
    hiddenAnchorElement.click();
    hiddenAnchorElement.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadBlobUrl), 0);
    analytics.track('transcript_downloaded');
  }, [conversationState.conversationHistory, conversationState.sessionId, conversationState.sessionTime, t, i18n.language]);

  return {
    ...conversationState,
    isVoiceSessionActive: conversationState.isSessionActive && isVoiceSessionActive,
    isGeneratingProgressReport,
    currentState,
    interimTranscript: conversationState.interimTranscript || displayTranscript,
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
