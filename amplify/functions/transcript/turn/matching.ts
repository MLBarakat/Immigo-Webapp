// amplify/functions/transcript/turn/matching.ts
// Deterministic answer matching used by the code-enforcement layer.

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/-/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(um|uh|like|the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True if `candidate` corresponds to something actually in the bank list. */
export function answerInBank(candidate: string | null, acceptable: string[]): boolean {
  if (!candidate) return false;
  const c = normalize(candidate);
  if (!c) return false;
  return acceptable
    .map(normalize)
    .some((a) => a.length > 0 && (c === a || c.includes(a) || a.includes(c)));
}
