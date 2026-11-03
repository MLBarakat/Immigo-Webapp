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

  it('requires an explicit goal and confirmation before saving a Practice decision', async () => {
    const props = makeProps();
    render(<FeedbackModal {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Practice a focus/ }));
    const saveButton = screen.getByRole('button', { name: 'Save my choice' }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('What would you like to focus on?'), {
      target: { value: 'Review the Bill of Rights' },
    });
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(props.onSaveDecision).toHaveBeenCalledWith('practice', 'Review the Bill of Rights');
    });
    expect(props.onContinueDecision).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue in Practice Mode' }));
    await waitFor(() => {
      expect(props.onContinueDecision).toHaveBeenCalledWith(
        makeDecision('practice', 'Review the Bill of Rights'),
      );
    });
  });

  it('records a Review answers choice and displays the saved question review', async () => {
    const props = makeProps();
    render(<FeedbackModal {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Review question-by-question/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save my choice' }));

    await waitFor(() => {
      expect(props.onSaveDecision).toHaveBeenCalledWith('review_answers', null);
    });
    expect(screen.getByText('Your choice is saved')).toBeDefined();
    expect(screen.getByText('What is the supreme law of the land?')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Choose Study Mode' })).toBeNull();
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
