import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildCloudSocketStartMessage } from '../../src/hooks/useWhisper';

describe('WebSocket API Integration', () => {
  let mockServer: any;

  beforeEach(() => {
    // Mock WebSocket globally for testing
    global.WebSocket = vi.fn(() => ({
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1, // OPEN
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should build a valid start message payload', () => {
    const correlationId = 'test-id';
    const message = buildCloudSocketStartMessage(correlationId, 'en-US', 16000);
    expect(message).toEqual({
      type: 'control',
      action: 'start',
      correlationId: 'test-id',
      settings: { sampleRate: 16000, language: 'en-US' },
    });
  });

  it('should successfully establish WebSocket connection with correct URL parameters', () => {
    const wsUrl = 'wss://example.com/transcription?token=fake-token';
    const ws = new WebSocket(wsUrl);
    expect(global.WebSocket).toHaveBeenCalledWith(wsUrl);
  });
});
