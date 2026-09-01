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
  | 'smalltalk' | 'off_topic' | 'manipulation' | 'unclear';

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
  progressReportMarkdown?: string | null;
  firstQuestion: CivicsItem;
  preferredLanguage?: string;
  userFirstName?: string;
}

// ReplyKind and TurnOutcome are defined in turn-policy.ts.
