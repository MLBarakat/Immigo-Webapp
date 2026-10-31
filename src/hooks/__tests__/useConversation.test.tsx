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
import { MockExamService } from '../../services/mockExamService';
import { analytics } from '../../analytics';

type TranscriptResponse = Awaited<ReturnType<ApiClient['postTranscript']>>;

const transcriptResponse = (overrides: Partial<TranscriptResponse> = {}): TranscriptResponse => ({
  responseText: '',
  audioData: new ArrayBuffer(0),
  verdict: null,
  needsConfirmation: false,
  nextItemId: null,
  nextQuestion: null,
  assistantSegments: [],
  examRunId: null,
  examCompleted: false,
  examReport: null,
  examReviewId: null,
  examStage: null,
  modeGoalPending: false,
  ...overrides,
});

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

vi.mock('../../services/mockExamService', () => ({
  MockExamService: {
    getLatestInProgress: vi.fn().mockResolvedValue(null),
  },
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
    getDeviceLocalDate: vi.fn(() => '2026-10-26'),
    getSessionDate: vi.fn(() => '2026-10-26'),
    getOrCreateDailySession: vi.fn().mockResolvedValue({ id: 'daily-session', current_item_id: null, mode_goal_pending: false, current_mode: 'standard', test_version: '2020', include_english_simulation: false }),
    saveDailySessionState: vi.fn().mockResolvedValue(undefined),
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
    mockStartRecording = vi.fn().mockResolvedValue(true);
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
    vi.mocked(MockExamService.getLatestInProgress).mockResolvedValue(null);

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

  it('demotes a listening status to error once a mic failure is known', async () => {
    // Reducer paths that settle a turn restore 'listening'; that restoration
    // must not stand while the mic is known to be unavailable.
    mockContextValue.state = { ...mockContextValue.state, appStatus: 'listening', isSessionActive: true };
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
      micError: 'Microphone access is needed for voice practice.',
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_STATUS', payload: 'error' });
    });
  });

  it('should keep text-mode responses silent', async () => {
    const syntheticBuffer = new ArrayBuffer(8);
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'Welcome to the Immigo interaction matrix layer.',
      audioData: syntheticBuffer,
    }));

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
    // Text-mode answers render in full (no typewriter); the turn still settles.
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'FINISH_ASSISTANT_RESPONSE' });
    }, { timeout: 4000 });
  });

  it('opens the microphone without playing another opening response', async () => {
    mockApiClient.postSessionStart.mockResolvedValue(transcriptResponse({
      nextItemId: 'q-1',
      nextQuestion: 'Question one?',
    }));
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

  it('does not report listening when the microphone cannot be acquired', async () => {
    // The mic is never guaranteed on this attempt (permission denied / dead
    // device). The conversation status must NOT flip to listening.
    mockStartRecording.mockResolvedValueOnce(false);
    mockApiClient.postSessionStart.mockResolvedValue(transcriptResponse({
      nextItemId: 'q-1',
      nextQuestion: 'Question one?',
    }));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });

    await act(async () => {
      await result.current.startSession();
    });

    expect(mockStartRecording).toHaveBeenCalledOnce();
    expect(mockDispatch).not.toHaveBeenCalledWith({ type: 'SET_STATUS', payload: 'listening' });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_STATUS', payload: 'error' });
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
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'Correct. Next question.',
      verdict: 'correct',
      nextItemId: 'q-next',
      nextQuestion: 'Next question?',
    }));

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
    vi.mocked(ChatPersistenceService.getOrCreateDailySession).mockResolvedValue({
      id: 'daily-session',
      current_item_id: 'q-next',
      mode_goal_pending: false,
      current_mode: 'standard',
      test_version: '2020',
      include_english_simulation: false,
      local_date: '2026-10-26',
      local_timezone: 'UTC',
    });
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
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'Correct. Next question.',
      verdict: 'correct',
      nextItemId: 'q-next',
      nextQuestion: 'Next question?',
    }));
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

    expect(ChatPersistenceService.getOrCreateDailySession).toHaveBeenCalled();
    expect(mockApiClient.postTranscript).toHaveBeenLastCalledWith(
      'Text answer 10',
      expect.any(Array),
      'daily-session',
      'q-next',
      false,
      expect.any(Object),
    );
    expect(fetchDailyProgressStats).toHaveBeenCalledWith('user-1', 'UTC');
    expect(mockApiClient.postTranscript).toHaveBeenNthCalledWith(
      1,
      'Text answer 1',
      expect.any(Array),
      'daily-session',
      'q-next',
      false,
      expect.objectContaining({ openingResponse: true }),
    );
    expect(analytics.track).toHaveBeenCalledWith('session_started', { mode: 'text' });
    await waitFor(() => expect(mockApiClient.completeSession).toHaveBeenCalledWith('daily-session'));
    expect(mockStartRecording).not.toHaveBeenCalled();
  });

  it('continues the same persisted session when voice is enabled after text practice', async () => {
    vi.mocked(ChatPersistenceService.createSession).mockResolvedValue('text-session');
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'How many senators are there?',
      nextItemId: 'q-next',
      nextQuestion: 'How many senators are there?',
    }));
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

    expect(ChatPersistenceService.getOrCreateDailySession).toHaveBeenCalled();
    expect(mockApiClient.postSessionStart).not.toHaveBeenCalled();
    expect(mockStartRecording).toHaveBeenCalledOnce();
  });

  it('ignores recognized Polly echo but stops playback for actual barging-in speech', async () => {
    const responseText = "Let's begin. How can people become United States citizens?";
    mockApiClient.postSessionStart.mockResolvedValue(transcriptResponse({
      responseText,
      audioData: new ArrayBuffer(8),
      nextItemId: 'q-1',
      nextQuestion: 'How can people become United States citizens?',
    }));
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

  it('renders a text-mode answer in full without the word typewriter', async () => {
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'First part.\nNext question?',
      assistantSegments: ['First part.', 'Next question?'],
    }));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });

    await act(async () => {
      await result.current.sendTextMessage('A typed answer');
    });

    // Typing is not voice: the whole answer appears at once, no chunking.
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'ADD_ASSISTANT_MESSAGE',
      payload: { assistantMessageId: expect.any(String), content: 'First part.' },
    });
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'ADD_STANDALONE_ASSISTANT_MESSAGE',
      payload: expect.objectContaining({ content: 'Next question?' }),
    });
    expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'RECEIVE_ASSISTANT_CHUNK',
    }));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'FINISH_ASSISTANT_RESPONSE' });
  });

  it('reveals the next-question bubble only when its turn in the Polly track arrives', async () => {
    mockContextValue.state = { ...mockContextValue.state, isSessionActive: true };
    mockAudioInstance.duration = 4;
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'First part.\nNext question?',
      assistantSegments: ['First part.', 'Next question?'],
      audioData: new ArrayBuffer(8),
    }));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });

    await act(async () => {
      await result.current.sendTextMessage('A spoken answer', 'voice');
    });

    // At the start of the track only the reply bubble exists; the question
    // bubble must not pop up ahead of the voice.
    await act(async () => new Promise(resolve => setTimeout(resolve, 70)));
    expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'ADD_STANDALONE_ASSISTANT_MESSAGE',
    }));

    // Jump near the end of the shared Polly track: the question bubble is
    // created now and keeps receiving word chunks for its own segment.
    mockAudioInstance.currentTime = 3.9;
    await act(async () => new Promise(resolve => setTimeout(resolve, 150)));
    const standalone = (mockDispatch.mock.calls as Array<[any]>)
      .map(([action]) => action)
      .find(action => action.type === 'ADD_STANDALONE_ASSISTANT_MESSAGE');
    expect(standalone).toBeDefined();
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'RECEIVE_ASSISTANT_CHUNK',
      payload: { assistantMessageId: standalone.payload.assistantMessageId, content: expect.any(String) },
    });

    act(() => {
      mockAudioInstance.onended?.();
    });
  });

  it('stops Polly and settles the answer when the user types during playback', async () => {
    mockApiClient.postSessionStart.mockResolvedValue(transcriptResponse({
      responseText: 'Welcome. Tell me about your day.',
      audioData: new ArrayBuffer(8),
      nextItemId: 'q-1',
    }));
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'Understood.',
    }));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });

    await act(async () => {
      await result.current.startSession();
    });
    expect(mockAudioInstance.play).toHaveBeenCalledOnce();

    await act(async () => {
      await result.current.sendTextMessage('Hold on, let me type this instead.');
    });

    // Text is a barge-in: audible Polly is cut and the turn settles.
    expect(mockAudioInstance.pause).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'FINISH_ASSISTANT_RESPONSE' });
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'ADD_ASSISTANT_MESSAGE',
      payload: { assistantMessageId: expect.any(String), content: 'Understood.' },
    });
  });

  it('silences Polly when voice mode is deactivated but finishes the answer as a typewriter, then settles idle', async () => {
    mockAudioInstance.duration = 4;
    mockApiClient.postSessionStart.mockResolvedValue(transcriptResponse({
      responseText: 'One two three four five six.',
      audioData: new ArrayBuffer(8),
      nextItemId: 'q-1',
    }));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });

    await act(async () => {
      await result.current.startSession();
    });
    const dispatchedActions = (): Array<{ type: string; payload?: any }> =>
      (mockDispatch.mock.calls as Array<[any]>).map(([action]) => action);
    const chunksBeforeStop = dispatchedActions()
      .filter(action => action.type === 'RECEIVE_ASSISTANT_CHUNK').length;

    act(() => {
      result.current.stopVoiceMode();
    });

    // Mic off silences Polly immediately, without truncating the answer.
    expect(mockAudioInstance.pause).toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalledWith({ type: 'FINISH_ASSISTANT_RESPONSE' });

    // The remaining words keep typing themselves out at a reading pace…
    await waitFor(() => {
      const chunksAfterStop = dispatchedActions()
        .filter(action => action.type === 'RECEIVE_ASSISTANT_CHUNK').length;
      expect(chunksAfterStop).toBeGreaterThan(chunksBeforeStop);
    }, { timeout: 2000 });

    // …and the turn settles as idle once the last word lands.
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'FINISH_ASSISTANT_RESPONSE' });
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_STATUS', payload: 'idle' });
    }, { timeout: 3000 });
  });

  it('loads recent history across sessions and paginates older pages without a session filter', async () => {
    vi.mocked(ChatPersistenceService.loadRecentMessages).mockResolvedValueOnce({
      messages: [
        { id: 'm-1', role: 'user', content: 'Hi', created_at: '2026-10-26T09:00:00.000Z' },
        { id: 'm-2', role: 'assistant', content: 'Hello', created_at: '2026-10-26T09:00:01.000Z' },
      ],
      hasMore: true,
      oldestCursor: '2026-10-26T09:00:00.000Z',
    } as Awaited<ReturnType<typeof ChatPersistenceService.loadRecentMessages>>);

    const { result } = renderHook(
      () => useConversation({ apiClient: mockApiClient, userId: 'user-history' }),
      { wrapper: ConversationProvider }
    );

    await waitFor(() => {
      expect(ChatPersistenceService.loadRecentMessages).toHaveBeenCalledWith('user-history', 50);
      expect(result.current.conversationHistory).toHaveLength(2);
    });
    expect(ChatPersistenceService.loadRecentMessages).not.toHaveBeenCalledWith(
      'user-history', 50, expect.anything()
    );

    await act(async () => {
      await result.current.loadOlderMessages();
    });

    expect(ChatPersistenceService.loadOlderMessages).toHaveBeenCalledWith(
      'user-history',
      '2026-10-26T09:00:00.000Z',
      25
    );
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
      .mockResolvedValueOnce(transcriptResponse({
        responseText: 'Interruption response',
      }));

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
    sessionStorage.setItem('immigo_conversation_user-cache_2026-10-26', JSON.stringify([cachedMessage]));
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
    expect(sessionStorage.getItem('immigo_conversation_user-cache_2026-10-26')).toBe(JSON.stringify([cachedMessage]));
  });

  it('fetches the welcome banner only once when StrictMode double-mounts the effect', async () => {
    const storageKey = 'welcome-banner-shown:user-welcome:2026-10-26';
    localStorage.removeItem(storageKey);
    let resolveBanner!: (value: { message: string; isNewUser: boolean }) => void;
    mockApiClient.fetchWelcomeBanner = vi.fn(
      () => new Promise<{ message: string; isNewUser: boolean }>((resolve) => {
        resolveBanner = resolve;
      })
    );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <React.StrictMode>
        <ConversationContext.Provider value={mockContextValue}>
          {children}
        </ConversationContext.Provider>
      </React.StrictMode>
    );

    renderHook(
      () => useConversation({ apiClient: mockApiClient, userId: 'user-welcome', accountTimezone: 'UTC' }),
      { wrapper }
    );

    // The deployed bundle has shipped React's development runtime, so
    // StrictMode's setup -> cleanup -> setup cycle is real in the field. The
    // hydration layout effect used to clear the one-shot guard in between,
    // producing a second POST 1 ms after the first.
    await waitFor(() => expect(mockApiClient.fetchWelcomeBanner).toHaveBeenCalledTimes(1));
    expect(mockApiClient.fetchWelcomeBanner).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveBanner({ message: 'Welcome back!', isNewUser: true });
      await Promise.resolve();
    });

    expect(mockApiClient.fetchWelcomeBanner).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ADD_ASSISTANT_MESSAGE',
      payload: expect.objectContaining({ content: 'Welcome back!' }),
    }));
    expect(localStorage.getItem(storageKey)).toBe('done');
  });

  it('offers continue/new exam choices in the welcome banner instead of a pop-up', async () => {
    vi.mocked(MockExamService.getLatestInProgress).mockResolvedValue({
      id: 'exam-1',
      test_version: '2020',
      current_index: 12,
      question_ids: Array.from({ length: 20 }, (_, index) => `q-${index}`),
      correct_count: 10,
      incorrect_count: 2,
      include_english_simulation: false,
      english_stage: 'none',
    });
    const storageKey = 'welcome-banner-shown:user-exam:2026-10-26';
    localStorage.removeItem(storageKey);
    mockApiClient.fetchWelcomeBanner = vi.fn().mockResolvedValue({ message: 'Welcome back!', isNewUser: false });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    renderHook(
      () => useConversation({ apiClient: mockApiClient, userId: 'user-exam', accountTimezone: 'UTC' }),
      { wrapper }
    );

    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ADD_ASSISTANT_MESSAGE',
      payload: expect.objectContaining({
        content: expect.stringContaining('8 civics questions are left'),
        actions: expect.arrayContaining([
          expect.objectContaining({ examAction: 'resume', label: 'Continue exam' }),
          expect.objectContaining({ examAction: 'new', label: 'Start a new exam' }),
        ]),
      }),
    })));
    expect(MockExamService.getLatestInProgress).toHaveBeenCalledWith('user-exam', '2020');
  });

  it('activates voice mode without starting or resuming a mock exam', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result } = renderHook(
      () => useConversation({ apiClient: mockApiClient, userId: 'user-voice' }),
      { wrapper }
    );

    await act(async () => {
      await result.current.startVoiceMode();
    });

    expect(mockApiClient.postSessionStart).not.toHaveBeenCalled();
    expect(mockApiClient.postTranscript).not.toHaveBeenCalled();
    expect(mockStartRecording).toHaveBeenCalledOnce();
  });

  it('deactivates voice mode without closing the conversation or the current exam', async () => {
    mockContextValue.state = {
      ...mockContextValue.state,
      isSessionActive: true,
      sessionId: 'active-session',
    };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result } = renderHook(
      () => useConversation({ apiClient: mockApiClient, userId: 'user-voice' }),
      { wrapper }
    );

    act(() => {
      result.current.stopVoiceMode();
    });

    expect(mockStopRecording).toHaveBeenCalledOnce();
    expect(mockApiClient.completeSession).not.toHaveBeenCalled();
    expect(ChatPersistenceService.closeSession).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalledWith({ type: 'END_SESSION' });
  });

  it('starts the chosen exam from the welcome card with an explicit exam action', async () => {
    mockApiClient.postSessionStart.mockResolvedValue(transcriptResponse({
      nextItemId: 'q-1',
      nextQuestion: 'Question one?',
    }));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );
    const { result } = renderHook(
      () => useConversation({ apiClient: mockApiClient, userId: 'user-exam-choice' }),
      { wrapper }
    );

    await act(async () => {
      await result.current.chooseWelcomeAction('resume', 'welcome-message');
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'RESOLVE_MESSAGE_ACTIONS',
      payload: { messageId: 'welcome-message' },
    });
    expect(mockApiClient.postSessionStart).toHaveBeenCalledWith(
      'daily-session',
      expect.objectContaining({ examAction: 'resume', simulationMode: 'standard' })
    );
  });

  it('persists new text conversation turns in the current browser tab', async () => {
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'A saved assistant reply',
    }));
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
      expect(JSON.parse(sessionStorage.getItem('immigo_conversation_user-session-cache_2026-10-26') ?? '[]')).toHaveLength(2);
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
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'Speech response',
      audioData: new ArrayBuffer(8),
    }));
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
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'Speech response',
      audioData: new ArrayBuffer(8),
      nextItemId: 'q-001',
      nextQuestion: 'Practice question',
    }));

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
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'Tutor feedback',
      nextItemId: 'q-001',
      nextQuestion: 'Question?',
    }));
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
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'Speech response',
      audioData: new ArrayBuffer(8),
    }));

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
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'Speech response',
      audioData: new ArrayBuffer(8),
    }));

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

  it('recovers a parked autoplay-blocked turn when the gesture replay succeeds', async () => {
    mockContextValue.state.isSessionActive = true;
    const autoplayBlocked = new Error('autoplay blocked');
    autoplayBlocked.name = 'NotAllowedError';
    mockAudioInstance.play
      .mockRejectedValueOnce(autoplayBlocked)
      .mockResolvedValueOnce(undefined);
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'Speech response',
      audioData: new ArrayBuffer(8),
    }));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );

    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });
    await act(async () => {
      await result.current.sendTextMessage('Start parked recovery test.');
    });

    await waitFor(() => expect(result.current.isAudioRetryPending).toBe(true));

    // A real user gesture replays the parked audio inside the gesture and the
    // turn is RECOVERED — it must not degrade to text or revoke the audio.
    await act(async () => {
      fireEvent.pointerUp(document);
    });
    await waitFor(() => expect(result.current.isAudioRetryPending).toBe(false));
    expect(mockAudioInstance.play).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('dismisses a parked turn on session end so a later gesture cannot replay it', async () => {
    mockContextValue.state.isSessionActive = true;
    const autoplayBlocked = new Error('autoplay blocked');
    autoplayBlocked.name = 'NotAllowedError';
    mockAudioInstance.play.mockRejectedValueOnce(autoplayBlocked);
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'Speech response',
      audioData: new ArrayBuffer(8),
    }));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );

    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });
    await act(async () => {
      await result.current.sendTextMessage('Start parked dismissal test.');
    });
    await waitFor(() => expect(result.current.isAudioRetryPending).toBe(true));

    // Barge-in / session teardown dismisses the parked turn first.
    await act(async () => {
      await result.current.endSession();
    });
    expect(result.current.isAudioRetryPending).toBe(false);

    // A stale gesture arriving after teardown must NOT resurrect playback.
    const playCallsAfterEnd = mockAudioInstance.play.mock.calls.length;
    await act(async () => {
      fireEvent.pointerUp(document);
    });
    expect(mockAudioInstance.play.mock.calls.length).toBe(playCallsAfterEnd);
  });

  it('degrades a parked turn to text when no gesture arrives before the timeout', async () => {
    vi.useFakeTimers();
    try {
      mockContextValue.state.isSessionActive = true;
      const autoplayBlocked = new Error('autoplay blocked');
      autoplayBlocked.name = 'NotAllowedError';
      mockAudioInstance.play.mockRejectedValueOnce(autoplayBlocked);
      mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
        responseText: 'Speech response',
        audioData: new ArrayBuffer(8),
      }));

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConversationContext.Provider value={mockContextValue}>
          {children}
        </ConversationContext.Provider>
      );

      const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });
      await act(async () => {
        await result.current.sendTextMessage('Start parked timeout test.');
      });
      expect(result.current.isAudioRetryPending).toBe(true);

      // Never-worse-than-before contract: after the retry window the turn
      // falls back to the previous text-only completion.
      await act(async () => {
        vi.advanceTimersByTime(20_000);
      });
      expect(result.current.isAudioRetryPending).toBe(false);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-stream-url');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not park a playback failure that is not an autoplay block', async () => {
    // Desktop-shape failure: a generic media error must take the immediate
    // cleanup path, never the gesture-retry parking flow.
    mockContextValue.state.isSessionActive = true;
    mockAudioInstance.play.mockRejectedValueOnce(new Error('decode failure'));
    mockApiClient.postTranscript.mockResolvedValue(transcriptResponse({
      responseText: 'Speech response',
      audioData: new ArrayBuffer(8),
    }));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConversationContext.Provider value={mockContextValue}>
        {children}
      </ConversationContext.Provider>
    );

    const { result } = renderHook(() => useConversation({ apiClient: mockApiClient }), { wrapper });
    await act(async () => {
      await result.current.sendTextMessage('Start non-autoplay failure test.');
    });

    expect(result.current.isAudioRetryPending).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-stream-url');
  });
});
