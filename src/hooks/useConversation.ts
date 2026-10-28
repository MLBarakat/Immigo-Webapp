import { useCallback, useRef, useEffect, useLayoutEffect, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConversationContext } from '../context/conversationContextTypes';
import { SimulationMode, TestVersion } from '../context/conversationContextTypes';
import { ApiClient, ApiError } from '../services/apiClient';
import type { MockExamAction } from '../services/apiClient';
import { Message } from '../context/conversationContextTypes';
import { ChatPersistenceService } from '../services/chatPersistenceService';
import { fetchDailyProgressStats } from '../services/liveProgressService';
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
import { unlockAudioPlayback, describeAudioEnvironment, acquirePollyPlaybackElement } from '../utils/audioUtils';

interface UseConversationManagerProps {
  apiClient: ApiClient | null;
  userId?: string | null;
  voiceId?: string | null;
  simulationMode?: SimulationMode;
  testVersion?: TestVersion;
  includeEnglishSimulation?: boolean;
  preferredLanguage?: string;
  accountTimezone?: string;
  bargeIn?: BargeIn;
}

interface AssistantReveal {
  words: string[];
  revealedWords: number;
  timerId: number;
  audioNode: HTMLAudioElement | null;
}

const SILENCE_NUDGE_DELAY_MS = 15_000;
// Fix 2 safety net: how long a Polly turn blocked by the iOS autoplay policy
// may wait for a user gesture before it degrades to text-only (never worse
// than the previous behavior).
const GESTURE_RETRY_TIMEOUT_MS = 20_000;

