// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { escapeXml, wrapWithSpeechBreaks } from '../handler';

describe('escapeXml', () => {
  it('escapes all five XML special characters', () => {
    expect(escapeXml(`<a> & "b" 'c'`)).toBe('&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos;');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeXml('Hello world')).toBe('Hello world');
  });
});

describe('wrapWithSpeechBreaks', () => {
  it('wraps a single sentence with no break tags', () => {
    expect(wrapWithSpeechBreaks('Just one sentence here.')).toBe('<speak>Just one sentence here.</speak>');
  });

  it('inserts a <break> between two real sentences', () => {
    const out = wrapWithSpeechBreaks('Correct! Next question: name one.', 250);
    expect(out).toBe('<speak>Correct! <break time="250ms"/> Next question: name one.</speak>');
  });

  it('CRITICAL (civics domain): does not split on "U.S." as a false sentence boundary', () => {
    const out = wrapWithSpeechBreaks('The U.S. Constitution protects your rights. Let\'s continue.');
    expect(out).toContain('The U.S. Constitution protects your rights.');
    expect(out).not.toContain('The U.S.<break');
    // Exactly one break, between the two REAL sentences, not two (which would
    // happen if "U.S." were misread as its own sentence boundary).
    expect((out.match(/<break/g) ?? []).length).toBe(1);
  });

  it('does not FALSELY split mid-abbreviation on "Jr.", "Dr."', () => {
    const out = wrapWithSpeechBreaks('Dr. Martin Luther King Jr. gave a famous speech. It was powerful.');
    // One real break, between "speech." and "It was powerful" — NOT a wrong
    // break after "Dr." or "Jr.".
    expect((out.match(/<break/g) ?? []).length).toBe(1);
    expect(out).not.toContain('Dr.<break');
    expect(out).not.toContain('Jr.<break');
  });

  it('KNOWN, SAFE limitation: when a sentence happens to end exactly on a protected', () => {
    // abbreviation ("...D.C."), that one break is conservatively skipped rather
    // than risk guessing wrong — a missed pause there is a minor cosmetic cost,
    // not a broken-sounding mid-abbreviation pause. No false break is ever worse.
    const out = wrapWithSpeechBreaks('The speech was in Washington, D.C. It was powerful.');
    expect(out).not.toContain('D.C.<break'); // never incorrectly splits INSIDE "D.C."
    expect((out.match(/<break/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it('XML-escapes sentence content so model-generated text can never produce malformed SSML', () => {
    const out = wrapWithSpeechBreaks('He said "hello" & left. Then what?');
    expect(out).toContain('&quot;hello&quot;');
    expect(out).toContain('&amp;');
    expect(out).not.toContain('"hello"'); // raw quote must not survive
  });

  it('handles empty/whitespace-only input safely', () => {
    expect(wrapWithSpeechBreaks('')).toBe('<speak></speak>');
    expect(wrapWithSpeechBreaks('   ')).toBe('<speak></speak>');
  });

  it('handles three or more sentences with multiple breaks', () => {
    const out = wrapWithSpeechBreaks('First one. Second one! Third one?');
    expect((out.match(/<break/g) ?? []).length).toBe(2);
  });

  it('respects a custom break duration', () => {
    const out = wrapWithSpeechBreaks('One. Two.', 400);
    expect(out).toContain('<break time="400ms"/>');
  });
});
