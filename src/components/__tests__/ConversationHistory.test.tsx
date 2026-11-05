import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('renders assistant answers as organized rich text', () => {
    render(
      <ConversationHistory
        messages={[{
          ...message('rich', '2025-01-01T12:00:00.000Z'),
          content: '## Study plan\n\n**Focus** on three ideas.\n\n1. Rights\n2. Duties\n\n- Review daily.',
        }]}
        displayUser={displayUser}
        interimTranscript=""
      />
    );

    expect(screen.getByRole('heading', { name: 'Study plan', level: 2 })).toBeTruthy();
    expect(screen.getByText('Focus').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Rights',
      'Duties',
      'Review daily.',
    ]);
    expect(screen.queryByText(/## Study plan/)).toBeNull();
  });

  it('does not interpret user-authored text as formatting', () => {
    render(
      <ConversationHistory
        messages={[{
          ...message('literal', '2025-01-01T12:00:00.000Z'),
          role: 'user',
          content: '**I typed this literally**',
        }]}
        displayUser={displayUser}
        interimTranscript=""
      />
    );

    expect(screen.getByText('**I typed this literally**')).toBeTruthy();
  });

  it('renders in-chat actions and reports the chosen one', () => {
    const onMessageAction = vi.fn();
    render(
      <ConversationHistory
        messages={[{
          ...message('welcome', '2025-01-01T12:00:00.000Z'),
          content: 'You have an unfinished exam.',
          actions: [
            { kind: 'exam', examAction: 'resume', label: 'Continue exam', variant: 'primary' },
            { kind: 'exam', examAction: 'new', label: 'Start a new exam', variant: 'secondary' },
          ],
        }]}
        displayUser={displayUser}
        interimTranscript=""
        onMessageAction={onMessageAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue exam' }));
    expect(onMessageAction).toHaveBeenCalledWith(
      'welcome',
      expect.objectContaining({ kind: 'exam', examAction: 'resume' })
    );
  });

  it('scrolls to the latest message when a new message is appended', () => {
    const { rerender } = render(
      <ConversationHistory messages={[message('first', '2025-01-01T12:00:00.000Z')]} displayUser={displayUser} interimTranscript="" />
    );
    const log = screen.getByRole('log');
    expect(log.className).toContain('overflow-y-auto');
    expect(log.className).toContain('touch-pan-y');
    expect(log.className).toContain('pt-14');
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

  it('notifies the parent when the user scrolls the conversation', () => {
    const onUserScroll = vi.fn();
    render(
      <ConversationHistory
        messages={[message('first', '2025-01-01T12:00:00.000Z')]}
        displayUser={displayUser}
        interimTranscript=""
        onUserScroll={onUserScroll}
      />
    );

    const log = screen.getByRole('log');
    fireEvent.wheel(log);
    fireEvent.touchMove(log);

    expect(onUserScroll).toHaveBeenCalledTimes(2);
  });

  it('does not jump to the bottom when older messages are prepended', () => {
    const { rerender } = render(
      <ConversationHistory messages={[message('latest', '2025-01-01T12:01:00.000Z')]} displayUser={displayUser} interimTranscript="" />
    );
    const log = screen.getByRole('log');
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 500 });

    // jsdom has no layout, so the real scrollHeight at mount was 0 — the
    // anchor baseline in previousHeightRef only records AFTER the mock above
    // is installed. Rerender with equal content (fresh objects, same ids) to
    // re-run the layout effect: neither scroll branch fires, but the effect
    // re-records the mocked height as the baseline.
    rerender(
      <ConversationHistory messages={[message('latest', '2025-01-01T12:01:00.000Z')]} displayUser={displayUser} interimTranscript="" />
    );
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

    // With the baseline matching the mocked height, the prepend anchor shift
    // is 500 - 500 = 0: the viewport must not move at all.
    expect(log.scrollTop).toBe(120);
  });

  it('shifts the scroll position by the height of prepended content', () => {
    const { rerender } = render(
      <ConversationHistory messages={[message('latest', '2025-01-01T12:01:00.000Z')]} displayUser={displayUser} interimTranscript="" />
    );
    const log = screen.getByRole('log');
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 500 });
    // Re-record the anchor baseline now that the height is mocked (see above).
    rerender(
      <ConversationHistory messages={[message('latest', '2025-01-01T12:01:00.000Z')]} displayUser={displayUser} interimTranscript="" />
    );
    log.scrollTop = 120;

    // Prepending content grows the list by 200px.
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 700 });
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

    // The anchor must compensate by exactly the inserted height so the user
    // stays on the same message: 120 + (700 - 500) = 320.
    expect(log.scrollTop).toBe(320);
  });

  it('shows a jump-to-latest button when scrolled away from the bottom', () => {
    render(
      <ConversationHistory messages={[message('latest', '2025-01-01T12:01:00.000Z')]} displayUser={displayUser} interimTranscript="" />
    );

    const log = screen.getByRole('log');
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 600 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(log, 'scrollTop', { configurable: true, get: () => 50, set: vi.fn() });
    log.scrollTo = vi.fn();

    // Fire the scroll handler explicitly since jsdom does not fire scroll events
    // for programmatic scrollTop assignments.
    fireEvent.scroll(log);

    const button = screen.getByTestId('jump-to-latest');
    expect(button).toBeTruthy();
    expect(button?.getAttribute('aria-label')).toBe('Jump to latest message');
  });

  it('hides the button when scrolled to the bottom threshold', () => {
    render(
      <ConversationHistory messages={[message('latest', '2025-01-01T12:01:00.000Z')]} displayUser={displayUser} interimTranscript="" />
    );

    const log = screen.getByRole('log');
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 600 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 595 });
    Object.defineProperty(log, 'scrollTop', { configurable: true, get: () => 0, set: vi.fn() });

    // Re-fire scroll so the new distances are evaluated.
    fireEvent.scroll(log);

    expect(screen.queryByTestId('jump-to-latest')).toBeFalsy();
  });

  it('scrolls to latest when the jump-to-latest button is clicked', () => {
    render(
      <ConversationHistory messages={[message('latest', '2025-01-01T12:01:00.000Z')]} displayUser={displayUser} interimTranscript="" />
    );

    const log = screen.getByRole('log');
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 600 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(log, 'scrollTop', { configurable: true, get: () => 50, set: vi.fn() });
    log.scrollTo = vi.fn();

    // Trigger scroll so the button becomes visible.
    fireEvent.scroll(log);

    const button = screen.getByTestId('jump-to-latest');
    fireEvent.click(button);

    expect(log.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 600, behavior: 'smooth' }));
  });
});
