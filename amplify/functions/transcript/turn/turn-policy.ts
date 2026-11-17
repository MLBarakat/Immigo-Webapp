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
 *   - The question only ADVANCES when a FINAL grade was actually committed.
 *     Every non-grading reply (clarify, teach, assist, affirm, redirect,
 *     repeat, hint, or an in-progress multi-part/near-miss follow-up) leaves
 *     the user on the SAME question — this is what makes the conversation
 *     feel like a conversation instead of a quiz that bulldozes forward.
 */
import type { CivicsItem } from './types';
import { answerInBank, isNearMiss, isLegalAdviceQuery } from './matching';
import type { Intent, SimulationMode, TurnInterpretation } from './types';
import type { ServerCopyKey } from './server-copy';

export type ReplyKind =
  | 'grade_feedback' | 'teach' | 'assist' | 'affirm' | 'redirect' | 'clarify' | 'safe_fail'
  | 'needs_confirmation' | 'repeat_question';

export interface TurnOutcome {
  effectiveIntent: Intent | 'safe_fail';
  committedVerdict: 'correct' | 'incorrect' | 'partial' | null; // null => no grade committed
  scoreChanged: boolean;
  /**
   * Whether the handler should move to a NEW question after this turn. False
   * for every non-final outcome (clarify/teach/assist/affirm/redirect/repeat/
   * hint, or an in-progress near-miss/multi-part follow-up) so the user never
   * loses their place mid-conversation. True only once a FINAL grade commits.
   */
  advanceQuestion: boolean;
  replyKind: ReplyKind;
  /** What the app should actually say. For risky intents this is a canned safe reply. */
  safeReply: string;
  /**
   * Catalog key for a canned reply that must be localized at the edge. Null
   * when `safeReply` is model text or already assembled from exam content.
   */
  safeReplyKey: ServerCopyKey | null;
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
  practiceRetry: "That's not quite right. Try once more, or ask me for a hint.",
  dynamicAnswer: "I can't verify this current answer from the available reference data, so I'll leave it unscored and move on.",
  legalAdvice: "I can only help you practice civics questions and English speaking. I cannot provide legal advice or evaluate your eligibility for naturalization. Please consult a licensed immigration attorney or a DOJ-accredited representative.",
};

/**
 * Common abbreviations whose trailing period is not a sentence boundary.
 * Kept deliberately small: a missed abbreviation only merges two sentences,
 * while inventing one could hide a question sentence from removal.
 */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'jr', 'sr', 'vs', 'etc', 'inc', 'ltd', 'co',
  'gov', 'sen', 'rep', 'pres', 'e.g', 'i.e', 'u.s', 'u.s.a', 'a.m', 'p.m',
]);

/** True when the period at `periodIndex` closes an abbreviation, not a sentence. */
function isAbbreviationPeriod(text: string, periodIndex: number): boolean {
  let start = periodIndex;
  while (start > 0 && /[A-Za-z.]/.test(text[start - 1])) start -= 1;
  const token = text.slice(start, periodIndex);
  if (!token) return false;
  if (ABBREVIATIONS.has(token.toLocaleLowerCase())) return true;
  // Single initials (J.) and dotted acronyms (U.S., e.g.) are not boundaries.
  return /^(?:[A-Za-z]\.)*[A-Za-z]$/.test(token);
}

/** Split on sentence punctuation while respecting double-quoted text and abbreviations. */
function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  let inDoubleQuote = false;

  const push = (end: number) => {
    const sentence = text.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' || char === '“' || char === '”') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === '\n') {
      push(index + 1);
      continue;
    }
    if (inDoubleQuote) continue;
    if (char !== '.' && char !== '!' && char !== '?' && char !== '؟') continue;
    if (char === '.' && isAbbreviationPeriod(text, index)) continue;

    // A sentence ends only when terminal punctuation is followed by
    // whitespace or the end of the reply. "3.5" is not a boundary.
    const next = text[index + 1];
    if (next !== undefined && !/\s/.test(next)) continue;
    push(index + 1);
  }

  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

