import { describe, expect, it } from 'vitest';
import { tokenizeAssistantReveal } from '../revealTokens';

describe('tokenizeAssistantReveal', () => {
  it('keeps paragraph breaks and list indentation attached to the next word', () => {
    const tokens = tokenizeAssistantReveal('First point.\n\n- Second point.\n- Third point.');

    expect(tokens.join('')).toBe('First point.\n\n- Second point.\n- Third point.');
    expect(tokens).toContain('\n\n-');
    expect(tokens).toContain('\n-');
  });

  it('preserves multiple spaces between words', () => {
    const tokens = tokenizeAssistantReveal('One   two');

    expect(tokens).toEqual(['One', '   two']);
    expect(tokens.join('')).toBe('One   two');
  });

  it('ignores leading and trailing whitespace and empty segments', () => {
    expect(tokenizeAssistantReveal('  Hello world.  ')).toEqual(['Hello', ' world.']);
    expect(tokenizeAssistantReveal('   ')).toEqual([]);
  });
});
