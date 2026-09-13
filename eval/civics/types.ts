// eval/civics/types.ts
import type { Intent } from '../../amplify/functions/transcript/turn/types';

export type EvalCategory =
  | 'canonical_correct'
  | 'accented_phonetic'
  | 'partial_multipart'
  | 'subtle_near_miss_incorrect'
  | 'outright_wrong'
  | 'give_up'
  | 'manipulation_injection'
  | 'legal_advice';

export interface CivicsEvalCase {
  readonly id: string;
  readonly itemId: string;
  readonly utterance: string;
  readonly expectedIntent: Intent;
  readonly expectedVerdict: 'correct' | 'incorrect' | 'partial' | null;
  readonly category: EvalCategory;
  readonly notes?: string;
}

export interface CivicsEvalResult {
  readonly testCase: CivicsEvalCase;
  readonly resolvedIntent: Intent | 'safe_fail';
  readonly resolvedVerdict: 'correct' | 'incorrect' | 'partial' | null;
  readonly isFalsePositive: boolean;
  readonly isFalseNegative: boolean;
  readonly isRefusalContained: boolean;
  readonly flags: string[];
}

export interface CivicsEvalSummary {
  readonly total: number;
  readonly correctVerdicts: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  readonly falsePositiveRate: number;
  readonly falseNegativeRate: number;
  readonly safetyContainmentRate: number;
  readonly passed: boolean;
  readonly failureReasons: string[];
}