/** A sentence whose final punctuation is a question mark. */
function isQuestionSentence(sentence: string): boolean {
  return /[?؟][\s"'“”‘’]*$/u.test(sentence);
}

/** Punctuation-insensitive comparison form for duplicate detection. */
function normalizeSentence(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[\s"'“”‘’.,!?؟;:—-]+/gu, ' ')
    .trim();
}

/**
 * Model lead-ins that only ever introduce the question the handler appends.
 * Removing the question sentence alone leaves these dangling ("Correct. Here's
 * your ."), so they are stripped before sentence filtering. Move-on phrasing
 * goes first so it swallows its own "next question" reference whole.
 */
const MOVE_ON_LEAD_IN =
  /\b(?:let(?:['’]s|\s+us)\s+)?(?:move|moving|go|going|continue|proceed)\s+(?:on\s+to|to|with)\s+(?:the\s+)?next\s+question\s*[.!]?/gi;
const NEXT_QUESTION_LEAD_IN =
  /\b(?:now,?\s+)?(?:here(?:['’]s|\s+is)\s+)?(?:the|your|our)?\s*next\s+question(?:\s+is)?\s*[:：—–-]?\s*[.!]?/gi;

function stripNextQuestionLeadIns(text: string): string {
  return text
    .replace(MOVE_ON_LEAD_IN, ' ')
    .replace(NEXT_QUESTION_LEAD_IN, ' ')
    .replace(/\s+([.,!?؟])/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove model-authored question sentences and next-question announcements
 * while preserving every complete statement before and after them. The handler
 * appends exactly one official question; feedback must never smuggle in a
 * second one or collapse into a bare non-answer when only questions remain.
 */
export function sanitizeFinalAnswerFeedback(
  reply: string,
  nextQuestion: string,
  fallback = "Let's keep going.",
): string {
  const withoutMarkers = stripNextQuestionLeadIns(reply.trim());

  const canonical = normalizeSentence(nextQuestion);
  const kept = splitIntoSentences(withoutMarkers).filter((sentence) => {
    if (isQuestionSentence(sentence)) return false;
    if (canonical && normalizeSentence(sentence) === canonical) return false;
    return true;
  });

  const feedback = kept
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s,:;—-]+$/u, '')
    .trim();

  return feedback && !/^[.,!?؟:;—–\-\s]+$/u.test(feedback) ? feedback : fallback;
}

export interface ResolveOptions {
  /** The question the SERVER asked this turn. Grading always targets THIS item. */
  askedItem: CivicsItem | null;
  /**
   * True when this turn is the user's SECOND attempt on the same item after
   * we chose not to advance last time — either a near-miss confirmation
   * ("did you mean...?") or an in-progress multi-part answer ("name two...").
   * On this second attempt we commit whatever the current grade is instead of
   * waiting again — bounding any follow-up to exactly ONE extra turn.
   */
  isConfirmationRetry?: boolean;
  /**
   * The raw user transcript for this turn (independent of whatever the model
   * claims it heard). Used for a code-authoritative recheck against the bank
   * and for near-miss classification — the single source of truth, not the
   * model's self-reported matchedAnswer.
   */
  rawTranscript?: string | null;
  simulationMode?: SimulationMode;
}

export function resolveTurn(interp: TurnInterpretation | null, opts: ResolveOptions): TurnOutcome {
  // Deterministic legal advice interceptor (LEG-01):
  // If the user's spoken words are requesting legal eligibility advice or counsel,
  // we refuse immediately with a canned referral and suppress any LLM generation.
  if (isLegalAdviceQuery(opts.rawTranscript)) {
    return outcome('legal_advice', null, false, false, 'redirect', SAFE.legalAdvice, false, ['legal_advice_refusal', 'deterministic_intercept'], 'legalAdvice');
  }

  // Unusable model output -> safe-fail, never a score change, never advance.
  if (!interp) {
    return outcome('safe_fail', null, false, false, 'safe_fail', SAFE.safeFail, false, ['parse_failure'], 'parseFailure');
  }

  switch (interp.intent) {
    case 'answer':
      return resolveAnswer(interp, opts);

    case 'legal_advice':
      return outcome('legal_advice', null, false, false, 'redirect', SAFE.legalAdvice, false, ['legal_advice_refusal'], 'legalAdvice');

    case 'manipulation':
      // Never obey. Canned reply so no injected text is surfaced. Stay put.
      return outcome('manipulation', null, false, false, 'redirect', SAFE.manipulation, false, ['manipulation_detected'], 'manipulation');

    case 'explain':
      return outcome('explain', null, false, false, 'teach', interp.reply, true, []);
    case 'assist':
      return outcome('assist', null, false, false, 'assist', interp.reply, true, []);
    case 'affirmation':
      return outcome('affirmation', null, false, false, 'affirm', interp.reply, true, []);
    case 'smalltalk':
      return outcome('smalltalk', null, false, false, 'affirm', interp.reply, true, []);
    case 'off_topic':
      return outcome('off_topic', null, false, false, 'redirect', SAFE.offTopic, false, ['off_topic'], 'offTopic');
    case 'unclear':
      return outcome('unclear', null, false, false, 'clarify', SAFE.clarify, false, ['unclear_input'], 'unclearInput');

    case 'repeat': {
      // Literal re-ask, built from the REAL question text (not the model's own
      // paraphrase) so it's guaranteed to say exactly what was asked before.
      const question = opts.askedItem?.question;
      const reply = question
        ? `Sure — here's the question again: ${question}`
        : SAFE.clarify;
      return outcome('repeat', null, false, false, 'repeat_question', reply, false, ['repeat_requested'], question ? null : 'unclearInput');
    }

    case 'hint': {
      // Hint content must be dynamic (depends on the specific question), so we
      // trust the model's reply text here — it's a non-scoring, non-advancing
      // teaching moment, same risk profile as 'explain'/'assist'.
      return outcome('hint', null, false, false, 'teach', interp.reply, true, ['hint_requested']);
    }

    case 'english_retry':
      return outcome('english_retry', null, false, false, 'teach', interp.reply, true, ['english_answer_requested']);

    default:
      return outcome('safe_fail', null, false, false, 'safe_fail', SAFE.safeFail, false, ['unknown_intent'], 'safeFail');
  }
}

function resolveAnswer(interp: TurnInterpretation, opts: ResolveOptions): TurnOutcome {
  const item = opts.askedItem;
  if (!item) {
    // Claimed an answer but the server has no active question -> don't grade.
    return outcome('unclear', null, false, false, 'clarify', SAFE.clarify, false, ['answer_without_active_question'], 'answerWithoutActiveQuestion');
  }
  if (item.kind === 'dynamic' && item.acceptableAnswers.length === 0) {
    return outcome('answer', null, false, true, 'grade_feedback', SAFE.dynamicAnswer, false, ['dynamic_ungraded'], 'dynamicUngraded');
  }
  const g = interp.grade;
  if (!g) {
    // No grade payload -> ask to repeat rather than penalize. Stay put.
    return outcome('answer', null, false, false, 'clarify', SAFE.clarify, false, ['answer_without_grade'], 'answerWithoutGrade');
  }

  // (1) THE ORIGINAL GUARANTEE, unchanged: if the model says correct AND its
  // claimed matchedAnswer is itself verified in the bank, that's correct.
  // This takes priority — a raw-transcript mismatch does not second-guess an
  // already-verified claim (that trust boundary is unchanged by this pass).
  if (g.verdict === 'correct' && answerInBank(g.matchedAnswer, item.acceptableAnswers)) {
    return outcome('answer', 'correct', true, true, 'grade_feedback', interp.reply, true, []);
  }

  // (2) RESCUE: for any verdict that is NOT already a verified correct (i.e.
  // "incorrect", or "correct" with an unverifiable matchedAnswer), check the
  // user's actual RAW transcript against the bank directly. Fixes model
  // OVER-conservatism and gives a second, independent path to a correct grade.
  if (answerInBank(opts.rawTranscript ?? null, item.acceptableAnswers)) {
    return outcome('answer', 'correct', true, true, 'grade_feedback', interp.reply, true, ['model_undercredited']);
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
    // Confirmed genuinely off-bank above. Decide near-miss (confirm, stay) vs
    // far-miss (commit immediately, advance) below.
    return notCorrect(opts, interp, item, []);
  }

  // partial (e.g. "name two things", only one given): give the user ONE more
  // turn to complete the answer before committing a final grade — mirrors the
  // near-miss follow-up so multi-part questions don't get bulldozed into the
  // next topic before they're finished. Bounded: on the retry, commit
  // whatever we have (upgraded to correct if they completed it — that flows
  // through the checks above on the fresh call — otherwise final partial).
  if (opts.isConfirmationRetry) {
    return outcome('answer', 'partial', true, true, 'grade_feedback', interp.reply, true, ['partial_final']);
  }
  return outcome('answer', null, false, false, 'needs_confirmation', interp.reply, true, ['partial_awaiting_completion']);
}

/**
 * Shared handling for an answer confirmed NOT in the bank (by the raw-transcript
 * recheck above). Targets confirmation accurately instead of blanket re-asking:
 *   - RETRY (already gave one follow-up chance) -> commit honest incorrect, advance.
 *   - NEAR-MISS (transcript is close to a real answer — plausible accent/STT
 *     garble) -> re-ask once, stay. This is where solution 9 actually helps.
 *   - FAR-MISS (transcript isn't meaningfully similar to any acceptable
 *     answer — a genuinely different answer) -> commit incorrect immediately,
 *     advance, no confirmation friction. Confidently-wrong answers get clear,
 *     instant feedback instead of a confusing "did you mean to say that?".
 * Numbers/dates never near-miss (see isNearMiss), so they always take the
 * far-miss (immediate) path — consistent with keeping them strict.
 */
function notCorrect(opts: ResolveOptions, interp: TurnInterpretation, item: CivicsItem, extraFlags: string[]): TurnOutcome {
  if (opts.isConfirmationRetry) {
    return outcome('answer', 'incorrect', true, true, 'grade_feedback', interp.reply, true, extraFlags);
  }
  if (opts.simulationMode === 'practice') {
    // Copy-only distinction: a near-miss keeps the same retry/advance behavior
    // as any Practice mismatch, but the handler can choose warmer copy.
    const near = isNearMiss(opts.rawTranscript ?? null, item.acceptableAnswers);
    return outcome(
      'answer',
      null,
      false,
      false,
      'needs_confirmation',
      SAFE.practiceRetry,
      false,
      [...extraFlags, 'practice_retry', ...(near ? ['near_miss'] : [])],
      near ? 'practiceNearMissRetry' : 'practiceRetry',
    );
  }
  if (opts.simulationMode === 'study') {
    return outcome('answer', 'incorrect', true, true, 'grade_feedback', interp.reply, true, [...extraFlags, 'study_feedback']);
  }
  if (isNearMiss(opts.rawTranscript ?? null, item.acceptableAnswers)) {
    return outcome('answer', null, false, false, 'needs_confirmation', SAFE.confirm, false, [...extraFlags, 'awaiting_confirmation', 'near_miss'], 'nearMiss');
  }
  return outcome('answer', 'incorrect', true, true, 'grade_feedback', interp.reply, true, [...extraFlags, 'far_miss']);
}

function outcome(
  effectiveIntent: Intent | 'safe_fail',
  committedVerdict: TurnOutcome['committedVerdict'],
  scoreChanged: boolean,
  advanceQuestion: boolean,
  replyKind: ReplyKind,
  safeReply: string,
  useModelReply: boolean,
  flags: string[],
  safeReplyKey: ServerCopyKey | null = null,
): TurnOutcome {
  return { effectiveIntent, committedVerdict, scoreChanged, advanceQuestion, replyKind, safeReply, safeReplyKey, useModelReply, flags };
}
