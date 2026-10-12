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

function normalizeSpeech(text: string): string[] {
  return text.toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
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

export function isPlaybackEchoTranscript(transcript: string, spokenResponse: string): boolean {
  const heardWords = normalizeSpeech(transcript);
  const spokenWords = normalizeSpeech(spokenResponse);
  if (heardWords.length === 0 || heardWords.length > spokenWords.length) return false;

  for (let start = 0; start <= spokenWords.length - heardWords.length; start += 1) {
    if (heardWords.every((word, offset) => isSameRecognizedWord(word, spokenWords[start + offset]))) return true;
  }
  return false;
}

export function hasEnoughBargeInSpeech(transcript: string): boolean {
  const words = normalizeSpeech(transcript);
  return words.length >= 2 || isExplicitBargeInCommand(transcript);
}

export function isExplicitBargeInCommand(transcript: string): boolean {
  return /^(stop|wait|pause|hold on|let me speak|let me talk)$/i.test(transcript.trim());
}
