import { logger } from '../logger';

export type EditOperationType = 'EQUAL' | 'INSERT' | 'DELETE' | 'REPLACE';

export interface TokenPatch {
  index: number;
  operation: EditOperationType;
  speculativeToken: string;
  truthToken: string;
}

export interface ReconciliationResult {
  reconciledText: string;
  similarityScore: number;
  uiStabilityLockEngaged: boolean;
  patches: TokenPatch[];
}

/**
 * Computes a normalized Levenshtein distance score between two text phrases.
 * Returns a value bound strictly between 0.0 (no match) and 1.0 (exact match).
 */
export function calculateStringSimilarity(speculative: string, truthLedger: string): number {
  const s1 = speculative.replace(/\s+/g, ' ').trim();
  const s2 = truthLedger.replace(/\s+/g, ' ').trim();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // Deletion optimization path
        matrix[i][j - 1] + 1,      // Insertion optimization path
        matrix[i - 1][j - 1] + cost // Substitution optimization path
      );
    }
  }

  const editDistance = matrix[len1][len2];
  const maxLength = Math.max(len1, len2);
  
  return 1.0 - editDistance / maxLength;
}

/**
 * Tokenizes text streams and aligns them using a dynamic programming edit distance matrix.
 * Tracks character sequences to construct single-word granular patches.
 */
export function alignTokenSequences(speculative: string, truthLedger: string): TokenPatch[] {
  const specTokens = speculative.split(/\s+/).filter(t => t.length > 0);
  const truthTokens = truthLedger.split(/\s+/).filter(t => t.length > 0);

  const m = specTokens.length;
  const n = truthTokens.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (specTokens[i - 1].toLowerCase() === truthTokens[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,   // Token deletion cost
          dp[i][j - 1] + 1,   // Token insertion cost
          dp[i - 1][j - 1] + 1 // Token substitution cost
        );
      }
    }
  }

  // Backtrack through the calculated matrix to generate index-mapped patch sequences
  const patches: TokenPatch[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && specTokens[i - 1].toLowerCase() === truthTokens[j - 1].toLowerCase()) {
      patches.push({
        index: i - 1,
        operation: 'EQUAL',
        speculativeToken: specTokens[i - 1],
        truthToken: truthTokens[j - 1]
      });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      patches.push({
        index: i - 1,
        operation: 'REPLACE',
        speculativeToken: specTokens[i - 1],
        truthToken: truthTokens[j - 1]
      });
      i--;
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j] === dp[i - 1][j] + 1)) {
      patches.push({
        index: i - 1,
        operation: 'DELETE',
        speculativeToken: specTokens[i - 1],
        truthToken: ''
      });
      i--;
    } else {
      patches.push({
        index: Math.max(0, i - 1),
        operation: 'INSERT',
        speculativeToken: '',
        truthToken: truthTokens[j - 1]
      });
      j--;
    }
  }

  return patches.reverse();
}

/**
 * Central Orchestrator for text reconciliation.
 * Implements the strict 85% UI Stability Lock to prevent paragraph jumping.
 */
export function reconcileTranscripts(
  speculativeText: string,
  truthLedgerText: string,
  similarityThreshold = 0.85
): ReconciliationResult {
  const specClean = speculativeText.replace(/\s+/g, ' ').trim();
  const truthClean = truthLedgerText.replace(/\s+/g, ' ').trim();

  const similarityScore = calculateStringSimilarity(specClean, truthClean);
  const patches = alignTokenSequences(specClean, truthClean);

  // FR-009 Stability Lock: Check similarity score against threshold gate
  if (similarityScore >= similarityThreshold) {
    logger.info('UI Stability Lock Engaged: Similarity score passes threshold gate. Bypassing state layout rewrite.', {
      similarityScore,
      threshold: similarityThreshold
    });
    
    return {
      reconciledText: specClean, // Retain current layout view to block word jitter
      similarityScore,
      uiStabilityLockEngaged: true,
      patches
    };
  }

  logger.info('UI Stability Lock Disengaged: Substantive linguistic deviation detected. Executing patch.', {
    similarityScore,
    threshold: similarityThreshold
  });

  // Construct a newly reconstructed, stabilized sentence string out of aligned truth tokens
  const outputTokens: string[] = [];
  for (let k = 0; k < patches.length; k++) {
    const patch = patches[k];
    if (patch.operation === 'EQUAL' || patch.operation === 'REPLACE') {
      outputTokens.push(patch.truthToken);
    } else if (patch.operation === 'INSERT') {
      outputTokens.push(patch.truthToken);
    }
    // 'DELETE' operations skip token push loops entirely
  }

  const reconciledText = outputTokens.join(' ').replace(/\s+/g, ' ').trim();

  return {
    reconciledText,
    similarityScore,
    uiStabilityLockEngaged: false,
    patches
  };
}