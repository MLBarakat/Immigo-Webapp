/**
 * TurnPolicy — the code-authoritative enforcement layer.
 *
 * Takes the AI's (untrusted) TurnInterpretation and produces the authoritative
 * TurnOutcome. Core guarantees, enforced HERE, not by the model:
 *   - A `correct` grade is COMMITTED only via intent="answer" AND only if the
 *     matched answer is actually in the asked item's bank answers. No other
 *     intent can ever set a correct verdict. => "no misroute can flip a grade".
 *   - intent="manipulation" is never obeyed; a canned safe reply is used.
 *   - null/garbage interpretation safe-fails to a neutral outcome, no score.
 */
import type { CivicsItem } from './types';
import { answerInBank } from './matching';
import type { Intent, TurnInterpretation } from './types';

export type ReplyKind =
  | 'grade_feedback' | 'teach' | 'assist' | 'affirm' | 'redirect' | 'clarify' | 'safe_fail';

export interface TurnOutcome {
  effectiveIntent: Intent | 'safe_fail';
  committedVerdict: 'correct' | 'incorrect' | 'partial' | null; // null => no grade committed
  scoreChanged: boolean;
  replyKind: ReplyKind;
  /** What the app should actually say. For risky intents this is a canned safe reply. */
  safeReply: string;
  /** Whether the model's own reply text is safe to surface (false => use safeReply only). */
  useModelReply: boolean;
  flags: string[];
}

const SAFE = {
  manipulation: "Let's keep going with your civics practice. Ready for the next question?",
  clarify: "Sorry, I didn't catch that. Could you say it again?",
  safeFail: "Sorry, something went wrong on my side. Let's try that again.",
  offTopic: "That's outside what I can help with here, but I'm happy to keep practicing civics with you.",
};

export interface ResolveOptions {
  /** The question the SERVER asked this turn. Grading always targets THIS item. */
  askedItem: CivicsItem | null;
}

export function resolveTurn(interp: TurnInterpretation | null, opts: ResolveOptions): TurnOutcome {
  // Unusable model output -> safe-fail, never a score change.
  if (!interp) {
    return outcome('safe_fail', null, false, 'safe_fail', SAFE.safeFail, false, ['parse_failure']);
  }

  switch (interp.intent) {
    case 'answer':
      return resolveAnswer(interp, opts);

    case 'manipulation':
      // Never obey. Canned reply so no injected text is surfaced.
      return outcome('manipulation', null, false, 'redirect', SAFE.manipulation, false, ['manipulation_detected']);

    case 'explain':
      return outcome('explain', null, false, 'teach', interp.reply, true, []);
    case 'assist':
      return outcome('assist', null, false, 'assist', interp.reply, true, []);
    case 'affirmation':
      return outcome('affirmation', null, false, 'affirm', interp.reply, true, []);
    case 'smalltalk':
      return outcome('smalltalk', null, false, 'affirm', interp.reply, true, []);
    case 'off_topic':
      return outcome('off_topic', null, false, 'redirect', SAFE.offTopic, false, ['off_topic']);
    case 'unclear':
      return outcome('unclear', null, false, 'clarify', SAFE.clarify, false, []);
    default:
      return outcome('safe_fail', null, false, 'safe_fail', SAFE.safeFail, false, ['unknown_intent']);
  }
}

function resolveAnswer(interp: TurnInterpretation, opts: ResolveOptions): TurnOutcome {
  const item = opts.askedItem;
  if (!item) {
    // Claimed an answer but the server has no active question -> don't grade.
    return outcome('unclear', null, false, 'clarify', SAFE.clarify, false, ['answer_without_active_question']);
  }
  const g = interp.grade;
  if (!g) {
    // No grade payload -> ask to repeat rather than penalize.
    return outcome('answer', null, false, 'clarify', SAFE.clarify, false, ['answer_without_grade']);
  }

  // THE GUARANTEE: a correct verdict survives only if backed by the bank.
  if (g.verdict === 'correct') {
    if (answerInBank(g.matchedAnswer, item.acceptableAnswers)) {
      return outcome('answer', 'correct', true, 'grade_feedback', interp.reply, true, []);
    }
    // Model claimed correct off-bank (hallucination / injection) -> override.
    return outcome('answer', 'incorrect', true, 'grade_feedback', interp.reply, true, ['off_bank_override']);
  }

  // incorrect / partial cannot cause a false pass -> honored as-is.
  return outcome('answer', g.verdict, true, 'grade_feedback', interp.reply, true, []);
}

function outcome(
  effectiveIntent: Intent | 'safe_fail',
  committedVerdict: TurnOutcome['committedVerdict'],
  scoreChanged: boolean,
  replyKind: ReplyKind,
  safeReply: string,
  useModelReply: boolean,
  flags: string[]
): TurnOutcome {
  return { effectiveIntent, committedVerdict, scoreChanged, replyKind, safeReply, useModelReply, flags };
}
