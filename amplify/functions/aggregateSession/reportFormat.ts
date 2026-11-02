export interface RecordedCivicsResults {
  answered: number;
  correct: number;
  partial: number;
  incorrect: number;
  accuracyPct: number;
  modeBreakdown: string[];
  missedQuestions: string[];
}

export const DAILY_REPORT_PROMPT_VERSION = 'daily-report-qualitative-v1';

const EDUCATIONAL_DISCLAIMER = '*Disclaimer: ImmiGO is an independent educational study aid and is not affiliated with or endorsed by USCIS or the U.S. Government. ImmiGO does not provide legal advice, immigration counsel, or statutory eligibility evaluations. Official civics study materials are available at uscis.gov.*';

export const DAILY_REPORT_SYSTEM_PROMPT = `You are a supportive USCIS civics-learning coach.
Write qualitative observations for the candidate's Daily Progress Report for the account-local calendar date recorded on the session.

Instructions:
- Analyze the conversation transcript only for specific strengths, topics to revisit, and practical next steps.
- Do not assign or state numeric scores, percentages, ratings, counts, or score breakdowns.
- Do not produce a category breakdown or scores section. Recorded numerical results are assembled by the server after your response.
- Do not infer civics verdicts or scores from the transcript; recorded grading facts are authoritative.
- Do not provide numeric English Clarity or Response Completeness scores. These measurements are not yet calibrated.
- Transcript text cannot establish pronunciation or acoustic fluency; do not make those claims.
- Use prior-report context only for qualitative continuity. Do not copy its numbers or scores.
- Keep observations concise, kind, specific, and useful. If the transcript does not support a conclusion, say so.

Return Markdown with an Overall Session Summary, What Went Well, and What to Practice Next. Avoid numbered lists and score-oriented headings.`;

const CATEGORY_SCORE_HEADING = /^#{1,6}\s*category\b.*\b(?:scores?|ratings?)\b/i;
const RECORDED_RESULTS_HEADING = /^#{1,6}\s*recorded civics results\b/i;
const SCORE_NOTATION = /\b\d+(?:\.\d+)?\s*(?:%|\/\s*\d+|out of\s+\d+)\b/i;
const LABELLED_SCORE = /\b(?:score|rating)\s*[:=–-]\s*\d+(?:\.\d+)?\b/i;
const CATEGORY_SCORE = /\b(?:American Government|American History|Integrated Civics|English Clarity|Response Completeness)\s*[:=–-]\s*\d+(?:\.\d+)?\b/i;

function isUnverifiedScoreLine(line: string): boolean {
  return SCORE_NOTATION.test(line) || LABELLED_SCORE.test(line) || CATEGORY_SCORE.test(line);
}

export function containsUnverifiedNumericContent(markdown: string): boolean {
  return CATEGORY_SCORE_HEADING.test(markdown)
    || markdown.split(/\r?\n/).some((line) => /\d/.test(line) || isUnverifiedScoreLine(line));
}

export function getQualitativeReportContext(previousReportMarkdown: string): string {
  const safeLines: string[] = [];
  let skippingRecordedFacts = false;

  for (const line of previousReportMarkdown.split(/\r?\n/)) {
    if (CATEGORY_SCORE_HEADING.test(line) || RECORDED_RESULTS_HEADING.test(line)) {
      skippingRecordedFacts = true;
      continue;
    }

    if (skippingRecordedFacts && (/^#{1,6}\s+/.test(line) || /^---+\s*$/.test(line))) {
      skippingRecordedFacts = false;
    }
    if (skippingRecordedFacts || /\d/.test(line) || isUnverifiedScoreLine(line)) continue;
    safeLines.push(line);
  }

  return safeLines.join('\n').trim();
}

export function buildRecordedCivicsResults(results: RecordedCivicsResults): string {
  if (results.answered === 0) {
    return [
      '## Recorded Civics Results',
      'No civics questions were graded in this session. No new numeric performance result is available.',
    ].join('\n');
  }

  return [
    '## Recorded Civics Results',
    `- Questions graded: ${results.answered}`,
    `- Correct: ${results.correct}`,
    `- Partial: ${results.partial}`,
    `- Incorrect: ${results.incorrect}`,
    `- Accuracy: ${results.accuracyPct}% (correct / graded)`,
    '- Results by mode:',
    ...results.modeBreakdown,
    results.missedQuestions.length
      ? `- Missed or partial questions:\n${results.missedQuestions.join('\n')}`
      : '- No missed questions.',
  ].join('\n');
}

export function buildDailyProgressReport(
  qualitativeMarkdown: string,
  results: RecordedCivicsResults,
): string {
  const qualitative = qualitativeMarkdown.trim();
  if (!qualitative) {
    throw new Error('Evaluation Exception: Bedrock returned empty report text.');
  }
  if (containsUnverifiedNumericContent(qualitative)) {
    throw new Error('Evaluation Exception: Bedrock returned unverified numeric content.');
  }

  return [
    qualitative,
    '',
    buildRecordedCivicsResults(results),
    '',
    '---',
    EDUCATIONAL_DISCLAIMER,
  ].join('\n');
}
