import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedbackModal } from '../FeedbackModal';
import type { MockExamReview, MockExamReviewDecision } from '../../services/apiClient';

const review: MockExamReview = {
  report: '# Detailed interview report',
  feedback: {
    summary: 'You handled the civics questions well.',
    strengths: ['Good recall of the three branches'],
    suggestions: ['Review the Bill of Rights'],
    recommendedMode: 'practice',
    recommendationReason: 'Practice will reinforce the weaker areas.',
  },
  scorecard: {
    testVersion: '2020',
    civics: { correct: 8, incorrect: 2, total: 10, accuracyPercent: 80 },
    english: { included: true, readingPassed: true, writingPassed: false },
  },
  questionOutcomes: [
    { question: 'What are the two parts of the U.S. Congress?', verdict: 'correct', acceptableAnswers: null },
    { question: 'What is the supreme law of the land?', verdict: 'incorrect', acceptableAnswers: ['The Constitution'] },
  ],
  suggestedFocus: [
    { id: 'rights-and-responsibilities', label: 'Rights and Responsibilities' },
    { id: 'geography', label: 'Geography' },
  ],
};

const makeDecision = (
  choice: MockExamReviewDecision['choice'],
  note: string | null,
): MockExamReviewDecision => ({
  choice,
  note,
  decidedAt: '2026-11-04T12:00:00.000Z',
});

const makeProps = () => ({
  isOpen: true,
  examId: 'exam-1',
  onClose: vi.fn(),
  isLoading: false,
  review,
  error: null as string | null,
  decision: null as MockExamReviewDecision | null,
  decisionSaving: false,
  decisionError: null as string | null,
  onSaveDecision: vi.fn(async (
    choice: MockExamReviewDecision['choice'],
    note: string | null,
  ) => makeDecision(choice, note)),
  onContinueDecision: vi.fn(async () => true),
  onRetry: vi.fn(),
});

function chooseFocus(name: string) {
  fireEvent.focus(screen.getByRole('combobox'));
  const option = screen.getByRole('option', { name });
  const button = option.querySelector('button');
  if (!button) throw new Error(`Option "${name}" has no button`);
  fireEvent.click(button);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FeedbackModal', () => {
  it('renders the structured interview report with recorded score and question outcomes', () => {
    render(<FeedbackModal {...makeProps()} />);

    expect(screen.getByRole('heading', { name: 'Interview Report' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Score breakdown' })).toBeDefined();
    const questionReview = screen.getByText('Question-by-question');
    expect(questionReview).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Strengths and focus areas' })).toBeDefined();
    expect(screen.getByText('80%')).toBeDefined();
    expect(screen.getByText('8 / 10')).toBeDefined();
    expect(screen.getByText('Reading practice: passed')).toBeDefined();
    expect(screen.getByText('Writing practice: needs review')).toBeDefined();
    fireEvent.click(questionReview);
    expect(screen.getByText('What are the two parts of the U.S. Congress?')).toBeDefined();
    expect(screen.getByText('The Constitution')).toBeDefined();
    expect(screen.getByText('Good recall of the three branches')).toBeDefined();
  });

  it('says English was not administered when a civics fail skipped it', () => {
    const notAdministeredReview: MockExamReview = {
      ...review,
      scorecard: {
        ...review.scorecard,
        civics: { correct: 5, incorrect: 5, total: 10, accuracyPercent: 50 },
        english: { included: true, readingPassed: null, writingPassed: null },
      },
    };
    render(<FeedbackModal {...makeProps()} review={notAdministeredReview} />);

    expect(screen.getByText('Reading practice: not administered')).toBeDefined();
    expect(screen.getByText('Writing practice: not administered')).toBeDefined();
  });

  it('offers the suggested focus without applying it until the learner asks', () => {
    const props = makeProps();
    render(<FeedbackModal {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Practice a focus/ }));

    expect(screen.getByText('Suggested focus')).toBeDefined();
    expect(screen.getByText('Rights and Responsibilities')).toBeDefined();
    expect(screen.getByRole('combobox')).toBeDefined();
    expect(props.onSaveDecision).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Use this focus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    return waitFor(() => {
      expect(props.onSaveDecision).toHaveBeenCalledWith(
        'practice',
        'Rights and Responsibilities; Geography',
      );
    });
  });

  it('defaults to All focus areas so the report has a complete goal', async () => {
    const props = makeProps();
    render(<FeedbackModal {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Study a focus/ }));
    expect(screen.getByText('All focus areas')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(props.onSaveDecision).toHaveBeenCalledWith('study', 'All focus areas');
    });
  });

  it('limits focus choices to three and records free-text Other in the same decision', async () => {
    const props = makeProps();
    render(<FeedbackModal {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Study a focus/ }));
    const categories = [
      'Principles of American Democracy',
      'System of Government',
      'Rights and Responsibilities',
      'Colonial Period and Independence',
    ];
    chooseFocus(categories[0]);
    chooseFocus(categories[1]);
    chooseFocus(categories[2]);
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.getByText('3 of 3 selected')).toBeDefined();
    const blocked = screen.getByRole('option', { name: categories[3] }).querySelector('button');
    expect(blocked?.disabled).toBe(true);

    fireEvent.change(screen.getByRole('textbox', { name: 'Other focus' }), {
      target: { value: 'Local government' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(props.onSaveDecision).toHaveBeenCalledWith(
        'study',
        `${categories[0]}; ${categories[1]}; ${categories[2]}; Local government`,
      );
    });
  });

  it('returns to the choice cards with Back and discards unsaved focus edits', () => {
    const props = makeProps();
    render(<FeedbackModal {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Practice a focus/ }));
    chooseFocus('Symbols');
    fireEvent.change(screen.getByRole('textbox', { name: 'Other focus' }), {
      target: { value: 'Neighbour practice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('button', { name: /Practice a focus/ })).toBeDefined();
    expect(props.onSaveDecision).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Practice a focus/ }));
    expect(screen.getByText('All focus areas')).toBeDefined();
    expect(
      (screen.getByRole('textbox', { name: 'Other focus' }) as HTMLTextAreaElement).value,
    ).toBe('');
  });

  it('does not offer question review or the detailed report from the scorecard', () => {
    render(<FeedbackModal {...makeProps()} />);

    expect(screen.queryByRole('button', { name: /Review question-by-question/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open question review' })).toBeNull();
    expect(screen.queryByText('View the detailed report')).toBeNull();
    expect(screen.getByText('Question-by-question')).toBeDefined();
  });

  it('does not save a decision when the report is dismissed', () => {
    const props = makeProps();
    render(<FeedbackModal {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close report' }));

    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onSaveDecision).not.toHaveBeenCalled();
  });

  it('shows an existing decision without offering another immutable choice', () => {
    const props = makeProps();
    render(<FeedbackModal {...props} decision={makeDecision('finish_for_now', null)} />);

    expect(screen.getByText(/You chose to finish for now/)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Practice a focus/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Study a focus/ })).toBeNull();
  });
});
