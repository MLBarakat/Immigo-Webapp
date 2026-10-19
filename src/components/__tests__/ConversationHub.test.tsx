import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { ConversationHub } from '../ConversationHub';

// The status button is decorative here; suppress its animation internals.
vi.mock('../AnimatedStatusButton', () => ({
  AnimatedStatusButton: vi.fn(() => <div data-testid="mock-animated-button" />),
}));

const renderHub = (props: Partial<Parameters<typeof ConversationHub>[0]> = {}) =>
  render(
    <ConversationHub
      status="idle"
      isSessionActive={false}
      sessionTime={0}
      errorMessage={null}
      onStartSession={vi.fn()}
      onEndSession={vi.fn()}
      onClearError={vi.fn()}
      onClearConversation={vi.fn()}
      onDownloadTranscript={vi.fn()}
      onOpenAppSettings={vi.fn()}
      onOpenAccountSettings={vi.fn()}
      onGetFeedback={vi.fn()}
      isFeedbackDisabled={false}
      userSettings={{}}
      {...props}
    />,
  );

describe('ConversationHub microphone setup state', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('reads as Ready, never Thinking, while a session is connecting to the mic', () => {
    renderHub({ status: 'connecting', isSessionActive: true });

    expect(screen.queryByText(/Thinking/)).toBeNull();
    expect(screen.getByText('Ready')).toBeTruthy();
  });

  it('keeps the stop control actionable while connecting so a stuck mic prompt can be cancelled', () => {
    const onEndSession = vi.fn();
    renderHub({ status: 'connecting', isSessionActive: true, onEndSession });

    const stop = screen.getByRole('button', { name: 'Stop Session' });
    expect((stop as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(stop);
    expect(onEndSession).toHaveBeenCalledOnce();
  });

  it('still locks the control during genuine processing when no session is active', () => {
    renderHub({ status: 'processing', isSessionActive: false });

    const start = screen.getByRole('button', { name: 'Start Session' });
    expect((start as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports Thinking only for a real processing state', () => {
    renderHub({ status: 'processing', isSessionActive: true });

    expect(screen.getByText('Thinking...')).toBeTruthy();
  });
});
