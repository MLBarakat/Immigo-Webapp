// src/components/__tests__/VoiceHub.test.tsx

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { VoiceHub } from '../VoiceHub';

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
    // Use virtual time configurations to ensure robust execution spacing
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should render standard textual labels and accessibility markup accurately when idle', () => {
    render(
      <VoiceHub
        status="idle"
        isSessionActive={false}
        sessionTime={0}
        onStartSession={mockStartSession}
        onEndSession={mockEndSession}
      />
    );

    const interactiveButton = screen.getByRole('button', { name: /start voice recording session/i });
    expect(interactiveButton).toBeInTheDocument();
    expect(interactiveButton).not.toBeDisabled();
    
    // Validate structural WAI-ARIA compliance attributes
    expect(interactiveButton).toHaveAttribute('aria-busy', 'false');
    expect(interactiveButton).toHaveAttribute('aria-live', 'polite');
    
    const operationalStatusLabel = screen.getByRole('status');
    expect(operationalStatusLabel).toHaveTextContent(/^Ready$/);
    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  it('should correctly format internal numeric clock entries into legible string formats', () => {
    render(
      <VoiceHub
        status="listening"
        isSessionActive={true}
        sessionTime={125} // Maps directly to 2 minutes and 5 seconds
        onStartSession={mockStartSession}
        onEndSession={mockEndSession}
      />
    );

    expect(screen.getByText('02:05')).toBeInTheDocument();
  });

  it('should block manual user selection triggers when backend processing loops are running', () => {
    render(
      <VoiceHub
        status="processing"
        isSessionActive={true}
        sessionTime={10}
        onStartSession={mockStartSession}
        onEndSession={mockEndSession}
      />
    );

    const interactiveButton = screen.getByRole('button', { name: /stop voice recording session/i });
    
    // Assert structural lock states are correctly registered by the browser DOM layer
    expect(interactiveButton).toBeDisabled();
    expect(interactiveButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(/^Thinking\.\.\.$/);

    // Verify interaction inputs are dropped when clicked during an active inference lock
    fireEvent.click(interactiveButton);
    expect(mockStartSession).not.toHaveBeenCalled();
    expect(mockEndSession).not.toHaveBeenCalled();
  });

  it('should suppress rapid click spamming patterns to safeguard background audio recording channels', () => {
    render(
      <VoiceHub
        status="idle"
        isSessionActive={false}
        sessionTime={0}
        onStartSession={mockStartSession}
        onEndSession={mockEndSession}
      />
    );

    const interactiveButton = screen.getByRole('button', { name: /start voice recording session/i });

    // Simulate rapid, consecutive user click inputs
    fireEvent.click(interactiveButton);
    fireEvent.click(interactiveButton);
    fireEvent.click(interactiveButton);

    // Verify the system processes the initial click but drops subsequent rapid inputs
    expect(mockStartSession).toHaveBeenCalledTimes(1);
    expect(mockEndSession).not.toHaveBeenCalled();

    // Advance virtual clocks past the protective 800 ms interaction guard window
    vi.advanceTimersByTime(850);

    // Verify inputs are accepted normally after the safety window expires
    fireEvent.click(interactiveButton);
    expect(mockStartSession).toHaveBeenCalledTimes(2);
  });
});