export function useConversation({ apiClient, userId, voiceId, simulationMode = 'standard', testVersion = '2020', includeEnglishSimulation = false, preferredLanguage = 'en-US', accountTimezone = 'UTC', bargeIn = 'balanced' }: UseConversationManagerProps) {
  const { t, i18n } = useTranslation('conversation');
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  const { state: conversationState, dispatch } = context;
  const [isGeneratingProgressReport, setIsGeneratingProgressReport] = useState(false);
  const [examCompletion, setExamCompletion] = useState<{ report: string; recommendedMode: SimulationMode } | null>(null);
  const [dailySessionSettings, setDailySessionSettings] = useState<{ mode: SimulationMode; testVersion: TestVersion; includeEnglishSimulation: boolean } | null>(null);
  const pendingTranscriptClearRef = useRef(false);
  const voiceIdRef = useRef<string | null>(voiceId ?? null);
  const simulationModeRef = useRef<SimulationMode>(simulationMode);
  const testVersionRef = useRef<TestVersion>(testVersion);
  const includeEnglishSimulationRef = useRef(includeEnglishSimulation);
  const preferredLanguageRef = useRef(preferredLanguage);
  const bargeInRef = useRef<BargeIn>(bargeIn);
  useEffect(() => {
    voiceIdRef.current = voiceId ?? null;
  }, [voiceId]);
  useEffect(() => {
    simulationModeRef.current = simulationMode;
  }, [simulationMode]);
  useEffect(() => { testVersionRef.current = testVersion; }, [testVersion]);
  useEffect(() => { includeEnglishSimulationRef.current = includeEnglishSimulation; }, [includeEnglishSimulation]);
  useEffect(() => {
    preferredLanguageRef.current = preferredLanguage;
  }, [preferredLanguage]);
  useEffect(() => {
    bargeInRef.current = bargeIn;
  }, [bargeIn]);
  const accountTimezoneRef = useRef(accountTimezone || 'UTC');

  const intervalRef = useRef<number | null>(null);
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const audioPlaybackUrlRef = useRef<string | null>(null);
  const audioPlaybackGenerationRef = useRef(0);
  const processedTranscriptRef = useRef<string>('');
  const activeTurnControllerRef = useRef<AbortController | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const turnGenerationRef = useRef(0);
  const sessionIdRef = useRef<string | null>(conversationState.sessionId);
  const localSessionDateRef = useRef<string>(ChatPersistenceService.getSessionDate(accountTimezone || 'UTC'));
  const getCurrentSessionDate = () => ChatPersistenceService.getSessionDate(accountTimezoneRef.current);
  // Tracks which bank question the server last asked, so the next answer is
  // graded against the correct item (server-owned grounded grading).
  const currentItemIdRef = useRef<string | null>(null);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const updateCurrentItemId = useCallback((itemId: string | null) => {
    currentItemIdRef.current = itemId;
    setCurrentItemId(itemId);
  }, []);
  const examRunIdRef = useRef<string | null>(null);
  const nextExamActionRef = useRef<MockExamAction | undefined>(undefined);
  const modeGoalPendingRef = useRef(false);
  const openingResponseRef = useRef(false);
  const reportMilestoneDateRef = useRef(ChatPersistenceService.getSessionDate(accountTimezone || 'UTC'));
  const hydratedHistoryUserIdRef = useRef<string | null>(null);
  const skipNextHistoryCacheWriteRef = useRef(false);
  const historyChangedBeforeHydrationRef = useRef(false);
  const historyClearedBeforeHydrationRef = useRef(false);
  const latestConversationHistoryRef = useRef(conversationState.conversationHistory);
  const voiceSessionRef = useRef(conversationState.isSessionActive);
  const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(conversationState.isSessionActive);
  // True while a Polly turn is parked waiting for a user gesture to replay it
  // (Fix 2 safety net); drives the "tap anywhere to hear" banner.
  const [isAudioRetryPending, setIsAudioRetryPending] = useState(false);
  // One-shot flag: set when the server asks the user to confirm/repeat an
  // answer or complete a multi-part one (turn-policy's needs_confirmation).
  // While set (and matching the current item), the next answer is sent as a
  // confirmation retry so the server commits the honest final verdict.
  const awaitingConfirmationRef = useRef<string | null>(null);
  const lastReportedDailyMilestoneRef = useRef<number>(0);
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

  // At most one Polly turn may be parked awaiting a gesture replay; the ref
  // holds its cancel function so any playback teardown (barge-in, session
  // end, unmount, a newer parked turn) can dismiss it first.
  const pendingAudioRetryRef = useRef<((reason: string) => void) | null>(null);

  const dismissPendingAudioRetry = useCallback((reason: string) => {
    const cancel = pendingAudioRetryRef.current;
    pendingAudioRetryRef.current = null;
    cancel?.(reason);
  }, []);

  const clearAudioPlayback = useCallback(() => {
    // A parked gesture-retry turn belongs to the playback being cleared.
    dismissPendingAudioRetry('playback cleared');
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
  }, [stopAssistantReveal, dismissPendingAudioRetry]);

  /**
   * Logs a Polly playback readiness snapshot: payload size + the exact
   * autoplay/policy signals (userActivation, gesture recency, visibility,
   * element state). Temporary [AUDIO-DIAG] instrumentation for the
   * mobile-only NotAllowedError investigation.
   */
  const describePollyPlayback = useCallback((
    scope: string,
    traceId: string,
    node: HTMLAudioElement,
    audioByteLength: number,
    responseTextLength: number,
  ) => {
    logger.info(`[AUDIO-DIAG] ${scope}: audio element created; payload ready for playback.`, {
      traceId,
      audioByteLength,
      responseTextLength,
      elementReadyState: node.readyState,
      elementNetworkState: node.networkState,
      elementCurrentSrc: node.currentSrc || '(none yet)',
      ...describeAudioEnvironment(),
    });
  }, []);

  /**
   * Completes an assistant turn as text-only when its audio cannot be heard
   * (mobile autoplay block or media decode failure). This is not a turn
   * failure: the text response is already revealed, so flush it fully and
   * settle the FSM exactly as a natural playback end would — without any
   * user-facing error. No audio ever played, so no AEC settle window needed.
   */
  const completeBlockedAudioTurnAsText = useCallback((traceId: string, error: unknown) => {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('Assistant audio unavailable; completing turn as text.', {
      traceId,
      errorName,
      errorMessage,
      ...describeAudioEnvironment(),
    });
    isAssistantAudioActiveRef.current = false;
    isPollyPlayingRef.current = false;
    stopAssistantReveal(true);
    dispatch({ type: 'FINISH_ASSISTANT_RESPONSE' });
    clearAudioPlayback();
  }, [dispatch, stopAssistantReveal, clearAudioPlayback]);

  /**
   * Fix 2 safety net (iOS autoplay): when play() is rejected with
   * NotAllowedError the audio is NOT lost — the turn is parked (reveal held
   * on the first word, blob kept alive, status stays 'speaking') and a
   * one-time capture listener replays it synchronously inside the user's next
   * touch, which is where iOS re-authorizes media playback. Falls back to the
   * previous text-only completion on replay failure, timeout, or dismissal.
   */
  const parkTurnForGestureRetry = useCallback((params: {
    scope: string;
    traceId: string;
    node: HTMLAudioElement;
    blobUrl: string;
    playbackGeneration: number;
    blockedError: Error;
  }) => {
    const { scope, traceId, node, blobUrl, playbackGeneration, blockedError } = params;

    // Only one parked turn may exist at a time.
    dismissPendingAudioRetry('superseded by a newer parked turn');

    logger.warn(`[AUDIO-DIAG] ${scope}: autoplay block — turn parked, awaiting next user gesture.`, {
      traceId,
      errorName: blockedError.name,
      errorMessage: blockedError.message,
      ...describeAudioEnvironment(),
    });
    setIsAudioRetryPending(true);

    let settled = false;
    let timeoutId: number | null = null;

    function finishCleanup(): boolean {
      if (settled) return false;
      settled = true;
      document.removeEventListener('pointerup', handleGesture, true);
      document.removeEventListener('touchend', handleGesture, true);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (pendingAudioRetryRef.current === cancel) pendingAudioRetryRef.current = null;
      setIsAudioRetryPending(false);
      return true;
    }

    // Dismissal path (barge-in / session end / unmount / supersede): flush
    // the parked bubble's remaining words so it never stays truncated, but
    // leave the FSM to whoever is dismissing us (they are already settling).
    function cancel(reason: string) {
      if (!finishCleanup()) return;
      stopAssistantReveal(true);
      logger.info(`[AUDIO-DIAG] ${scope}: parked turn cancelled (${reason}).`, {
        traceId,
        ...describeAudioEnvironment(),
      });
    }

    function handleGesture() {
      if (playbackGeneration !== audioPlaybackGenerationRef.current) {
        finishCleanup();
        logger.info(`[AUDIO-DIAG] ${scope}: parked turn superseded by a newer turn; discarding gesture retry.`, { traceId });
        return;
      }
      if (!finishCleanup()) return;
      logger.info(`[AUDIO-DIAG] ${scope}: replaying parked audio inside user gesture.`, {
        traceId,
        ...describeAudioEnvironment(),
      });
      // Re-point the shared element at the parked blob (the silent unlock
      // may have overwritten src) and replay synchronously inside this
      // gesture — a play() from within the gesture IS the iOS authorization,
      // so no separate unlock step is needed (and running it here would
      // clobber the blob src with the silent WAV).
      node.src = blobUrl;
      if (typeof node.load === 'function') {
        try {
          node.load();
        } catch {
          // Best-effort; play() below is the authoritative attempt.
        }
      }
      node.play().then(() => {
        logger.info(`[AUDIO-DIAG] ${scope}: gesture replay RESOLVED — playback recovered.`, {
          traceId,
          ...describeAudioEnvironment(),
        });
      }).catch((retryError: unknown) => {
        logger.warn(`[AUDIO-DIAG] ${scope}: gesture replay REJECTED — completing turn as text.`, {
          traceId,
          errorName: retryError instanceof Error ? retryError.name : 'Unknown',
          errorMessage: retryError instanceof Error ? retryError.message : String(retryError),
          ...describeAudioEnvironment(),
        });
        completeBlockedAudioTurnAsText(traceId, retryError);
      });
    }

    document.addEventListener('pointerup', handleGesture, true);
    document.addEventListener('touchend', handleGesture, true);
    timeoutId = window.setTimeout(() => {
      if (!finishCleanup()) return;
      logger.info(`[AUDIO-DIAG] ${scope}: gesture-retry timeout — completing parked turn as text.`, {
        traceId,
        ...describeAudioEnvironment(),
      });
      completeBlockedAudioTurnAsText(traceId, blockedError);
    }, GESTURE_RETRY_TIMEOUT_MS);

    pendingAudioRetryRef.current = cancel;
  }, [dismissPendingAudioRetry, completeBlockedAudioTurnAsText, stopAssistantReveal]);

  // Never leave a parked turn (listeners, timer, banner) behind on unmount.
  useEffect(() => {
    return () => {
      const cancel = pendingAudioRetryRef.current;
      pendingAudioRetryRef.current = null;
      cancel?.('hook unmount');
    };
  }, []);

  // Dual-Track Speculative Merger orchestration hook (lazy init on Start tap).
  const {
    currentState,
    displayTranscript,
    finalTranscript,
    isModelLoading,
    isVadReady,
    isTranscribing,
    isInitializing,
    initError,
    ensureInitialized,
    prepareMicrophoneAccess,
    releasePreparedMicrophone,
    startRecording,
    stopRecording,
    pauseVAD,
    resumeVAD,
    clearTranscript,
    micError,
    clearMicError
  } = useWhisper({
    onSpeechStart: () => {
      speechStartedDuringPollyRef.current = isAssistantAudioActiveRef.current;
    },
  });

  /**
   * Microphone-gated transition into 'listening'. The conversation status may
   * only advertise listening after capture has provably started — the mic was
   * acquired inside the gesture chain and the VAD is running on a live
   * stream. A failed acquisition surfaces the mic error and parks the session
   * in 'error' instead of pretending to listen on a dead mic.
   */
  const startListeningWithMicGate = useCallback(async () => {
    const started = await startRecording();
    // Classifies "status went to error right after micVAD started" from the
    // console alone: this line lands immediately before the dispatch.
    logger.info('Mic gate outcome.', { started, voiceSessionActive: voiceSessionRef.current });
    if (started) {
      dispatch({ type: 'SET_STATUS', payload: 'listening' });
    } else if (voiceSessionRef.current) {
      logger.warn('Mic gate parking the session in error: capture did not start.');
      dispatch({ type: 'SET_STATUS', payload: 'error' });
    }
  }, [startRecording, dispatch]);

  /**
   * Invariant enforcement: 'listening' must never stand while the microphone
   * is known to be unavailable. Reducer paths that settle a turn (e.g.
   * FINISH_ASSISTANT_RESPONSE during a text-only fallback) restore listening
   * unconditionally; if mic acquisition has since failed, demote to error so
   * the UI can explain why nothing is being heard.
   */
  useEffect(() => {
    if (micError && conversationState.appStatus === 'listening') {
      dispatch({ type: 'SET_STATUS', payload: 'error' });
    }
  }, [micError, conversationState.appStatus, dispatch]);

  useEffect(() => {
    sessionIdRef.current = conversationState.sessionId;
  }, [conversationState.sessionId]);
  useLayoutEffect(() => {
    accountTimezoneRef.current = accountTimezone || 'UTC';
  }, [accountTimezone]);

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
    if (!userId) {
      dispatch({ type: 'SET_LIVE_STATS', payload: null });
      return;
    }

    let isMounted = true;
    const refreshDailyStats = async () => {
      const stats = await fetchDailyProgressStats(userId, accountTimezoneRef.current);
      if (isMounted && stats) dispatch({ type: 'SET_LIVE_STATS', payload: stats });
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) void refreshDailyStats();
    };

    void refreshDailyStats();
    const refreshTimer = window.setInterval(() => void refreshDailyStats(), 30_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      isMounted = false;
      window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId, dispatch, updateCurrentItemId]);

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
    const estimatedDate = getCurrentSessionDate();

    void ChatPersistenceService.getOrCreateDailySession(userId, estimatedDate, accountTimezoneRef.current).then(async dailySession => {
      if (!isMounted || !dailySession) return;
      // The database clock is authoritative for the session day. Read the
      // local snapshot only after resolving that date, so skewed device clocks
      // cannot briefly show another day's cached conversation.
      const localDate = dailySession.local_date ?? estimatedDate;
      localSessionDateRef.current = localDate;
      const cacheKey = `immigo_conversation_${userId}_${localDate}`;
      let cachedMessages: Message[] | null = null;
      try {
        const stored = sessionStorage.getItem(cacheKey);
        if (stored !== null) {
          const parsed: unknown = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.every((entry): entry is Message =>
            typeof entry === 'object' && entry !== null && typeof entry.id === 'string'
            && (entry.role === 'user' || entry.role === 'assistant')
            && typeof entry.content === 'string' && typeof entry.timestamp === 'string'
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
      sessionIdRef.current = dailySession.id;
      updateCurrentItemId(dailySession.current_item_id);
      modeGoalPendingRef.current = dailySession.mode_goal_pending;
      if (['standard', 'practice', 'study'].includes(dailySession.current_mode)
        && (dailySession.test_version === '2008' || dailySession.test_version === '2020')) {
        setDailySessionSettings({ mode: dailySession.current_mode as SimulationMode, testVersion: dailySession.test_version, includeEnglishSimulation: dailySession.include_english_simulation });
      }
      dispatch({ type: 'SET_SESSION_ID', payload: dailySession.id });
      const payload = await ChatPersistenceService.loadRecentMessages(userId, 100, dailySession.id);
      if (!isMounted) return;
      const formattedMessages: Message[] = payload.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.created_at,
      }));
      // Merge DB results with the instant cache snapshot instead of
      // discarding either side: an empty/stale per-tab cache must never
      // poison hydration, and DB rows must not wipe just-received live turns.
      if (cachedMessages === null && !historyChangedBeforeHydrationRef.current && !historyClearedBeforeHydrationRef.current) {
        const seen = new Set<string>();
        const merged: Message[] = [];
        for (const m of [...(cachedMessages ?? []), ...formattedMessages]) {
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          merged.push(m);
        }
        merged.sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
        dispatch({
          type: 'LOAD_HISTORICAL_MESSAGES',
          payload: { messages: merged, hasMore: payload.hasMore, oldestCursor: payload.oldestCursor, replace: true },
        });
      } else {
        // Cache already painted instantly (or live turns arrived first):
        // prepend only genuinely new DB rows, never replace.
        const existingIds = new Set(latestConversationHistoryRef.current.map(m => m.id));
        const fresh = formattedMessages.filter(m => !existingIds.has(m.id));
        dispatch({
          type: 'LOAD_HISTORICAL_MESSAGES',
          payload: { messages: fresh, hasMore: payload.hasMore, oldestCursor: payload.oldestCursor, replace: false },
        });
      }
    }).catch(err => {
      logger.error('Failed to hydrate chat history:', undefined, { error: String(err) });
    });

    return () => {
      isMounted = false;
    };
  }, [userId, accountTimezone, dispatch, updateCurrentItemId]);

  useEffect(() => {
    if (!userId || hydratedHistoryUserIdRef.current !== userId) return;
    if (skipNextHistoryCacheWriteRef.current) {
      skipNextHistoryCacheWriteRef.current = false;
      return;
    }
    try {
      sessionStorage.setItem(
        `immigo_conversation_${userId}_${localSessionDateRef.current}`,
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
        25,
        conversationState.sessionId
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
  }, [userId, conversationState.oldestMessageCursor, conversationState.hasMoreHistory, conversationState.sessionId, dispatch]);

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

  const sendTextMessage = useCallback(async (text: string, inputMethod: 'text' | 'voice' = 'text') => {
    // Unlock audible playback while still inside the user gesture — play()
    // calls below happen after an async gap where the gesture is long gone.
    // Text-only turns never create audio, so skip the unlock there.
    if (voiceSessionRef.current || conversationState.isSessionActive) unlockAudioPlayback();
    const validatedText = text.replace(/\s+/g, ' ').trim();
    if (!validatedText) return;
    pendingTranscriptClearRef.current = true;
    const isOpeningResponse = openingResponseRef.current || !currentItemIdRef.current;
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
    const requestedSessionDate = getCurrentSessionDate();
    if (userId) {
      const previousSessionId = activeSessionId;
      const previousSessionDate = localSessionDateRef.current;
      const dailySession = await ChatPersistenceService.getOrCreateDailySession(userId, requestedSessionDate, accountTimezoneRef.current);
      const localDate = dailySession?.local_date ?? requestedSessionDate;
      activeSessionId = dailySession?.id ?? null;
      if (turnGeneration !== turnGenerationRef.current) return;
      if (activeSessionId) {
        if (previousSessionDate !== localDate) {
          dispatch({ type: 'CLEAR_CONVERSATION' });
          historyClearedBeforeHydrationRef.current = true;
        }
        localSessionDateRef.current = localDate;
        sessionIdRef.current = activeSessionId;
        updateCurrentItemId(dailySession?.current_item_id ?? null);
        modeGoalPendingRef.current = dailySession?.mode_goal_pending ?? false;
        dispatch({ type: 'SET_SESSION_ID', payload: activeSessionId });
        if (previousSessionId !== activeSessionId || previousSessionDate !== localDate) {
          analytics.track('session_started', { mode: 'text' });
        }
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
      let assistantSegments: string[] = [];

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
              { headers: { 'x-correlation-trace-id': traceId }, signal: turnController.signal, voiceId: voiceIdRef.current ?? undefined, simulationMode: simulationModeRef.current, preferredLanguage: preferredLanguageRef.current, openingResponse: isOpeningResponse, testVersion: testVersionRef.current, includeEnglishSimulation: includeEnglishSimulationRef.current, examRunId: examRunIdRef.current, modeGoalResponse: modeGoalPendingRef.current, examAction: nextExamActionRef.current, inputMethod, requestId: traceId }
          );
          responseText = res.responseText;
          assistantSegments = Array.isArray(res.assistantSegments) ? res.assistantSegments : [];
          audioData = res.audioData;
          nextItemId = res.nextItemId;
          needsConfirmation = res.needsConfirmation;
          verdict = res.verdict;
          if (res.examRunId !== null) examRunIdRef.current = res.examRunId;
          if (res.examCompleted) examRunIdRef.current = null;
          if (res.examCompleted && res.examReport) {
            const accuracy = Number(res.examReport.match(/\((\d+)% accuracy\)/i)?.[1] ?? 100);
            setExamCompletion({ report: res.examReport, recommendedMode: accuracy < 60 ? 'study' : 'practice' });
          }
          modeGoalPendingRef.current = res.modeGoalPending;
          if (isOpeningResponse) nextExamActionRef.current = undefined;
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
      updateCurrentItemId(nextItemId);
      if (activeSessionId) {
        void ChatPersistenceService.saveDailySessionState(activeSessionId, {
          current_item_id: nextItemId,
          current_mode: simulationModeRef.current,
          test_version: testVersionRef.current,
          include_english_simulation: includeEnglishSimulationRef.current,
        });
      }

      // Confirmation state machine (one-shot):
      //  - server asked to confirm/complete -> arm the retry flag for this item
      //  - otherwise                        -> clear it (the round is over)
      awaitingConfirmationRef.current = needsConfirmation ? nextItemId : null;

      // A grade was actually committed (not a repeat/hint/clarify/near-miss
      // turn) -> refresh the free, real-time stats, and every 10th committed
      // answer, also refresh the (expensive) narrative report mid-session so
      // it doesn't go stale for the whole session, without regenerating it
      // after every single question.
      if (verdict !== null && userId) {
        const todaySessionDate = getCurrentSessionDate();
        if (reportMilestoneDateRef.current !== todaySessionDate) {
          reportMilestoneDateRef.current = todaySessionDate;
          lastReportedDailyMilestoneRef.current = 0;
        }
        void fetchDailyProgressStats(userId, accountTimezoneRef.current).then((stats) => {
          if (!stats) return;
          dispatch({ type: 'SET_LIVE_STATS', payload: stats });
          if (stats.answered > 0 && stats.answered % 10 === 0
            && stats.answered > lastReportedDailyMilestoneRef.current) {
            lastReportedDailyMilestoneRef.current = stats.answered;
            if (activeSessionId) void generatePeriodicProgressReport(activeSessionId);
          }
        });
      }

      // Persist Assistant Message to Supabase
      const displaySegments = assistantSegments.length > 0 ? assistantSegments : [responseText];
      if (userId && activeSessionId) {
        void (async () => {
          for (const segment of displaySegments) {
            await ChatPersistenceService.persistMessage(activeSessionId, userId, 'assistant', segment);
          }
        })();
      }

      if (!conversationState.isSessionActive || !voiceSessionRef.current) {
        dispatch({ type: 'SET_STATUS', payload: 'speaking' });
        startAssistantReveal(secureAssistantMessageId, displaySegments[0] ?? responseText);
        for (const segment of displaySegments.slice(1)) {
          dispatch({ type: 'ADD_STANDALONE_ASSISTANT_MESSAGE', payload: {
            assistantMessageId: `asst-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            content: segment,
          } });
        }
        activeTurnControllerRef.current = null;
        activeAssistantMessageIdRef.current = null;
        return;
      }

      const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
      const audioBlobUrl = URL.createObjectURL(audioBlob);
      const audioPlaybackNode = acquirePollyPlaybackElement(audioBlobUrl);
      const playbackGeneration = ++audioPlaybackGenerationRef.current;
      describePollyPlayback('Turn response', traceId, audioPlaybackNode, audioData.byteLength, responseText.length);
      audioPlaybackNode.onerror = () => {
        if (playbackGeneration !== audioPlaybackGenerationRef.current) return;
        completeBlockedAudioTurnAsText(traceId, new Error(`media decode failure (code ${audioPlaybackNode.error?.code ?? 'unknown'})`));
      };
      audioPlaybackRef.current = audioPlaybackNode;
      audioPlaybackUrlRef.current = audioBlobUrl;
      activePollyTextRef.current = responseText;
      dispatch({ type: 'SET_STATUS', payload: 'speaking' });
      startAssistantReveal(secureAssistantMessageId, displaySegments[0] ?? responseText, audioPlaybackNode);
      for (const segment of displaySegments.slice(1)) {
        dispatch({ type: 'ADD_STANDALONE_ASSISTANT_MESSAGE', payload: {
          assistantMessageId: `asst-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          content: segment,
        } });
      }

      // Keep capture active during playback so VAD can recognize a real
      // interruption; browser echo cancellation and the barge-in holdoff
      // suppress speaker bleed.
      isPollyPlayingRef.current = true;
      isAssistantAudioActiveRef.current = true;
      // Pause VAD during AI audio playback to prevent VAD from detecting its own
      // output as user speech. This prevents the crash cycle of repeated VAD
      // detections, correlation ID mismatches, and worker OOM on mobile.
      pauseVAD();
      void startRecording();
      if (pollyMuteGateTimerRef.current !== null) {
        window.clearTimeout(pollyMuteGateTimerRef.current);
        pollyMuteGateTimerRef.current = null;
      }

      logger.info('[AUDIO-DIAG] Turn response: calling audio.play().', { traceId, ...describeAudioEnvironment() });
      audioPlaybackNode.play().then(() => {
        logger.info('[AUDIO-DIAG] Turn response: audio.play() RESOLVED — audible playback started.', {
          traceId,
          ...describeAudioEnvironment(),
        });
      }).catch((error: unknown) => {
        logger.warn('[AUDIO-DIAG] Turn response: audio.play() REJECTED.', {
          traceId,
          errorName: error instanceof Error ? error.name : 'Unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
          ...describeAudioEnvironment(),
        });
        if (playbackGeneration !== audioPlaybackGenerationRef.current) return;
        // Mobile autoplay policy block (iOS) — park the turn; it replays
        // inside the user's next gesture, or degrades to text on timeout.
        if (error instanceof Error && error.name === 'NotAllowedError') {
          parkTurnForGestureRetry({ scope: 'Turn response', traceId, node: audioPlaybackNode, blobUrl: audioBlobUrl, playbackGeneration, blockedError: error });
          return;
        }
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
        void startRecording();
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
          // Re-enable VAD listening so user can speak after AI response ends
          resumeVAD();
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
        void startRecording();
      }
    } finally {
      if (activeTurnControllerRef.current === turnController) {
        activeTurnControllerRef.current = null;
      }
    }
  }, [apiClient, userId, conversationState.sessionId, conversationState.conversationHistory, dispatch, startRecording, stopRecording, clearTranscript, clearAudioPlayback, conversationState.isSessionActive, startAssistantReveal, stopAssistantReveal, generatePeriodicProgressReport, completeBlockedAudioTurnAsText, describePollyPlayback, parkTurnForGestureRetry, pauseVAD, resumeVAD, updateCurrentItemId]);

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
        testVersion: testVersionRef.current,
        includeEnglishSimulation: includeEnglishSimulationRef.current,
      });
      if (controller.signal.aborted) return;
      if (!voiceSessionRef.current || !response.responseText || response.audioData.byteLength === 0) return;

      openingResponseRef.current = false;
      updateCurrentItemId(response.nextItemId ?? currentItemId);
      if (userId && activeSessionId) {
        void ChatPersistenceService.persistMessage(activeSessionId, userId, 'assistant', response.responseText);
      }

      const audioUrl = URL.createObjectURL(new Blob([response.audioData], { type: 'audio/mpeg' }));
      const audioNode = acquirePollyPlaybackElement(audioUrl);
      const playbackGeneration = ++audioPlaybackGenerationRef.current;
      describePollyPlayback('Silence nudge', traceId, audioNode, response.audioData.byteLength, response.responseText.length);
      audioNode.onerror = () => {
        if (playbackGeneration !== audioPlaybackGenerationRef.current) return;
        completeBlockedAudioTurnAsText(traceId, new Error(`media decode failure (code ${audioNode.error?.code ?? 'unknown'})`));
      };
      audioPlaybackRef.current = audioNode;
      audioPlaybackUrlRef.current = audioUrl;
      activePollyTextRef.current = response.responseText;
      dispatch({ type: 'SET_STATUS', payload: 'speaking' });
      startAssistantReveal(assistantMessageId, response.responseText, audioNode);
      isPollyPlayingRef.current = true;
      isAssistantAudioActiveRef.current = true;
      void startRecording();
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
      logger.info('[AUDIO-DIAG] Silence nudge: calling audio.play().', { traceId, ...describeAudioEnvironment() });
      audioNode.play().then(() => {
        logger.info('[AUDIO-DIAG] Silence nudge: audio.play() RESOLVED — audible playback started.', {
          traceId,
          ...describeAudioEnvironment(),
        });
      }).catch((error: unknown) => {
        logger.warn('[AUDIO-DIAG] Silence nudge: audio.play() REJECTED.', {
          traceId,
          errorName: error instanceof Error ? error.name : 'Unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
          ...describeAudioEnvironment(),
        });
        if (playbackGeneration !== audioPlaybackGenerationRef.current) return;
        // Mobile autoplay policy block (iOS) — park the turn; it replays
        // inside the user's next gesture, or degrades to text on timeout.
        if (error instanceof Error && error.name === 'NotAllowedError') {
          parkTurnForGestureRetry({ scope: 'Silence nudge', traceId, node: audioNode, blobUrl: audioUrl, playbackGeneration, blockedError: error });
          return;
        }
        logger.error('Silence reminder audio playback failed.', undefined, {
          error: error instanceof Error ? error.message : String(error),
          traceId,
        });
        clearAudioPlayback();
        void startListeningWithMicGate();
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
  }, [apiClient, conversationState.sessionId, userId, dispatch, startAssistantReveal, stopAssistantReveal, startRecording, startListeningWithMicGate, clearAudioPlayback, completeBlockedAudioTurnAsText, describePollyPlayback, parkTurnForGestureRetry, updateCurrentItemId]);

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
      // 'connecting' = mic not confirmed yet; no capture is running, so there
      // is nothing to nudge.
      || conversationState.appStatus === 'connecting'
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
        if (!isEchoFromPlayback) void sendTextMessage(freshUtteranceChunk, 'voice');
      }
      processedTranscriptRef.current = activeConfirmedString;
    }
  }, [finalTranscript, sendTextMessage]);

  const initiateSession = useCallback(async () => {
    // Unlock audible playback while still inside the Start-tap gesture.
    unlockAudioPlayback();
    historyChangedBeforeHydrationRef.current = true;
    const requestedSessionDate = getCurrentSessionDate();
    const previousLocalDate = localSessionDateRef.current;
    const storedSessionId = sessionIdRef.current || conversationState.sessionId;
    const dailySession = userId ? await ChatPersistenceService.getOrCreateDailySession(userId, requestedSessionDate, accountTimezoneRef.current) : null;
    const localDate = dailySession?.local_date ?? requestedSessionDate;
    const existingSessionId = previousLocalDate === localDate ? storedSessionId : null;
    let newSessionId: string | null = dailySession?.id ?? existingSessionId;
    const continuingTextSession = Boolean(newSessionId && existingSessionId === newSessionId && !conversationState.isSessionActive);
    if (previousLocalDate !== localDate) {
      dispatch({ type: 'CLEAR_CONVERSATION' });
      historyClearedBeforeHydrationRef.current = true;
      updateCurrentItemId(null);
      awaitingConfirmationRef.current = null;
    }
    localSessionDateRef.current = localDate;
    voiceSessionRef.current = true;
    setIsVoiceSessionActive(true);
    dispatch({ type: 'START_SESSION' });
    if (!continuingTextSession) analytics.track('session_started', { mode: 'voice' });
    processedTranscriptRef.current = '';
    pendingTranscriptClearRef.current = false;
    if (!continuingTextSession) {
      sessionIdRef.current = null;
      updateCurrentItemId(null);
      awaitingConfirmationRef.current = null;
      openingResponseRef.current = true;
    }

    if (newSessionId && dailySession) {
      sessionIdRef.current = newSessionId;
      updateCurrentItemId(currentItemIdRef.current ?? dailySession.current_item_id);
      dispatch({ type: 'SET_SESSION_ID', payload: newSessionId });
    }
    if (!newSessionId && userId) {
      const fallbackSession = await ChatPersistenceService.getOrCreateDailySession(userId, localDate, accountTimezoneRef.current);
      newSessionId = fallbackSession?.id ?? null;
      if (!voiceSessionRef.current) {
        return;
      }
      sessionIdRef.current = newSessionId;
      dispatch({ type: 'SET_SESSION_ID', payload: newSessionId });
    }

    if (continuingTextSession && currentItemIdRef.current) {
      await startListeningWithMicGate();
      return;
    }

    // Select the current question before opening the microphone, but leave
    // the first response to the user rather than speaking another opener.
    if (!apiClient) {
      await startListeningWithMicGate();
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
        testVersion: testVersionRef.current,
        includeEnglishSimulation: includeEnglishSimulationRef.current,
        examAction: nextExamActionRef.current,
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

      updateCurrentItemId(res.nextItemId);
      examRunIdRef.current = res.examRunId;
      nextExamActionRef.current = undefined;
      awaitingConfirmationRef.current = res.needsConfirmation ? res.nextItemId : null;
      if (newSessionId) {
        void ChatPersistenceService.saveDailySessionState(newSessionId, {
          current_item_id: res.nextItemId,
          current_mode: simulationModeRef.current,
          test_version: testVersionRef.current,
          include_english_simulation: includeEnglishSimulationRef.current,
        });
      }

      if (!res.responseText && res.audioData.byteLength === 0) {
        logger.info('[AUDIO-DIAG] Session start returned no greeting audio; skipping greeting playback.', {
          traceId,
          audioByteLength: res.audioData.byteLength,
          responseTextLength: res.responseText?.length ?? 0,
          ...describeAudioEnvironment(),
        });
        await startListeningWithMicGate();
        return;
      }

      if (userId && newSessionId) {
        void ChatPersistenceService.persistMessage(newSessionId, userId, 'assistant', res.responseText);
      }

      // Keep capture active during playback for barge-in. The assistant bubble
      // is created with its first word only after the response is ready.
      const audioBlob = new Blob([res.audioData], { type: 'audio/mpeg' });
      const audioBlobUrl = URL.createObjectURL(audioBlob);
      const audioPlaybackNode = acquirePollyPlaybackElement(audioBlobUrl);
      const playbackGeneration = ++audioPlaybackGenerationRef.current;
      describePollyPlayback('Greeting', traceId, audioPlaybackNode, res.audioData.byteLength, res.responseText.length);
      audioPlaybackNode.onerror = () => {
        if (playbackGeneration !== audioPlaybackGenerationRef.current) return;
        completeBlockedAudioTurnAsText(traceId, new Error(`media decode failure (code ${audioPlaybackNode.error?.code ?? 'unknown'})`));
      };
      audioPlaybackRef.current = audioPlaybackNode;
      audioPlaybackUrlRef.current = audioBlobUrl;
      activePollyTextRef.current = res.responseText;
      dispatch({ type: 'SET_STATUS', payload: 'speaking' });
      activeAssistantMessageIdRef.current = secureAssistantMessageId;
      startAssistantReveal(secureAssistantMessageId, res.responseText, audioPlaybackNode);

      isPollyPlayingRef.current = true;
      isAssistantAudioActiveRef.current = true;
      // Pause VAD during AI audio playback to prevent VAD from detecting its own
      // output as user speech. This prevents the crash cycle of repeated VAD
      // detections, correlation ID mismatches, and worker OOM on mobile.
      pauseVAD();
      void startRecording();
      if (pollyMuteGateTimerRef.current !== null) {
        window.clearTimeout(pollyMuteGateTimerRef.current);
        pollyMuteGateTimerRef.current = null;
      }

      logger.info('[AUDIO-DIAG] Greeting: calling audio.play().', { traceId, ...describeAudioEnvironment() });
      audioPlaybackNode.play().then(() => {
        logger.info('[AUDIO-DIAG] Greeting: audio.play() RESOLVED — audible playback started.', {
          traceId,
          ...describeAudioEnvironment(),
        });
      }).catch((error: unknown) => {
        logger.warn('[AUDIO-DIAG] Greeting: audio.play() REJECTED.', {
          traceId,
          errorName: error instanceof Error ? error.name : 'Unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
          ...describeAudioEnvironment(),
        });
        if (playbackGeneration !== audioPlaybackGenerationRef.current) return;
        // Mobile autoplay policy block (iOS) — park the turn; it replays
        // inside the user's next gesture, or degrades to text on timeout.
        if (error instanceof Error && error.name === 'NotAllowedError') {
          parkTurnForGestureRetry({ scope: 'Greeting', traceId, node: audioPlaybackNode, blobUrl: audioBlobUrl, playbackGeneration, blockedError: error });
          return;
        }
        logger.error('Greeting audio playback initialization failure:', undefined, {
          errorMessage: error instanceof Error ? error.message : String(error),
          traceId,
        });
        clearAudioPlayback();
        void startRecording();
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
          // Re-enable VAD listening so user can speak after AI response ends
          resumeVAD();
        }, 300);
      };
    } catch (error: unknown) {
      if (!voiceSessionRef.current) return;
      logger.error('Silent session question setup failed after retry; continuing to listen without a startup response.', undefined, {
        error: error instanceof Error ? error.message : String(error),
        traceId,
      });
      await startListeningWithMicGate();
    }
  }, [userId, conversationState.sessionId, conversationState.isSessionActive, dispatch, startRecording, startListeningWithMicGate, apiClient, clearAudioPlayback, startAssistantReveal, stopAssistantReveal, completeBlockedAudioTurnAsText, describePollyPlayback, parkTurnForGestureRetry, pauseVAD, resumeVAD, updateCurrentItemId]);

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
    updateCurrentItemId(null);
    openingResponseRef.current = false;
    voiceSessionRef.current = false;
    setIsVoiceSessionActive(false);
    awaitingConfirmationRef.current = null;
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
  }, [conversationState.sessionId, conversationState.sessionTime, apiClient, dispatch, stopRecording, clearAudioPlayback, updateCurrentItemId]);

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
    const storageKey = `welcome-banner-requested:${userId}`;
    try {
      if (sessionStorage.getItem(storageKey) === 'done') {
        hasFetchedWelcomeBannerRef.current = true;
        return;
      }
    } catch {
      // Storage unavailable — fall through to in-memory guard only.
    }
    hasFetchedWelcomeBannerRef.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const { message } = await apiClient.fetchWelcomeBanner();
        if (cancelled) return;
        if (latestConversationHistoryRef.current.length > 0) return;
        const assistantMessageId = `asst-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessageId, content: message } });
        try {
          sessionStorage.setItem(storageKey, 'done');
        } catch {
          // Best-effort only.
        }
      } catch (error: unknown) {
        if (cancelled) return;
        // Non-fatal: the welcome banner is a nice-to-have, not required to
        // start practicing. Log and move on; no user-facing error needed.
        // Do not mark done so a later mount can retry.
        hasFetchedWelcomeBannerRef.current = false;
        logger.error('Welcome banner fetch failed (non-fatal).', undefined, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
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
    updateCurrentItemId(null);
    openingResponseRef.current = false;
    voiceSessionRef.current = false;
    setIsVoiceSessionActive(false);
    awaitingConfirmationRef.current = null;
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
  }, [conversationState.isSessionActive, conversationState.sessionId, clearAudioPlayback, stopRecording, apiClient, dispatch, updateCurrentItemId]);

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

  const changeMode = useCallback(async (mode: SimulationMode) => {
    const activeSessionId = sessionIdRef.current;
    if (!apiClient || !userId || !activeSessionId) return;
    try {
      await ChatPersistenceService.saveDailySessionState(activeSessionId, {
        current_item_id: currentItemIdRef.current,
        current_mode: mode,
        test_version: testVersionRef.current,
        include_english_simulation: includeEnglishSimulationRef.current,
      });
      const response = await apiClient.postModeTransition(activeSessionId, currentItemIdRef.current, {
        voiceId: voiceIdRef.current ?? undefined,
        simulationMode: mode,
        preferredLanguage: preferredLanguageRef.current,
        testVersion: testVersionRef.current,
        includeEnglishSimulation: includeEnglishSimulationRef.current,
      });
      modeGoalPendingRef.current = true;
      updateCurrentItemId(response.nextItemId ?? currentItemIdRef.current);
        const segments = Array.isArray(response.assistantSegments) && response.assistantSegments.length
          ? response.assistantSegments
          : [response.responseText];
      for (const content of segments) {
        dispatch({ type: 'ADD_STANDALONE_ASSISTANT_MESSAGE', payload: {
          assistantMessageId: `mode-goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          content,
        } });
        if (content.trim()) void ChatPersistenceService.persistMessage(activeSessionId, userId, 'assistant', content);
      }
      if (voiceSessionRef.current && response.audioData.byteLength > 0) {
        const url = URL.createObjectURL(new Blob([response.audioData], { type: 'audio/mpeg' }));
        const player = acquirePollyPlaybackElement(url);
        player.onended = () => URL.revokeObjectURL(url);
        void player.play().catch(() => URL.revokeObjectURL(url));
      }
    } catch (error) {
      logger.warn('Could not start the mode goal conversation.', { error: String(error) });
    }
  }, [apiClient, userId, dispatch, updateCurrentItemId]);

  return {
    ...conversationState,
    isVoiceSessionActive: conversationState.isSessionActive && isVoiceSessionActive,
    isGeneratingProgressReport,
    dailySessionSettings,
    currentItemId,
    examCompletion,
    dismissExamCompletion: () => setExamCompletion(null),
    changeMode,
    isAudioRetryPending,
    currentState,
    interimTranscript: conversationState.interimTranscript || displayTranscript,
    finalTranscript,
    isModelLoading,
    isVadReady,
    isTranscribing,
    isInitializing: isInitializing ?? false,
    initError: initError ?? null,
    micError: micError ?? null,
    clearMicError,
    setMockExamAction: (action: MockExamAction) => { nextExamActionRef.current = action; },
    ensureVoiceInitialized: ensureInitialized,
    prepareVoiceCapture: prepareMicrophoneAccess,
    releasePreparedVoiceCapture: releasePreparedMicrophone,
    startSession: initiateSession,
    endSession: terminateSession,
    sendTextMessage,
    loadOlderMessages,
    clearConversation: wipeConversationHistory,
    downloadTranscript: exportTranscriptFile,
    clearError: () => dispatch({ type: 'CLEAR_ERROR' }),
  };
}
