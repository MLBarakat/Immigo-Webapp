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
import { answerInBank, isNearMiss } from './matching';
import type { Intent, TurnInterpretation } from './types';

export type ReplyKind =
  | 'grade_feedback' | 'teach' | 'assist' | 'affirm' | 'redirect' | 'clarify' | 'safe_fail'
  | 'needs_confirmation';

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
  confirm: "I want to make sure I heard you correctly. Could you say your answer once more?",
};

export interface ResolveOptions {
  /** The question the SERVER asked this turn. Grading always targets THIS item. */
  askedItem: CivicsItem | null;
  /**
   * True when this turn is the user's RETRY after a previous needs_confirmation
   * on the same item. On a retry we commit the honest verdict instead of
   * re-asking again — bounding confirmation to exactly ONE extra chance.
   */
  isConfirmationRetry?: boolean;
  /**
   * The raw user transcript for this turn (independent of whatever the model
   * claims it heard). Used for a code-authoritative recheck against the bank
   * and for near-miss classification — the single source of truth, not the
   * model's self-reported matchedAnswer.
   */
  rawTranscript?: string | null;
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

  // (1) THE ORIGINAL GUARANTEE, unchanged: if the model says correct AND its
  // claimed matchedAnswer is itself verified in the bank, that's correct.
  // This takes priority — a raw-transcript mismatch does not second-guess an
  // already-verified claim (that trust boundary is a separate question from
  // today's change, which is about targeting confirmation, not renegotiating
  // this guarantee).
  if (g.verdict === 'correct' && answerInBank(g.matchedAnswer, item.acceptableAnswers)) {
    return outcome('answer', 'correct', true, 'grade_feedback', interp.reply, true, []);
  }

  // (2) RESCUE, new: for any verdict that is NOT already a verified correct
  // (i.e. verdict was "incorrect", or "correct" with an unverifiable
  // matchedAnswer), check the user's actual RAW transcript against the bank
  // directly. This fixes model OVER-conservatism (saying incorrect when the
  // real transcript was fine) and gives a second, independent path to a
  // correct grade beyond whatever the model happened to extract.
  if (answerInBank(opts.rawTranscript ?? null, item.acceptableAnswers)) {
    return outcome('answer', 'correct', true, 'grade_feedback', interp.reply, true, ['model_undercredited']);
  }

  // THE GUARANTEE: a correct verdict survives only if backed by the bank.
  if (g.verdict === 'correct') {
    // Model claimed correct, but neither its matchedAnswer NOR the raw
    // transcript is actually in the bank -> hallucination/injection, or an
    // accent-driven STT miss severe enough that even the raw check couldn't
    // recover it.
    return notCorrect(opts, interp, item, ['off_bank_override']);
  }

  if (g.verdict === 'incorrect') {
    // Confirmed genuinely off-bank above. Decide near-miss (confirm) vs
    // far-miss (commit immediately) below.
    return notCorrect(opts, interp, item, []);
  }

  // partial cannot cause a false pass -> honored as-is (no re-ask).
  return outcome('answer', g.verdict, true, 'grade_feedback', interp.reply, true, []);
}

/**
 * Shared handling for an answer confirmed NOT in the bank (by the raw-transcript
 * recheck above). Targets confirmation accurately instead of blanket re-asking:
 *   - RETRY (already gave one confirmation chance) -> commit honest incorrect.
 *   - NEAR-MISS (transcript is close to a real answer — plausible accent/STT
 *     garble) -> re-ask once. This is where solution 9 actually helps.
 *   - FAR-MISS (transcript isn't meaningfully similar to any acceptable
 *     answer — a genuinely different answer) -> commit incorrect immediately,
 *     with no confirmation friction. This is the fix for the "too generic"
 *     design: confidently-wrong answers get clear, instant feedback instead of
 *     a confusing "did you mean to say that?" re-ask.
 * Numbers/dates never near-miss (see isNearMiss), so they always take the
 * far-miss (immediate) path — consistent with keeping them strict.
 */
function notCorrect(opts: ResolveOptions, interp: TurnInterpretation, item: CivicsItem, extraFlags: string[]): TurnOutcome {
  if (opts.isConfirmationRetry) {
    return outcome('answer', 'incorrect', true, 'grade_feedback', interp.reply, true, extraFlags);
  }
  if (isNearMiss(opts.rawTranscript ?? null, item.acceptableAnswers)) {
    return outcome('answer', null, false, 'needs_confirmation', SAFE.confirm, false, [...extraFlags, 'awaiting_confirmation', 'near_miss']);
  }
  return outcome('answer', 'incorrect', true, 'grade_feedback', interp.reply, true, [...extraFlags, 'far_miss']);
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
