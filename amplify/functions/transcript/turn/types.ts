// amplify/functions/transcript/turn/types.ts
// Self-contained runtime types for the TurnInterpreter + TurnPolicy.

export interface CivicsItem {
  id: string;
  number?: number;
  edition?: string;
  question: string;
  kind: 'static' | 'dynamic';
  acceptableAnswers: string[];
  asterisk?: boolean;
}

export type Intent =
  | 'answer' | 'explain' | 'assist' | 'affirmation'
  | 'smalltalk' | 'off_topic' | 'manipulation' | 'unclear'
  | 'repeat' | 'hint' | 'legal_advice';

export interface ProposedGrade {
  verdict: 'correct' | 'incorrect' | 'partial';
  matchedAnswer: string | null;
}

export interface TurnInterpretation {
  intent: Intent;
  targetItemId: string | null;
  grade: ProposedGrade | null;
  reply: string;
  notes?: string;
}

export interface TurnContext {
  askedItem: CivicsItem;
  preferredLanguage?: string;
  userFirstName?: string;
}

export interface SessionStartContext {
  userUtterance: string;
  isFirstSessionToday: boolean;
  /** Days since the user's most recent PRIOR session (before today); null = no prior session (new learner). */
  daysSinceLastSession?: number | null;
  progressReportMarkdown?: string | null;
  firstQuestion: CivicsItem;
  preferredLanguage?: string;
  userFirstName?: string;
}

/**
 * Context for the on-screen (TEXT ONLY, never spoken) welcome banner shown
 * when the app loads — independent of starting a practice session. Exactly
 * two cases: a brand-new user (zero graded answers, ever) gets a generic
 * welcome + purpose + encouragement; a returning user (any subsequent visit,
 * same day or not) gets a summary of their lifetime achievement + a
 * suggested focus for this session + encouragement.
 */
export interface WelcomeBannerContext {
  isNewUser: boolean;
  /** Lifetime totals across all sessions, not just one session. Ignored when isNewUser. */
  lifetimeStats?: {
    answered: number;
    correct: number;
    accuracyPct: number;
    /** Question TEXT (not ids) for a few recently-missed items, to suggest a focus area. */
    recentlyMissedQuestions: string[];
  };
  userFirstName?: string;
  preferredLanguage?: string;
}

// ReplyKind and TurnOutcome are defined in turn-policy.ts.
