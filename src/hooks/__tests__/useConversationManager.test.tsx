import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConversationManager } from '../useConversationManager';
import { useConversation } from '../../context/ConversationContext';
import { useWhisper } from '../useWhisper';
import { ApiClient, ApiError } from '../../services/apiClient';

// Formally mock the state context hooks and hardware acquisition modules
vi.mock('../../context/ConversationContext', () => ({
  useConversation: vi.fn(),
}));

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

describe('Orchestration Hook Runtime Validation: useConversationManager', () => {
  // Functional execution context tracker references
  let mockDispatch: any;
  let mockStartRecording: any;
  let mockStopRecording: any;
  let mockApiClient: vi.Mocked<ApiClient>;
  let mockAudioInstance: any;

  beforeEach(() => {
    mockDispatch = vi.fn();
    mockStartRecording = vi.fn();
    mockStopRecording = vi.fn();

    // Seed mock context states matching our authoritative FSM definitions
    (useConversation as any).mockReturnValue({
      state: {
        conversationHistory: [],
        appStatus: 'idle',
        isSessionActive: true,
        sessionTime: 42,
        errorMessage: null,
      },
      dispatch: mockDispatch,
    });

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
    } as unknown as vi.Mocked<ApiClient>;

    // 1. FIXED: Inject a resilient, runtime mock for the global HTMLAudioElement tracking fixture
    mockAudioInstance = {
      play: vi.fn().mockResolvedValue(undefined),
      onended: null as (() => void) | null,
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

  it('should enforce the echo suppression lifecycle accurately during standard transcript transactions', async () => {
    const syntheticBuffer = new ArrayBuffer(8);
    mockApiClient.postTranscript.mockResolvedValue({
      responseText: 'Welcome to the Immigo interaction matrix layer.',
      audioData: syntheticBuffer,
    });

    const { result } = renderHook(() => useConversationManager({ apiClient: mockApiClient }));

    // Execute transmission prompt processing loops inside isolated context ticks
    await act(async () => {
      await result.current.sendTextMessage('Initialize secure system calibration sequence.');
    });

    // 2. FIXED: Assert absolute execution alignment matching echo suppression gates
    expect(mockStopRecording).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_STATUS',
      payload: 'speaking',
    });
    
    expect(mockAudioInstance.play).toHaveBeenCalledTimes(1);

    // Simulate standard audio element playback termination hooks natively
    await act(async () => {
      if (mockAudioInstance.onended) {
        mockAudioInstance.onended();
      }
    });

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'FINISH_ASSISTANT_RESPONSE' });
    expect(mockStartRecording).toHaveBeenCalledTimes(1); // Mute gate successfully unlocked
  });

  it('should dispatch an atomic rollback object payload structure upon catching cloud proxy failures', async () => {
    // Inject a severe 500 internal gateway exception into the networking execution track
    const networkChaosException = new ApiError(
      'Cloud Proxy Execution Failure (Gateway Timeout Packet dropped)', 
      500, 
      { code: 'INTERNAL_ERROR' }
    );
    mockApiClient.postTranscript.mockRejectedValue(networkChaosException);

    const { result } = renderHook(() => useConversationManager({ apiClient: mockApiClient }));

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
});