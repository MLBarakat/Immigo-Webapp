import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CenterPanel } from '../CenterPanel';

vi.mock('../VoiceHub', () => ({
  VoiceHub: ({ onStartSession }: { onStartSession: () => void }) => (
    <button aria-label="Voice microphone" onClick={onStartSession} />
  ),
}));

afterEach(() => {
  cleanup();
});

function renderCenterPanel({
  isSessionActive = false,
  isVoiceSessionActive = false,
  appStatus = 'idle',
  onSendMessage = vi.fn(),
  onStartSession = vi.fn(),
}: {
  isSessionActive?: boolean;
  isVoiceSessionActive?: boolean;
  appStatus?: 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error';
  onSendMessage?: (message: string) => void;
  onStartSession?: () => void;
} = {}) {
  return render(
    <CenterPanel
      conversationHistory={[]}
      displayUser={{ name: 'Alex Morgan', initials: 'AM' }}
      interimTranscript=""
      appStatus={appStatus}
      isSessionActive={isSessionActive}
      isVoiceSessionActive={isVoiceSessionActive}
      errorMessage={null}
      hasMoreHistory={false}
      onSendMessage={onSendMessage}
      onStartSession={onStartSession}
      onEndSession={vi.fn()}
      onLoadOlder={vi.fn()}
      onClearError={vi.fn()}
    />
  );
}

describe('CenterPanel text interview flow', () => {
  it('removes the old title/subtitle header in favour of the status island', () => {
    renderCenterPanel();

    expect(screen.queryByText('Naturalization Interview')).toBeNull();
    expect(screen.queryByText('Practice Session')).toBeNull();
    expect(screen.getByTestId('app-status-island')).toBeDefined();
    expect(screen.getByText('Ready')).toBeDefined();
  });

  it('hides the session timer in every UI state', () => {
    const { rerender } = renderCenterPanel({
      isSessionActive: true,
      isVoiceSessionActive: true,
      appStatus: 'listening',
    });

    expect(screen.queryByTestId('session-timer')).toBeNull();

    rerender(
      <CenterPanel
        conversationHistory={[]}
        displayUser={{ name: 'Alex Morgan', initials: 'AM' }}
        interimTranscript=""
        appStatus="idle"
        isSessionActive
        isVoiceSessionActive={false}
        errorMessage={null}
        hasMoreHistory={false}
        onSendMessage={vi.fn()}
        onStartSession={vi.fn()}
        onEndSession={vi.fn()}
        onLoadOlder={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(screen.queryByTestId('session-timer')).toBeNull();
    expect(screen.getByText('Ready')).toBeDefined();
  });

  it('allows text input before a session without activating voice conversation', () => {
    const onStartSession = vi.fn();
    const onSendMessage = vi.fn();

    renderCenterPanel({ onStartSession, onSendMessage });

    const input = screen.getByRole('textbox', { name: 'Type your response' }) as HTMLTextAreaElement;
    const sendButton = screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement;
    expect(input.disabled).toBe(false);
    expect(sendButton.disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'My typed answer' } });
    expect(sendButton.disabled).toBe(false);
    fireEvent.click(sendButton);

    expect(onSendMessage).toHaveBeenCalledWith('My typed answer');
    expect(onStartSession).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('keeps text input and send disabled during a voice session', () => {
    renderCenterPanel({ isSessionActive: true, isVoiceSessionActive: true, appStatus: 'speaking' });

    const input = screen.getByRole('textbox', { name: 'Type your response' }) as HTMLTextAreaElement;
    expect(input.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders Ready, never Thinking, while a voice session is only connecting to the mic', () => {
    renderCenterPanel({ isSessionActive: true, isVoiceSessionActive: true, appStatus: 'connecting' });

    // The mic-permission / setup window must not look like work in progress.
    expect(screen.queryByText(/Thinking/)).toBeNull();
    expect(screen.getByText('Ready')).toBeTruthy();
  });

  it('does not show a text-session start button', () => {
    renderCenterPanel();

    expect(screen.queryByRole('button', { name: 'Start interview with text' })).toBeNull();
  });

  it('enables text input and send controls during the interview', () => {
    renderCenterPanel({ isSessionActive: true });

    const input = screen.getByRole('textbox', { name: 'Type your response' }) as HTMLTextAreaElement;
    fireEvent.change(input, {
      target: { value: 'My typed answer' },
    });
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps text interaction available while the AI is processing or speaking', () => {
    const onSendMessage = vi.fn();
    renderCenterPanel({ isSessionActive: true, appStatus: 'speaking', onSendMessage });

    const input = screen.getByRole('textbox', { name: 'Type your response' }) as HTMLTextAreaElement;
    const sendButton = screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement;
    fireEvent.change(input, { target: { value: 'Let me clarify' } });

    expect(input.disabled).toBe(false);
    expect(sendButton.disabled).toBe(false);
    fireEvent.click(sendButton);
    expect(onSendMessage).toHaveBeenCalledWith('Let me clarify');
  });

  it('places Send and microphone controls inside the input and provides two initial text lines', () => {
    renderCenterPanel();

    const input = screen.getByRole('textbox', { name: 'Type your response' }) as HTMLTextAreaElement;
    expect(input.rows).toBe(2);
    expect(input.parentElement?.querySelector('[aria-label="Send message"]')).not.toBeNull();
    expect(input.parentElement?.querySelector('[aria-label="Voice microphone"]')).not.toBeNull();
    const controls = input.parentElement?.querySelector('.absolute');
    expect(controls?.className).toContain('top-1/2');
    expect(controls?.className).toContain('-translate-y-1/2');
  });

  it('activates voice conversation only when the microphone is clicked', () => {
    const onStartSession = vi.fn();
    renderCenterPanel({ onStartSession });

    fireEvent.click(screen.getByRole('button', { name: 'Voice microphone' }));
    expect(onStartSession).toHaveBeenCalledOnce();
  });
});
