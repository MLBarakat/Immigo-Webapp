// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { escapeXml, resolvePollyVoiceId, sanitizeSpeechText, wrapWithSpeechBreaks } from '../handler';

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

describe('sanitizeSpeechText', () => {
  it('removes emojis, markdown emphasis, and decorative symbols before Polly speaks', () => {
    expect(sanitizeSpeechText('**Great job!** 😀 You know the answer.')).toBe('Great job! You know the answer.');
    expect(sanitizeSpeechText('# Heading\n\n- First point\n- Second point')).toBe('Heading. First point. Second point');
    expect(sanitizeSpeechText('Use *asterisks*, `code`, and [the guide](https://example.com).'))
      .toBe('Use asterisks, code, and the guide.');
  });

  it('turns date separators and bullets into natural spoken boundaries', () => {
    expect(sanitizeSpeechText('Your interview is on 10/31/2026 at 9:30.')).toBe('Your interview is on 10 31 2026 at 9:30.');
    expect(sanitizeSpeechText('1. Read the question\n2. Answer aloud')).toBe('1 Read the question. 2 Answer aloud');
  });

  it('strips raw HTML and characters Polly should never pronounce', () => {
    const spoken = sanitizeSpeechText('<script>alert("x")</script> Use #1 & 50% + 2 = 3.');

    expect(spoken).not.toMatch(/[<>#+=]/);
    expect(spoken).not.toContain('script');
    expect(spoken).toContain('and');
  });

  it('leaves ordinary punctuation and contractions intact', () => {
    expect(sanitizeSpeechText("It's correct, isn't it? Yes!")).toBe("It's correct, isn't it? Yes!");
  });

  it('returns an empty string for empty or whitespace-only input', () => {
    expect(sanitizeSpeechText('')).toBe('');
    expect(sanitizeSpeechText('   ')).toBe('');
  });
});

describe('resolvePollyVoiceId', () => {
  it.each([
    ['en-US', 'Ruth'],
    ['es-ES', 'Mia'],
    ['fr-FR', 'Lea'],
    ['ar-SA', 'Hala'],
  ])('defaults %s to its female voice', (language, expected) => {
    expect(resolvePollyVoiceId(undefined, language)).toBe(expected);
  });

  it.each([
    ['en-US', 'Matthew'],
    ['es-ES', 'Andres'],
    ['fr-FR', 'Remi'],
    ['ar-SA', 'Zayd'],
  ])('keeps the selected male voice for %s', (language, voiceId) => {
    expect(resolvePollyVoiceId(voiceId, language)).toBe(voiceId);
  });

  it('falls back to the language default when the selected voice belongs to another language', () => {
    expect(resolvePollyVoiceId('Matthew', 'es-ES')).toBe('Mia');
    expect(resolvePollyVoiceId('Zayd', 'en-US')).toBe('Ruth');
  });

  it('maps legacy voice IDs for older clients', () => {
    expect(resolvePollyVoiceId('Joanna', 'en-US')).toBe('Ruth');
    expect(resolvePollyVoiceId('Lupe', 'es-ES')).toBe('Mia');
    expect(resolvePollyVoiceId('Pedro', 'es-ES')).toBe('Andres');
    expect(resolvePollyVoiceId('Stephen', 'ar-SA')).toBe('Zayd');
  });

  it('treats inherited object keys as unsupported languages', () => {
    expect(resolvePollyVoiceId(undefined, 'toString')).toBe('Ruth');
    expect(resolvePollyVoiceId('Hala', 'toString')).toBe('Ruth');
  });
});
