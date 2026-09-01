// amplify/functions/transcript/turn/matching.ts
// Deterministic answer matching used by the code-enforcement layer.
//
// Matching ladder (TEC-01 #1, answer-anchored, safety-first):
//   1. exact / substring on normalized text  (unchanged behavior)
//   2. phonetic (Double-Metaphone) anchored match      — recovers accented speech
//   3. bounded edit-distance anchored match            — recovers small slips
// Numbers / dates / years are matched EXACTLY ONLY (never fuzzy): "92" must not
// match "99", "1776" must not match "1786". This is the primary false-pass guard.
// Thresholds are intentionally conservative: we prefer to fail a correct accented
// answer (recoverable via re-ask) over passing a wrong one.

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/-/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(um|uh|like|the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True if the string contains any digit — numeric/date/year answers stay strict. */
function containsDigit(s: string): boolean {
  return /\d/.test(s);
}

/**
 * Minimal Double-Metaphone-style phonetic key. Not the full algorithm, but a
 * deterministic, dependency-free reduction that collapses common accent-driven
 * spelling variants (voicing, dropped/added vowels, th/d, v/w, etc.) to a shared
 * key. Kept conservative to avoid over-collapsing distinct words.
 */
export function phoneticKey(word: string): string {
  let s = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return '';
  // Common accent-neutralizing substitutions (order matters).
  s = s
    .replace(/[aeiou]+/g, 'a')   // collapse vowel runs to a single class
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/[sz]/g, 's')       // s/z voicing
    .replace(/[vw]/g, 'v')       // v/w confusion (very common non-native)
    .replace(/ck|q/g, 'k')
    .replace(/[gj]/g, 'j')       // soft g / j
    .replace(/x/g, 'ks');
  // Drop doubled consonants and a leading class vowel.
  s = s.replace(/(.)\1+/g, '$1');
  s = s.replace(/^a/, '');
  return s;
}

function phoneticPhrase(text: string): string {
  return normalize(text).split(' ').filter(Boolean).map(phoneticKey).join(' ');
}

/** Levenshtein distance (character-level). */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

/** Sliding window: does answer-length window of the transcript ~match the answer? */
function anchoredMatch(
  candidateWords: string[],
  answerWords: string[],
  wordMatches: (cw: string, aw: string) => boolean
): boolean {
  const an = answerWords.length;
  if (an === 0) return false;
  if (candidateWords.length < an) return false;
  for (let start = 0; start + an <= candidateWords.length; start++) {
    let all = true;
    for (let k = 0; k < an; k++) {
      if (!wordMatches(candidateWords[start + k], answerWords[k])) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}

/**
 * True if `candidate` corresponds to something actually in the bank list.
 * Backward compatible: exact/substring behavior is checked first and unchanged.
 */
export function answerInBank(candidate: string | null, acceptable: string[]): boolean {
  if (!candidate) return false;
  const c = normalize(candidate);
  if (!c) return false;

  const cWords = c.split(' ').filter(Boolean);

  for (const rawAnswer of acceptable) {
    const a = normalize(rawAnswer);
    if (!a) continue;

    // 1) Exact / substring (original behavior, always allowed).
    if (c === a || c.includes(a) || a.includes(c)) return true;

    // STRICT GUARD: numeric / date / year answers are exact-only. Do NOT fuzzy.
    if (containsDigit(a) || containsDigit(c)) continue;

    const aWords = a.split(' ').filter(Boolean);

    // 2) Phonetic anchored match (recovers accent-driven spelling).
    const phoneticWordMatch = (cw: string, aw: string) => {
      const pk = phoneticKey(cw);
      const pa = phoneticKey(aw);
      return pk.length > 0 && pk === pa;
    };
    if (anchoredMatch(cWords, aWords, phoneticWordMatch)) return true;

    // 3) Bounded edit-distance anchored match (recovers small slips).
    //    Threshold scales with word length but stays tight (<=25%, min 1, cap 2)
    //    and skips very short words where a 1-char edit changes meaning.
    const editWordMatch = (cw: string, aw: string) => {
      if (aw.length < 4) return cw === aw;               // short words: exact only
      const maxEdits = Math.min(2, Math.max(1, Math.floor(aw.length * 0.25)));
      return editDistance(cw, aw) <= maxEdits;
    };
    if (anchoredMatch(cWords, aWords, editWordMatch)) return true;
  }

  return false;
}
