import { describe, it, expect, vi, beforeEach, afterEach, type Mocked } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { useConversation } from '../useConversation';
import { ConversationContext } from '../../context/conversationContextTypes';
import { ConversationProvider } from '../../context/ConversationContext';
import { useWhisper } from '../useWhisper';
import { ApiClient, ApiError } from '../../services/apiClient';

vi.mock('../useWhisper', () => ({
  useWhisper: vi.fn(),
}));

vi.mock('../../analytics', () => ({
  analytics: {
    track: vi.fn(),
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
    mockDispatch = vi.fn();
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
      modelLoadingProgress: 100,
      isTranscribing: false,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
    });

    // Construct a type-safe mock API Client instance mirror
    mockApiClient = {
      postTranscript: vi.fn(),
      postSessionStart: vi.fn(),
      completeSession: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<ApiClient>;

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
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'FINISH_ASSISTANT_RESPONSE' });
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
    expect(result.current.conversationHistory.map(message => message.content)).toEqual([
      'A saved user answer',
      'A saved assistant reply',
    ]);
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
      modelLoadingProgress: 100,
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
      modelLoadingProgress: 100,
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

  it('revokes the audio URL when playback is rejected', async () => {
    mockContextValue.state.isSessionActive = true;
    mockAudioInstance.play.mockRejectedValueOnce(new Error('autoplay blocked'));
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

    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-stream-url'));
    expect(mockAudioInstance.pause).toHaveBeenCalledTimes(1);
  });
});