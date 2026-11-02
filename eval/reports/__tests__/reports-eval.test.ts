import { describe, expect, it } from 'vitest';
import cases from '../report-cases.json';
import {
  buildDailyProgressReport,
  getQualitativeReportContext,
  type RecordedCivicsResults,
} from '../../../amplify/functions/aggregateSession/reportFormat';

const recordedResults: RecordedCivicsResults = {
  answered: 4,
  correct: 2,
  partial: 1,
  incorrect: 1,
  accuracyPct: 50,
  modeBreakdown: ['- standard: 1/2 correct (50%)', '- practice: 1/2 correct (50%)'],
  missedQuestions: ['  * (2020:q-2) Name one right only for United States citizens.'],
};

describe('daily report synthetic golden set', () => {
  it.each(cases)('$name — $reason', ({ markdown, accepted }) => {
    if (accepted) {
      expect(() => buildDailyProgressReport(markdown, recordedResults)).not.toThrow();
      return;
    }

    expect(() => buildDailyProgressReport(markdown, recordedResults))
      .toThrow(/unverified numeric content/i);
  });

  it('keeps every numeric result in the report server-generated', () => {
    const report = buildDailyProgressReport(
      '# Daily Report\n\n## What Went Well\nYou explained your answer clearly.',
      recordedResults,
    );

    expect(report).toContain('Questions graded: 4');
    expect(report).toContain('Accuracy: 50%');
    expect(report).toContain('- standard: 1/2 correct (50%)');
    expect(report).toContain('(2020:q-2)');
    expect(report).toContain('You explained your answer clearly.');
  });

  it('removes old score and recorded-result sections from model context', () => {
    const previousReport = [
      '# Daily Report',
      '## What Went Well',
      'Your explanations were clear.',
      '## Recorded Civics Results',
      '- Questions graded: 8',
      '- Accuracy: 75%',
      '## What to Practice Next',
      'Review the branches of government.',
      '## Category Breakdown & Scores',
      'American Government: 85/100',
      '---',
      'A numerical disclaimer reference such as N-400 should not be sent as qualitative context.',
    ].join('\n');

    const context = getQualitativeReportContext(previousReport);

    expect(context).toContain('Your explanations were clear.');
    expect(context).toContain('Review the branches of government.');
    expect(context).not.toContain('Recorded Civics Results');
    expect(context).not.toContain('Questions graded: 8');
    expect(context).not.toContain('75%');
    expect(context).not.toContain('85/100');
    expect(context).not.toContain('N-400');
  });

  it('states that no numeric performance result exists when nothing was graded', () => {
    const report = buildDailyProgressReport(
      '# Daily Report\n\n## What Went Well\nYou used the study conversation to ask a focused question.',
      {
        answered: 0,
        correct: 0,
        partial: 0,
        incorrect: 0,
        accuracyPct: 0,
        modeBreakdown: [],
        missedQuestions: [],
      },
    );

    expect(report).toContain('No civics questions were graded in this session.');
    expect(report).not.toContain('Accuracy: 0%');
  });

  it('states when recorded answers had no missed or partial questions', () => {
    const report = buildDailyProgressReport(
      '# Daily Report\n\n## What Went Well\nYou explained your answer clearly.',
      {
        ...recordedResults,
        correct: 4,
        partial: 0,
        incorrect: 0,
        accuracyPct: 100,
        modeBreakdown: ['- standard: 4/4 correct (100%)'],
        missedQuestions: [],
      },
    );

    expect(report).toContain('- No missed questions.');
    expect(report).not.toContain('Missed or partial questions:');
  });
});
