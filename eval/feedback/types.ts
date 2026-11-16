import type { OnboardingLanguage } from '../../amplify/functions/transcript/turn/mode-onboarding';
import type { SimulationMode } from '../../amplify/functions/transcript/turn/types';

export type FeedbackVerdict = 'correct' | 'incorrect' | 'partial' | null;

export interface FeedbackEvalCase {
  readonly name: string;
  readonly rawReply: string;
  readonly nextQuestion: string;
  readonly verdict: FeedbackVerdict;
  readonly mode: SimulationMode;
  readonly language: OnboardingLanguage;
  readonly answer?: string;
  readonly expected: string;
  readonly note: string;
}

export interface FeedbackEvalResult {
  readonly testCase: FeedbackEvalCase;
  readonly actual: string;
  readonly passed: boolean;
  readonly reasons: readonly string[];
}
