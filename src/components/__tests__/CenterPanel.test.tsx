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

type CenterPanelOverrides = Partial<Parameters<typeof CenterPanel>[0]>;

function centerPanelElement(overrides: CenterPanelOverrides = {}) {
  return (
    <CenterPanel
      conversationHistory={[]}
      displayUser={{ name: 'Alex Morgan', initials: 'AM' }}
      interimTranscript=""
      appStatus="idle"
      isModelLoading={false}
      isVadReady={false}
      isSessionActive={false}
      isVoiceSessionActive={false}
      errorMessage={null}
      hasMoreHistory={false}
      onSendMessage={vi.fn()}
      onStartSession={vi.fn()}
      onEndSession={vi.fn()}
      onLoadOlder={vi.fn()}
      onClearError={vi.fn()}
      {...overrides}
    />
  );
}

function renderCenterPanel(overrides: CenterPanelOverrides = {}) {
  return render(centerPanelElement(overrides));
}

const conversation = [{
  id: 'message-1',
  role: 'assistant' as const,
  content: 'Welcome to your interview.',
  timestamp: '2025-01-01T12:00:00.000Z',
}];

describe('CenterPanel text interview flow', () => {
  it('removes the old title/subtitle header in favour of the floating status island', () => {
    renderCenterPanel();

    expect(screen.queryByText('Naturalization Interview')).toBeNull();
    expect(screen.queryByText('Practice Session')).toBeNull();
    const wrapper = screen.getByTestId('app-status-island-wrapper');
    expect(wrapper.className).toContain('absolute');
    expect(screen.getByTestId('app-status-island')).toBeDefined();
    expect(screen.getByText('Ready')).toBeDefined();
  });

  it.each([
    ['idle', 'Ready'],
    ['connecting', 'Ready'],
  ] as const)('centres the "%s" status label without a dot so the word is truly centred', (appStatus, label) => {
    renderCenterPanel({ appStatus });

    const status = screen.getByRole('status');
    const statusText = screen.getByText(label);
    const island = screen.getByTestId('app-status-island');

    expect(status.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(status.contains(statusText)).toBe(true);
    expect(status.className).toContain('items-center');
    expect(status.className).toContain('justify-center');
    expect(status.className).toContain('whitespace-nowrap');
    expect(island.className).toContain('justify-center');
    expect(island.className).toContain('px-4');
  });

  it.each([
    ['listening', 'Listening…'],
    ['processing', 'Thinking…'],
    ['speaking', 'Speaking…'],
    ['error', 'Error'],
  ] as const)('centres the dot and "%s" status label together as one unit on a single line', (appStatus, label) => {
    renderCenterPanel({ appStatus });

    const status = screen.getByRole('status');
    const dot = status.querySelector('[aria-hidden="true"]');
    const statusText = screen.getByText(label);
    const island = screen.getByTestId('app-status-island');

    expect(status.className).toContain('items-center');
    expect(status.className).toContain('justify-center');
    expect(status.className).toContain('whitespace-nowrap');
    expect(dot).not.toBeNull();
    expect(status.contains(statusText)).toBe(true);
    expect(island.className).toContain('justify-center');
    expect(island.className).toContain('px-4');
  });

  it('slides the status island away while the conversation is scrolled and reveals it on input interaction', () => {
    renderCenterPanel({ conversationHistory: conversation });

    const wrapper = screen.getByTestId('app-status-island-wrapper');
    const island = screen.getByTestId('app-status-island');
    expect(wrapper.getAttribute('data-visible')).toBe('true');
    // The island must slide (transform) rather than just fade in/out.
    expect(wrapper.className).toContain('transition-transform');
    expect(wrapper.className).toContain('duration-[800ms]');
    expect(wrapper.className).not.toContain('opacity');
    expect(island.className).toContain('opacity-100');

    fireEvent.wheel(screen.getByRole('log'));

    expect(wrapper.getAttribute('data-visible')).toBe('false');
    // While hiding, the island stays opaque during the slide and only fades
    // once it is clipped by the panel edge.
    expect(island.className).toContain('opacity-0');
    expect(island.className).toContain('delay-[600ms]');

    fireEvent.pointerDown(screen.getByRole('textbox', { name: 'Type your response' }));

    expect(wrapper.getAttribute('data-visible')).toBe('true');
    expect(island.className).toContain('opacity-100');
  });

  it('reveals the status island when the app status changes', () => {
    const { rerender } = renderCenterPanel({ conversationHistory: conversation });

    const wrapper = screen.getByTestId('app-status-island-wrapper');
    fireEvent.touchMove(screen.getByRole('log'));
    expect(wrapper.getAttribute('data-visible')).toBe('false');

    rerender(centerPanelElement({ conversationHistory: conversation, appStatus: 'processing' }));

    expect(wrapper.getAttribute('data-visible')).toBe('true');
    expect(screen.getByText('Thinking…')).toBeDefined();
  });

  it('hides the session timer in every UI state', () => {
    const { rerender } = renderCenterPanel({
      isSessionActive: true,
      isVoiceSessionActive: true,
      appStatus: 'listening',
    });

    expect(screen.queryByTestId('session-timer')).toBeNull();

    rerender(centerPanelElement({ isSessionActive: true, isVoiceSessionActive: false }));

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
