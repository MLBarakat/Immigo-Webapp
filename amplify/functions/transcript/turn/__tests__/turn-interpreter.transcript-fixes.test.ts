// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildTurnPrompt } from '../turn-interpreter';
import type { CivicsItem } from '../types';

const q: CivicsItem = {
  id: 'q1',
  question: 'The Civil War had many important events. Name one.',
  kind: 'static',
  acceptableAnswers: ['Battle of Gettysburg', 'Emancipation Proclamation', 'surrender at Appomattox'],
};

describe('buildTurnPrompt — issue 2: incorrect-verdict reply must never invite a retry', () => {
  it('instructs that an incorrect reply is a STATEMENT, not a question, since a new question always follows immediately', () => {
    const { system } = buildTurnPrompt({ askedItem: q }, 'maybe winning the war');
    const lower = system.toLowerCase();
    expect(lower).toContain('any incorrect verdict');
    expect(lower).toContain('never phrase');
    expect(lower).toContain('as a statement');
  });

  it('explicitly bans the exact failure pattern seen in production ("can you try again?" style)', () => {
    const { system } = buildTurnPrompt({ askedItem: q }, 'x');
    expect(system.toLowerCase()).toContain('invitation to try again');
  });
});

describe('buildTurnPrompt — issue 3: question-confusion routes to hint, not unclear', () => {
  it('hint explicitly covers "I\'m not sure what you mean" / "what are you asking" phrasing', () => {
    const { system } = buildTurnPrompt({ askedItem: q }, "I'm not sure what you mean");
    const lower = system.toLowerCase();
    expect(lower).toContain("i'm not sure what you mean");
    expect(lower).toContain('what are you asking');
  });

  it('unclear is explicitly scoped to garbled/unintelligible input, not comprehension confusion', () => {
    const { system } = buildTurnPrompt({ askedItem: q }, 'x');
    const lower = system.toLowerCase();
    expect(lower).toContain('garbled');
    expect(lower).toContain('that is "hint" above, not unclear');
  });
});
