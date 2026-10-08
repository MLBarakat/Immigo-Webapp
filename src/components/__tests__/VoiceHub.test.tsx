import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { VoiceHub } from '../VoiceHub';
import { MIC_CONSENT_VERSION } from '../../utils/micConsent';

// Mock the nested sub-component to prevent rendering dependencies from polluting tests
vi.mock('../AnimatedStatusButton', () => ({
  AnimatedStatusButton: vi.fn(() => <div data-testid="mock-animated-button" />),
}));

vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Interaction Viewport Validation: VoiceHub', () => {
  let mockStartSession: vi.Mock;
  let mockEndSession: vi.Mock;

  beforeEach(() => {
    mockStartSession = vi.fn();
    mockEndSession = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('renders a compact microphone control without status or timer text', () => {
    render(
      <VoiceHub
        status="idle"
        isSessionActive={false}
        onStartSession={mockStartSession}
        onEndSession={mockEndSession}
      />
    );

    const interactiveButton = screen.getByRole('button', { name: /start voice recording session/i }) as HTMLButtonElement;
    expect(interactiveButton).not.toBeNull();
    expect(interactiveButton.disabled).toBe(false);
    
    // Validate structural WAI-ARIA compliance attributes
    expect(interactiveButton.getAttribute('aria-busy')).toBe('false');
    expect(interactiveButton.getAttribute('aria-live')).toBe('polite');
    expect(interactiveButton.className).toContain('w-11');
    expect(interactiveButton.className).toContain('h-11');
    expect(interactiveButton.className).toContain('rounded-full');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('00:00')).toBeNull();
  });

  it('should block manual user selection triggers when backend processing loops are running', () => {
    render(
      <VoiceHub
        status="processing"
        isSessionActive={true}
        onStartSession={mockStartSession}
        onEndSession={mockEndSession}
      />
    );

    const interactiveButton = screen.getByRole('button', { name: /stop voice recording session/i }) as HTMLButtonElement;
    
    // Assert structural lock states are correctly registered by the browser DOM layer
    expect(interactiveButton.disabled).toBe(true);
    expect(interactiveButton.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('status')).toBeNull();

    // Verify interaction inputs are dropped when clicked during an active inference lock
    fireEvent.click(interactiveButton);
    expect(mockStartSession).not.toHaveBeenCalled();
    expect(mockEndSession).not.toHaveBeenCalled();
  });

  it('should suppress rapid click spamming patterns to safeguard background audio recording channels', () => {
    localStorage.setItem('immigo_mic_consent_version', MIC_CONSENT_VERSION);
    let mockTime = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

    render(
      <VoiceHub
        status="idle"
        isSessionActive={false}
        onStartSession={mockStartSession}
        onEndSession={mockEndSession}
      />
    );

    const interactiveButton = screen.getByRole('button', { name: /start voice recording session/i });

    // Simulate rapid, consecutive user click inputs
    fireEvent.click(interactiveButton);
    mockTime += 100;
    fireEvent.click(interactiveButton);
    mockTime += 100;
    fireEvent.click(interactiveButton);

    // Verify the system processes the initial click but drops subsequent rapid inputs
    expect(mockStartSession).toHaveBeenCalledTimes(1);
    expect(mockEndSession).not.toHaveBeenCalled();

    // Advance virtual clocks past the protective 800 ms interaction guard window
    mockTime += 1000;

    // Verify inputs are accepted normally after the safety window expires
    fireEvent.click(interactiveButton);
    expect(mockStartSession).toHaveBeenCalledTimes(2);
  });
});