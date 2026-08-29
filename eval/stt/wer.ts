// Word Error Rate for STT evaluation.
// WER = (Substitutions + Deletions + Insertions) / N_reference_words,
// computed via word-level Levenshtein distance.

/** Standard WER normalization: lowercase, strip punctuation, collapse whitespace. */
export function normalizeForWer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface WerBreakdown {
  wer: number;          // 0..(>1) ; 0 = perfect
  refWords: number;
  substitutions: number;
  deletions: number;
  insertions: number;
}

/** Word-level edit distance with S/D/I backtrace. */
export function wordErrorRate(reference: string, hypothesis: string): WerBreakdown {
  const ref = normalizeForWer(reference).split(' ').filter(Boolean);
  const hyp = normalizeForWer(hypothesis).split(' ').filter(Boolean);
  const n = ref.length;
  const m = hyp.length;

  if (n === 0) {
    return { wer: m === 0 ? 0 : 1, refWords: 0, substitutions: 0, deletions: 0, insertions: m };
  }

  // DP cost matrix.
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,        // deletion
        d[i][j - 1] + 1,        // insertion
        d[i - 1][j - 1] + cost  // substitution / match
      );
    }
  }

  // Backtrace to count S/D/I.
  let i = n, j = m, S = 0, D = 0, I = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ref[i - 1] === hyp[j - 1] && d[i][j] === d[i - 1][j - 1]) {
      i--; j--;
    } else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) {
      S++; i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      D++; i--;
    } else {
      I++; j--;
    }
  }

  return { wer: (S + D + I) / n, refWords: n, substitutions: S, deletions: D, insertions: I };
}
