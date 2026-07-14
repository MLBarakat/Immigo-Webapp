// src/utils/diffReconciliation.ts
// T017: Token-Level Diff Reconciliation Engine.
//
// Algorithm:
//   1. Tokenize both strings into word arrays.
//   2. Compute Levenshtein edit distance matrix at the token level.
//   3. Back-trace the optimal alignment to produce a DiffResult array.
//   4. Apply the 85% stability lock: if Jaccard similarity ≥ 0.85,
//      return all tokens as 'unchanged' to prevent unnecessary DOM mutations.
//
// The resulting DiffResult[] is consumed by AudioRecorder.tsx TokenSpan renderer.

// ─── Types ────────────────────────────────────────────────────────────────────

export type DiffType = 'unchanged' | 'insert' | 'delete' | 'substitute' | 'speculative';

export interface DiffResult {
    type: DiffType;
    token: string;
    /** Token position in the new (speculative) sequence */
    newIndex: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Similarity threshold above which tokens are treated as stable (no mutation) */
const STABILITY_LOCK_THRESHOLD = 0.85;

// ─── Tokenizer ────────────────────────────────────────────────────────────────

/**
 * Splits a string into cleaned word tokens.
 * Preserves punctuation attached to words (e.g. "hello," stays as one token).
 */
function tokenize(text: string): string[] {
    return text
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

// ─── Jaccard Similarity ───────────────────────────────────────────────────────

/**
 * Computes Jaccard similarity between two token arrays.
 * J(A,B) = |A ∩ B| / |A ∪ B|
 * Returns 0 if both arrays are empty; 1 if both are identical.
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 1;
    const setA = new Set(a);
    const setB = new Set(b);
    let intersection = 0;
    for (const token of setA) {
        if (setB.has(token)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 1 : intersection / union;
}

// ─── Levenshtein Edit Distance ────────────────────────────────────────────────

type EditOp = 'match' | 'insert' | 'delete' | 'substitute';

interface EditStep {
    op: EditOp;
    oldToken: string;
    newToken: string;
    newIndex: number;
}

/**
 * Computes a token-level Levenshtein alignment between `oldTokens` and `newTokens`.
 * Returns a sequence of edit operations in order.
 *
 * Costs: match = 0, insert = 1, delete = 1, substitute = 1.
 */
function levenshteinAlign(oldTokens: string[], newTokens: string[]): EditStep[] {
    const m = oldTokens.length;
    const n = newTokens.length;

    // Build (m+1) × (n+1) distance matrix
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldTokens[i - 1] === newTokens[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1]; // match
            } else {
                dp[i][j] = 1 + Math.min(
                    dp[i - 1][j],     // delete from old
                    dp[i][j - 1],     // insert from new
                    dp[i - 1][j - 1], // substitute
                );
            }
        }
    }

    // Back-trace to reconstruct the alignment
    const steps: EditStep[] = [];
    let i = m;
    let j = n;

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
            steps.unshift({ op: 'match', oldToken: oldTokens[i - 1], newToken: newTokens[j - 1], newIndex: j - 1 });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] <= dp[i - 1][j] && dp[i][j - 1] <= dp[i - 1][j - 1])) {
            steps.unshift({ op: 'insert', oldToken: '', newToken: newTokens[j - 1], newIndex: j - 1 });
            j--;
        } else if (i > 0 && (j === 0 || dp[i - 1][j] <= dp[i][j - 1] && dp[i - 1][j] <= dp[i - 1][j - 1])) {
            steps.unshift({ op: 'delete', oldToken: oldTokens[i - 1], newToken: '', newIndex: j });
            i--;
        } else {
            steps.unshift({ op: 'substitute', oldToken: oldTokens[i - 1], newToken: newTokens[j - 1], newIndex: j - 1 });
            i--;
            j--;
        }
    }

    return steps;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Computes a token-level diff between a committed (verified) string and a
 * speculative (interim) string.
 *
 * Returns an array of DiffResult items ready for rendering by AudioRecorder.tsx.
 *
 * Stability lock: if Jaccard similarity between committed and speculative token
 * sets is ≥ 0.85, all tokens in the committed string are returned as 'unchanged'
 * to prevent unnecessary DOM re-renders during minor ASR fluctuations.
 *
 * Speculative-only tokens (beyond the committed region) are tagged as 'speculative'
 * and rendered at reduced opacity.
 */
export function diffTokens(committed: string, speculative: string): DiffResult[] {
    const committedTokens = tokenize(committed);
    const speculativeTokens = tokenize(speculative);

    // Handle empty inputs
    if (committedTokens.length === 0 && speculativeTokens.length === 0) return [];

    // Pure speculative case — no committed text yet
    if (committedTokens.length === 0) {
        return speculativeTokens.map((token, i) => ({
            type: 'speculative',
            token,
            newIndex: i,
        }));
    }

    // Pure committed case — no speculative overlay
    if (speculativeTokens.length === 0) {
        return committedTokens.map((token, i) => ({
            type: 'unchanged',
            token,
            newIndex: i,
        }));
    }

    // Apply 85% stability lock: if texts are very similar, return unchanged
    const similarity = jaccardSimilarity(committedTokens, speculativeTokens);
    if (similarity >= STABILITY_LOCK_THRESHOLD) {
        return committedTokens.map((token, i) => ({
            type: 'unchanged',
            token,
            newIndex: i,
        }));
    }

    // Compute full Levenshtein alignment
    const steps = levenshteinAlign(committedTokens, speculativeTokens);

    const results: DiffResult[] = [];
    for (const step of steps) {
        switch (step.op) {
            case 'match':
                results.push({ type: 'unchanged', token: step.newToken, newIndex: step.newIndex });
                break;
            case 'insert':
                results.push({ type: 'insert', token: step.newToken, newIndex: step.newIndex });
                break;
            case 'delete':
                // Deleted tokens are included as 'delete' for completeness;
                // the renderer in AudioRecorder.tsx filters them out of the visible output.
                results.push({ type: 'delete', token: step.oldToken, newIndex: step.newIndex });
                break;
            case 'substitute':
                results.push({ type: 'substitute', token: step.newToken, newIndex: step.newIndex });
                break;
        }
    }

    return results;
}

/**
 * Returns the normalized edit distance (0.0 = identical, 1.0 = completely different)
 * between two token arrays. Useful for RTF-based quality monitoring.
 */
export function tokenEditDistance(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 0;
    const steps = levenshteinAlign(a, b);
    const edits = steps.filter(s => s.op !== 'match').length;
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 0 : edits / maxLen;
}
