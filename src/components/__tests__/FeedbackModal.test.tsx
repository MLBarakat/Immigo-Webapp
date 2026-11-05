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

  it('requires a focus selection before saving a Practice decision', async () => {
    const props = makeProps();
    render(<FeedbackModal {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Practice a focus/ }));
    const saveButton = screen.getByRole('button', { name: 'Save my choice' }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Principles of American Democracy' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'System of Government' }));
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(props.onSaveDecision).toHaveBeenCalledWith(
        'practice',
        'Principles of American Democracy; System of Government',
      );
    });
    expect(props.onContinueDecision).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue in Practice Mode' }));
    await waitFor(() => {
      expect(props.onContinueDecision).toHaveBeenCalledWith(
        makeDecision('practice', 'Principles of American Democracy; System of Government'),
      );
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
    fireEvent.click(screen.getByRole('checkbox', { name: categories[0] }));
    fireEvent.click(screen.getByRole('checkbox', { name: categories[1] }));
    fireEvent.click(screen.getByRole('checkbox', { name: categories[2] }));
    expect(
      (screen.getByRole('checkbox', { name: categories[3] }) as HTMLInputElement).disabled,
    ).toBe(true);

    fireEvent.change(screen.getByRole('textbox', { name: 'Other focus' }), {
      target: { value: 'Local government' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save my choice' }));

    await waitFor(() => {
      expect(props.onSaveDecision).toHaveBeenCalledWith(
        'study',
        `${categories[0]}; ${categories[1]}; ${categories[2]}; Local government`,
      );
    });
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
