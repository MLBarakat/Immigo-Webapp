import { describe, it, expect, vi, beforeEach, afterEach, type Mocked } from 'vitest';
import { renderHook, act, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { useConversation } from '../useConversation';
import { ConversationContext, conversationReducer } from '../../context/conversationContextTypes';
import { ConversationProvider } from '../../context/ConversationContext';
import { useWhisper } from '../useWhisper';
import { ApiClient, ApiError } from '../../services/apiClient';
import { ChatPersistenceService } from '../../services/chatPersistenceService';
import { fetchDailyProgressStats } from '../../services/liveProgressService';
import { analytics } from '../../analytics';

vi.mock('../useWhisper', () => ({
  useWhisper: vi.fn(),
}));

vi.mock('../../analytics', () => ({
  analytics: {
    track: vi.fn(),
  },
}));

vi.mock('../../services/liveProgressService', () => ({
  fetchDailyProgressStats: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../services/chatPersistenceService', () => ({
  ChatPersistenceService: {
    createSession: vi.fn().mockResolvedValue(null),
    closeSession: vi.fn().mockResolvedValue(undefined),
    persistMessage: vi.fn().mockResolvedValue(null),
    loadRecentMessages: vi.fn().mockResolvedValue({ messages: [], hasMore: false, oldestCursor: null }),
    loadOlderMessages: vi.fn().mockResolvedValue({ messages: [], hasMore: false, oldestCursor: null }),
  },
}));

describe('Orchestration Hook Runtime Validation: useConversation', () => {
  // Functional execution context tracker references
  let mockDispatch: any;
  let mockStartRecording: any;
  let mockStopRecording: any;
  let mockApiClient: Mocked<ApiClient>;
  let mockAudioInstance: any;
  let mockContextValue: any;

  beforeEach(() => {
    sessionStorage.clear();
    mockDispatch = vi.fn((action: Parameters<typeof conversationReducer>[1]) => {
      if (action.type === 'SET_INTERIM_TRANSCRIPT') {
        mockContextValue.state = conversationReducer(mockContextValue.state, action);
      } else if (
        action.type === 'SEND_MESSAGE_START'
        || action.type === 'START_SESSION'
        || action.type === 'END_SESSION'
        || action.type === 'CLEAR_CONVERSATION'
      ) {
        mockContextValue.state = { ...mockContextValue.state, interimTranscript: '' };
      }
    });
    mockStartRecording = vi.fn();
    mockStopRecording = vi.fn();

    mockContextValue = {
      state: {
        conversationHistory: [],
        appStatus: 'idle',
        isSessionActive: false,
        sessionTime: 42,
        errorMessage: null,
      },
      dispatch: mockDispatch,
    };

    (useWhisper as any).mockReturnValue({
      currentState: 'IDLE',
      displayTranscript: '',
      finalTranscript: '',
      isModelLoading: false,
      isVadReady: true,
      isTranscribing: false,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      pauseVAD: vi.fn(),
      resumeVAD: vi.fn(),
      clearTranscript: vi.fn(),
    });

    // Construct a type-safe mock API Client instance mirror
    mockApiClient = {
      postTranscript: vi.fn(),
      postSessionStart: vi.fn(),
      postSilenceNudge: vi.fn(),
      completeSession: vi.fn().mockResolvedValue({
        date: '2026-10-12',
        reportMarkdown: 'Overall Session Summary\nYou answered ten questions.',
      }),
    } as unknown as Mocked<ApiClient>;
    vi.mocked(ChatPersistenceService.createSession).mockResolvedValue(null);

    // 1. FIXED: Inject a resilient, runtime mock for the global HTMLAudioElement tracking fixture
    mockAudioInstance = {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      currentTime: 0,
      onended: null as (() => void) | null,
      onerror: null,
    };
    
    vi.stubGlobal('Audio', vi.fn().mockImplementation(() => mockAudioInstance));
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-stream-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should keep text-mode responses silent', async () => {
    const syntheticBuffer = new ArrayBuffer(8);
    mockApiClient.postTranscript.mockResolvedValue({
      responseText: 'Welcome to the Immigo interaction matrix layer.',
      audioData: syntheticBuffer,
      verdict: null,
      nextItemId: null,
      nextQuestion: null,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );

    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });

    // Execute transmission prompt processing loops inside isolated context ticks
    await act(async () => {
      await result.current.sendTextMessage('Initialize secure system calibration sequence.');
    });

    // 2. FIXED: Assert absolute execution alignment matching echo suppression gates
    expect(mockStopRecording).not.toHaveBeenCalled();
    expect(mockAudioInstance.play).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'FINISH_ASSISTANT_RESPONSE' });
    });
  });

  it('opens the microphone without playing another opening response', async () => {
    mockApiClient.postSessionStart.mockResolvedValue({
      responseText: '',
      audioData: new ArrayBuffer(0),
      verdict: null,
      needsConfirmation: false,
      nextItemId: 'q-1',
      nextQuestion: 'Question one?',
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });

    await act(async () => {
      await result.current.startSession();
    });

    expect(mockAudioInstance.play).not.toHaveBeenCalled();
    expect(mockStartRecording).toHaveBeenCalledOnce();
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_STATUS', payload: 'listening' });
  });

  it('keeps a recognized user bubble visible across empty interim-transcript pauses', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result, rerender } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });

    (useWhisper as any).mockReturnValue({
      currentState: 'SPECULATIVE',
      displayTranscript: 'I think the answer is the executive branch',
      finalTranscript: '',
      isModelLoading: false,
      isVadReady: true,
      isTranscribing: false,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
    });
    rerender();
    await waitFor(() => {
      expect(result.current.interimTranscript).toBe('I think the answer is the executive branch');
    });

    (useWhisper as any).mockReturnValue({
      currentState: 'LISTENING',
      displayTranscript: '',
      finalTranscript: '',
      isModelLoading: false,
      isVadReady: true,
      isTranscribing: false,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
    });
    rerender();
    expect(result.current.interimTranscript).toBe('I think the answer is the executive branch');
  });

  it('generates and displays a committed progress report after every ten graded answers', async () => {
    mockContextValue.state.sessionId = 'report-session';
    let statsReadCount = 0;
    vi.mocked(fetchDailyProgressStats).mockImplementation(async () => ({
      answered: Math.max(0, statsReadCount++),
      correct: Math.max(0, statsReadCount - 1),
      incorrect: 0,
      partial: 0,
      accuracyPct: 100,
      missedItemIds: [],
    }));
    mockApiClient.postTranscript.mockResolvedValue({
      responseText: 'Correct. Next question.',
      audioData: new ArrayBuffer(0),
      verdict: 'correct',
      needsConfirmation: false,
      nextItemId: 'q-next',
      nextQuestion: 'Next question?',
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient, userId: 'user-1' }), { wrapper });

    for (let answer = 0; answer < 10; answer += 1) {
      await act(async () => {
        await result.current.sendTextMessage(`Answer ${answer + 1}`);
      });
    }

    await waitFor(() => expect(mockApiClient.completeSession).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
        type: 'ADD_STANDALONE_ASSISTANT_MESSAGE',
        payload: expect.objectContaining({
          content: expect.stringContaining('You answered ten questions.'),
        }),
      }));
    });
  });

  it('creates a reportable analytics session for text-only graded answers', async () => {
    vi.mocked(ChatPersistenceService.createSession).mockResolvedValue('text-session');
    let statsReadCount = 0;
    vi.mocked(fetchDailyProgressStats).mockImplementation(async () => ({
      answered: Math.max(0, statsReadCount++),
      correct: Math.max(0, statsReadCount - 1),
      incorrect: 0,
      partial: 0,
      accuracyPct: 100,
      missedItemIds: [],
    }));
    mockApiClient.postTranscript.mockResolvedValue({
      responseText: 'Correct. Next question.',
      audioData: new ArrayBuffer(0),
      verdict: 'correct',
      needsConfirmation: false,
      nextItemId: 'q-next',
      nextQuestion: 'Next question?',
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient, userId: 'user-1' }), { wrapper });

    for (let answer = 0; answer < 10; answer += 1) {
      await act(async () => {
        await result.current.sendTextMessage(`Text answer ${answer + 1}`);
      });
    }

    expect(ChatPersistenceService.createSession).toHaveBeenCalledOnce();
    expect(mockApiClient.postTranscript).toHaveBeenLastCalledWith(
      'Text answer 10',
      expect.any(Array),
      'text-session',
      'q-next',
      false,
      expect.any(Object),
    );
    expect(fetchDailyProgressStats).toHaveBeenCalledWith('user-1');
    expect(mockApiClient.postTranscript).toHaveBeenNthCalledWith(
      1,
      'Text answer 1',
      expect.any(Array),
      'text-session',
      null,
      false,
      expect.objectContaining({ openingResponse: true }),
    );
    expect(analytics.track).toHaveBeenCalledWith('session_started', { mode: 'text' });
    await waitFor(() => expect(mockApiClient.completeSession).toHaveBeenCalledWith('text-session'));
    expect(mockStartRecording).not.toHaveBeenCalled();
  });

  it('continues the same persisted session when voice is enabled after text practice', async () => {
    vi.mocked(ChatPersistenceService.createSession).mockResolvedValue('text-session');
    mockApiClient.postTranscript.mockResolvedValue({
      responseText: 'How many senators are there?',
      audioData: new ArrayBuffer(0),
      verdict: null,
      needsConfirmation: false,
      nextItemId: 'q-next',
      nextQuestion: 'How many senators are there?',
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient, userId: 'user-1' }), { wrapper });

    await act(async () => {
      await result.current.sendTextMessage('I am ready to practice');
    });
    await act(async () => {
      await result.current.startSession();
    });

    expect(ChatPersistenceService.createSession).toHaveBeenCalledOnce();
    expect(mockApiClient.postSessionStart).not.toHaveBeenCalled();
    expect(mockStartRecording).toHaveBeenCalledOnce();
  });

  it('ignores recognized Polly echo but stops playback for actual barging-in speech', async () => {
    const responseText = "Let's begin. How can people become United States citizens?";
    mockApiClient.postSessionStart.mockResolvedValue({
      responseText,
      audioData: new ArrayBuffer(8),
      verdict: null,
      needsConfirmation: false,
      nextItemId: 'q-1',
      nextQuestion: 'How can people become United States citizens?',
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result, rerender } = renderHook(
      () => useConversation({ apiClient: mockApiClient, bargeIn: 'balanced' }),
      { wrapper }
    );

    await act(async () => {
      await result.current.startSession();
    });

    (useWhisper as any).mockReturnValue({
      currentState: 'SPECULATIVE',
      displayTranscript: "Let's begin. How can people",
      finalTranscript: '',
      isModelLoading: false,
      isVadReady: true,
      isTranscribing: false,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
    });
    const echoSpeechStart = (useWhisper as any).mock.calls.at(-1)[0].onSpeechStart;
    act(() => echoSpeechStart());
    rerender();
    await act(async () => new Promise(resolve => setTimeout(resolve, 250)));
    expect(mockAudioInstance.pause).not.toHaveBeenCalled();

    (useWhisper as any).mockReturnValue({
      currentState: 'SPECULATIVE',
      displayTranscript: 'Wait, can you explain that?',
      finalTranscript: '',
      isModelLoading: false,
      isVadReady: true,
      isTranscribing: false,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
    });
    const userSpeechStart = (useWhisper as any).mock.calls.at(-1)[0].onSpeechStart;
    act(() => userSpeechStart());
    rerender();
    await waitFor(() => expect(mockAudioInstance.pause).toHaveBeenCalledOnce());
  });

  it('cancels an in-flight text response when the user sends an interrupting message', async () => {
    let firstSignal: AbortSignal | undefined;
    mockApiClient.postTranscript
      .mockImplementationOnce((_text, _window, _session, _item, _retry, options) => {
        firstSignal = options?.signal;
        return new Promise((_resolve, reject) => {
          firstSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      })
      .mockResolvedValueOnce({
        responseText: 'Interruption response',
        audioData: new ArrayBuffer(0),
        verdict: null,
        needsConfirmation: false,
        nextItemId: null,
        nextQuestion: null,
      });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });
    let firstTurn!: Promise<void>;

    await act(async () => {
      firstTurn = result.current.sendTextMessage('First message');
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.sendTextMessage('Please interrupt');
    });
    await act(async () => {
      await firstTurn;
    });

    expect(firstSignal?.aborted).toBe(true);
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'REMOVE_PENDING_ASSISTANT_MESSAGE',
    }));
  });

  it('restores a per-tab conversation snapshot before remote history finishes loading', async () => {
    const cachedMessage = {
      id: 'cached-message',
      role: 'user' as const,
      content: 'Saved text answer',
      timestamp: '2026-10-08T18:00:00.000Z',
    };
    sessionStorage.setItem('immigo_conversation_user-cache', JSON.stringify([cachedMessage]));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );

    renderHook(() => useConversation({ apiClient: null, userId: 'user-cache' }), { wrapper });

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'LOAD_HISTORICAL_MESSAGES',
        payload: {
          messages: [cachedMessage],
          hasMore: false,
          oldestCursor: null,
          replace: true,
        },
      });
    });
    expect(sessionStorage.getItem('immigo_conversation_user-cache')).toBe(JSON.stringify([cachedMessage]));
  });

  it('persists new text conversation turns in the current browser tab', async () => {
    mockApiClient.postTranscript.mockResolvedValue({
      responseText: 'A saved assistant reply',
      audioData: new ArrayBuffer(0),
      verdict: null,
      needsConfirmation: false,
      nextItemId: null,
      nextQuestion: null,
    });
    const { result } = renderHook(
      () => useConversation({ apiClient: mockApiClient, userId: 'user-session-cache' }),
      { wrapper: ConversationProvider }
    );

    await act(async () => {
      await result.current.sendTextMessage('A saved user answer');
    });
    await waitFor(() => {
      expect(result.current.conversationHistory.map(message => message.content)).toEqual([
        'A saved user answer',
        'A saved assistant reply',
      ]);
    });
    await waitFor(() => {
      expect(JSON.parse(sessionStorage.getItem('immigo_conversation_user-session-cache') ?? '[]')).toHaveLength(2);
    });
  });

  it('does not finalize an active session when the browser tab is hidden', () => {
    mockContextValue.state.isSessionActive = true;
    mockContextValue.state.sessionId = 'active-session';
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );

    renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mockApiClient.completeSession).not.toHaveBeenCalled();
  });

  it('should dispatch an atomic rollback object payload structure upon catching cloud proxy failures', async () => {
    mockContextValue.state.isSessionActive = true;

    // Inject a severe 500 internal gateway exception into the networking execution track
    const networkChaosException = new ApiError(
      'Cloud Proxy Execution Failure (Gateway Timeout Packet dropped)', 
      500, 
      { code: 'INTERNAL_ERROR' }
    );
    mockApiClient.postTranscript.mockRejectedValue(networkChaosException);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );

    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });

    await act(async () => {
      await result.current.sendTextMessage('Trigger state mutation sequence.');
    });

    // 3. FIXED: Validate compliance against our hardened object schema for history ledger rollbacks
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_STATUS',
      payload: 'error',
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SEND_MESSAGE_FAILURE',
      payload: expect.objectContaining({
        error: expect.stringContaining('Cloud Proxy Execution Failure'),
        userMessageId: expect.stringMatching(/^user-msg-/),
        assistantMessageId: expect.stringMatching(/^asst-msg-/),
      }),
    });

    // Ensure system recovers tracking loops gracefully even when network states break down
    expect(mockStartRecording).toHaveBeenCalledTimes(1);
  });

  it('should submit a committed speech transcript to the LLM automatically', async () => {
    mockApiClient.postTranscript.mockResolvedValue({
      responseText: 'Speech response',
      audioData: new ArrayBuffer(8),
      verdict: null,
      nextItemId: null,
      nextQuestion: null,
    });
    (useWhisper as any).mockReturnValue({
      currentState: 'LISTENING',
      displayTranscript: 'What is my status?',
      finalTranscript: 'What is my status?',
      isModelLoading: false,
      isVadReady: true,
      isTranscribing: false,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );

    renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });

    await waitFor(() => {
      expect(mockApiClient.postTranscript).toHaveBeenCalledWith(
        'What is my status?',
        [],
        undefined,
        null,
        false,
        expect.objectContaining({
          headers: expect.any(Object),
          simulationMode: 'standard',
          preferredLanguage: 'en-US',
        })
      );
    });
  });

  it('should submit the next speech utterance after the transcript is cleared', async () => {
    mockApiClient.postTranscript.mockResolvedValue({
      responseText: 'Speech response',
      audioData: new ArrayBuffer(8),
      verdict: null,
      nextItemId: 'q-001',
      nextQuestion: 'Practice question',
    });

    const emptyWhisperState = {
      currentState: 'LISTENING',
      displayTranscript: '',
      finalTranscript: '',
      isModelLoading: false,
      isVadReady: true,
      isTranscribing: false,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
    };
    (useWhisper as any).mockReturnValue(emptyWhisperState);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );

    const { rerender } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });

    (useWhisper as any).mockReturnValue({ ...emptyWhisperState, finalTranscript: 'First question' });
    await act(async () => rerender());
    await waitFor(() => expect(mockApiClient.postTranscript).toHaveBeenCalledTimes(1));

    (useWhisper as any).mockReturnValue(emptyWhisperState);
    await act(async () => rerender());

    (useWhisper as any).mockReturnValue({ ...emptyWhisperState, finalTranscript: 'Second question' });
    await act(async () => rerender());
    await waitFor(() => expect(mockApiClient.postTranscript).toHaveBeenCalledTimes(2));

    expect(mockApiClient.postTranscript).toHaveBeenLastCalledWith(
      'Second question',
      [],
      undefined,
      'q-001',
      false,
      expect.objectContaining({
        headers: expect.any(Object),
        simulationMode: 'standard',
        preferredLanguage: 'en-US',
      })
    );
  });

  it('uses a newly selected mode and language on subsequent turns in the same session', async () => {
    mockApiClient.postTranscript.mockResolvedValue({
      responseText: 'Tutor feedback',
      audioData: new ArrayBuffer(0),
      verdict: null,
      needsConfirmation: false,
      nextItemId: 'q-001',
      nextQuestion: 'Question?',
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    type ModeProps = { mode: 'standard' | 'practice' | 'study' };
    const { result, rerender } = renderHook(
      ({ mode }: ModeProps) => useConversation({
        apiClient: mockApiClient,
        simulationMode: mode,
        preferredLanguage: mode === 'study' ? 'es-ES' : 'en-US',
      }),
      { wrapper, initialProps: { mode: 'standard' } }
    );

    await act(async () => result.current.sendTextMessage('First answer'));
    rerender({ mode: 'study' });
    await act(async () => result.current.sendTextMessage('Second answer'));

    expect(mockApiClient.postTranscript).toHaveBeenNthCalledWith(
      1,
      'First answer',
      [],
      undefined,
      null,
      false,
      expect.objectContaining({ simulationMode: 'standard', preferredLanguage: 'en-US' })
    );
    expect(mockApiClient.postTranscript).toHaveBeenNthCalledWith(
      2,
      'Second answer',
      [],
      undefined,
      'q-001',
      false,
      expect.objectContaining({ simulationMode: 'study', preferredLanguage: 'es-ES' })
    );
  });

  it('cleans up active playback when the session ends', async () => {
    mockContextValue.state.isSessionActive = true;
    mockApiClient.postTranscript.mockResolvedValue({
      responseText: 'Speech response',
      audioData: new ArrayBuffer(8),
      verdict: null,
      nextItemId: null,
      nextQuestion: null,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );

    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });
    await act(async () => {
      await result.current.sendTextMessage('Start playback cleanup test.');
    });

    await act(async () => {
      await result.current.endSession();
    });

    expect(mockAudioInstance.pause).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-stream-url');
    expect(mockAudioInstance.onended).toBeNull();
  });

  it('parks an autoplay-blocked turn and completes it as text when the gesture retry also fails', async () => {
    mockContextValue.state.isSessionActive = true;
    const autoplayBlocked = new Error('autoplay blocked');
    autoplayBlocked.name = 'NotAllowedError';
    mockAudioInstance.play
      .mockRejectedValueOnce(autoplayBlocked)
      .mockRejectedValueOnce(autoplayBlocked);
    mockApiClient.postTranscript.mockResolvedValue({
      responseText: 'Speech response',
      audioData: new ArrayBuffer(8),
      verdict: null,
      nextItemId: null,
      nextQuestion: null,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );

    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });
    await act(async () => {
      await result.current.sendTextMessage('Start rejected playback test.');
    });

    // The turn is parked awaiting a user gesture — not abandoned: the banner
    // is up and the audio URL is still held.
    await waitFor(() => expect(result.current.isAudioRetryPending).toBe(true));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    // The next user gesture replays the parked audio inside the gesture; when
    // iOS blocks that too, the turn finally degrades to text-only.
    await act(async () => {
      fireEvent.pointerUp(document);
    });
    await waitFor(() => expect(result.current.isAudioRetryPending).toBe(false));
    expect(mockAudioInstance.play).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-stream-url');
    expect(mockAudioInstance.pause).toHaveBeenCalledTimes(1);
  });
});