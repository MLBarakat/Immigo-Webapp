import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatMessageContent } from '../ChatMessageContent';

afterEach(cleanup);

describe('ChatMessageContent', () => {
  it('renders headings, paragraphs, and inline emphasis without exposing markup', () => {
    render(<ChatMessageContent content={'## Key idea\n\n**Federalism** shares power between *national* and _state_ governments.'} />);

    expect(screen.getByRole('heading', { name: 'Key idea', level: 2 })).toBeTruthy();
    expect(screen.getByText('Federalism').tagName).toBe('STRONG');
    expect(screen.getByText('national').tagName).toBe('EM');
    expect(screen.getByText('state').tagName).toBe('EM');
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it('renders ordered and unordered lists as semantic lists', () => {
    render(<ChatMessageContent content={'Steps:\n\n1. Read the question.\n2. Answer aloud.\n\n- Speak clearly.\n- Stay calm.'} />);

    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(2);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Read the question.',
      'Answer aloud.',
      'Speak clearly.',
      'Stay calm.',
    ]);
    expect(lists[0].tagName).toBe('OL');
    expect(lists[1].tagName).toBe('UL');
  });

  it('preserves single line breaks and renders inline code', () => {
    const { container } = render(<ChatMessageContent content={'First line\nSecond line with `code`.'} />);

    const paragraph = container.querySelector('p');
    expect(paragraph?.textContent).toBe('First line\nSecond line with code.');
    expect(screen.getByText('code').tagName).toBe('CODE');
  });

  it('leaves intraword underscores in identifiers untouched', () => {
    const { container } = render(<ChatMessageContent content={'Set ai_voice_id and weekly_graded_answer_target.'} />);

    expect(container.textContent).toBe('Set ai_voice_id and weekly_graded_answer_target.');
    expect(container.querySelector('em')).toBeNull();
  });

  it('never executes raw HTML and refuses unsafe link protocols', () => {
    const { container } = render(
      <ChatMessageContent content={'<script>alert("x")</script> [safe](https://example.com) [unsafe](javascript:alert(1))'} />
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert("x")</script>');
    const safeLink = screen.getByRole('link', { name: 'safe' });
    expect(safeLink.getAttribute('href')).toBe('https://example.com');
    expect(safeLink.getAttribute('rel')).toContain('noopener');
    expect(screen.queryByRole('link', { name: 'unsafe' })).toBeNull();
    expect(container.textContent).toContain('unsafe');
  });
});
