import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CenterPanel } from '../CenterPanel';

vi.mock('../VoiceHub', () => ({ VoiceHub: () => null }));

afterEach(() => {
  cleanup();
});

function renderCenterPanel(isSessionActive: boolean) {
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
      onEndSession={vi.fn()}
      onLoadOlder={vi.fn()}
      onClearError={vi.fn()}
    />
  );
}

describe('CenterPanel text interview flow', () => {
  it('does not show a text-session start button and keeps the answer field disabled before a session', () => {
    renderCenterPanel(false);

    expect(screen.queryByRole('button', { name: 'Start interview with text' })).toBeNull();
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
