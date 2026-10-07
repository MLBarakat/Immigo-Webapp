import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CenterPanel } from '../CenterPanel';

vi.mock('../VoiceHub', () => ({ VoiceHub: () => null }));

afterEach(() => {
  cleanup();
});

function renderCenterPanel(isSessionActive: boolean, onStartTextSession = vi.fn()) {
  return render(
    <CenterPanel
      conversationHistory={[]}
      displayUser={{ name: 'Alex Morgan', initials: 'AM' }}
      interimTranscript=""
      appStatus="idle"
      isSessionActive={isSessionActive}
      sessionTime={0}
      errorMessage={null}
      hasMoreHistory={false}
      onSendMessage={vi.fn()}
      onStartSession={vi.fn()}
      onStartTextSession={onStartTextSession}
      onEndSession={vi.fn()}
      onLoadOlder={vi.fn()}
      onClearError={vi.fn()}
    />
  );
}

describe('CenterPanel text interview flow', () => {
  it('offers text-only session start and keeps the answer field disabled before a session', () => {
    const onStartTextSession = vi.fn();
    renderCenterPanel(false, onStartTextSession);

    fireEvent.click(screen.getByRole('button', { name: 'Start interview with text' }));

    expect(onStartTextSession).toHaveBeenCalledOnce();
    expect((screen.getByRole('textbox', { name: 'Type your response' }) as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables text input and send controls during the interview', () => {
    renderCenterPanel(true);

    const input = screen.getByRole('textbox', { name: 'Type your response' }) as HTMLTextAreaElement;
    fireEvent.change(input, {
      target: { value: 'My typed answer' },
    });
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
