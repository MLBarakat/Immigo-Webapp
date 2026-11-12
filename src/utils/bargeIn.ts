import type { BargeIn } from '../types/settings';

export function getBargeInHoldDurationMs(style: BargeIn): number {
  switch (style) {
    case 'aggressive':
      return 0;
    case 'balanced':
      return 150;
    case 'relaxed':
      return 400;
  }
}

/** Polly text-normalisation substitutions spoken aloud but written as symbols. */
const POLLY_SUBSTITUTIONS: Record<string, string> = {
  '%': 'percent',
  '&': 'and',
  '@': 'at',
  '$': 'dollar',
  '#': 'number',
};

function normalizeSpeech(text: string): string[] {
  let normalized = text.toLocaleLowerCase();
  // Polly renders symbols as spoken words (e.g. "50%" → "50 percent"). Expand
  // them so an echoed transcript can match the spoken response word-for-word.
  for (const [symbol, word] of Object.entries(POLLY_SUBSTITUTIONS)) {
    normalized = normalized.replace(new RegExp(`\\${symbol}`, 'g'), ` ${word} `);
  }
  return normalized.match(/[\p{L}\p{N}']+/gu) ?? [];
}

function isSameRecognizedWord(heard: string, spoken: string): boolean {
  if (heard === spoken) return true;
  if (heard.length < 4 || spoken.length < 4 || Math.abs(heard.length - spoken.length) > 1) return false;

  let edits = 0;
  let heardIndex = 0;
  let spokenIndex = 0;
  while (heardIndex < heard.length && spokenIndex < spoken.length) {
    if (heard[heardIndex] === spoken[spokenIndex]) {
      heardIndex += 1;
      spokenIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (heard.length > spoken.length) heardIndex += 1;
    else if (spoken.length > heard.length) spokenIndex += 1;
    else {
      heardIndex += 1;
      spokenIndex += 1;
    }
  }
  return true;
}

/** True when every word of `needle` appears in order within `haystack`. */
function isSubsequence(needle: string[], haystack: string[]): boolean {
  let haystackIndex = 0;
  for (const word of needle) {
    let found = false;
    while (haystackIndex < haystack.length) {
      if (isSameRecognizedWord(word, haystack[haystackIndex])) {
        found = true;
        haystackIndex += 1;
        break;
      }
      haystackIndex += 1;
    }
    if (!found) return false;
  }
  return true;
}

export function isPlaybackEchoTranscript(transcript: string, spokenResponse: string): boolean {
  const heardWords = normalizeSpeech(transcript);
  const spokenWords = normalizeSpeech(spokenResponse);
  if (heardWords.length === 0 || spokenWords.length === 0) return false;

  // An echo appears either as a partial repeat of what was spoken (heard is
  // shorter) or as the full spoken response repeated inside a longer transcript
  // (e.g. the mic re-hears the response plus its own opening — a duplicated
  // echo that previously looked longer than the spoken text and was missed).
  return isSubsequence(heardWords, spokenWords) || isSubsequence(spokenWords, heardWords);
}

export function hasEnoughBargeInSpeech(transcript: string): boolean {
  const words = normalizeSpeech(transcript);
  return words.length >= 2 || isExplicitBargeInCommand(transcript);
}

export function isExplicitBargeInCommand(transcript: string): boolean {
  return /^(stop|wait|pause|hold on|let me speak|let me talk)$/i.test(transcript.trim());
}
