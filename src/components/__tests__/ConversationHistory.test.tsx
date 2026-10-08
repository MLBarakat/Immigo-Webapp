import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConversationHistory } from '../ConversationHistory';
import { Message } from '../../context/conversationContextTypes';

afterEach(cleanup);

const displayUser = { name: 'Alex Morgan', initials: 'AM' };

function message(id: string, timestamp: string): Message {
  return { id, role: 'assistant', content: `Message ${id}`, timestamp };
}

describe('ConversationHistory', () => {
  it('separates messages by their local calendar day', () => {
    render(
      <ConversationHistory
        messages={[
          message('first', '2025-01-01T12:00:00.000Z'),
          message('same-day', '2025-01-01T18:00:00.000Z'),
          message('next-day', '2025-01-02T12:00:00.000Z'),
        ]}
        displayUser={displayUser}
        interimTranscript=""
      />
    );

    expect(screen.getAllByRole('separator')).toHaveLength(2);
    expect(screen.getByText('Wednesday, January 1, 2025')).toBeTruthy();
    expect(screen.getByText('Thursday, January 2, 2025')).toBeTruthy();
  });

  it('scrolls to the latest message when a new message is appended', () => {
    const { rerender } = render(
      <ConversationHistory messages={[message('first', '2025-01-01T12:00:00.000Z')]} displayUser={displayUser} interimTranscript="" />
    );
    const log = screen.getByRole('log');
    expect(log.className).toContain('overflow-y-auto');
    expect(log.className).toContain('touch-pan-y');
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 500 });
    log.scrollTop = 0;

    rerender(
      <ConversationHistory
        messages={[
          message('first', '2025-01-01T12:00:00.000Z'),
          message('latest', '2025-01-01T12:01:00.000Z'),
        ]}
        displayUser={displayUser}
        interimTranscript=""
      />
    );

    expect(log.scrollTop).toBe(500);
  });

  it('does not jump to the bottom when older messages are prepended', () => {
    const { rerender } = render(
      <ConversationHistory messages={[message('latest', '2025-01-01T12:01:00.000Z')]} displayUser={displayUser} interimTranscript="" />
    );
    const log = screen.getByRole('log');
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 500 });
    log.scrollTop = 120;

    rerender(
      <ConversationHistory
        messages={[
          message('older', '2025-01-01T12:00:00.000Z'),
          message('latest', '2025-01-01T12:01:00.000Z'),
        ]}
        displayUser={displayUser}
        interimTranscript=""
      />
    );

    expect(log.scrollTop).toBe(120);
  });
});
