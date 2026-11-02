import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedbackModal } from '../FeedbackModal';
import type { MockExamFeedback } from '../../services/apiClient';

const feedback: MockExamFeedback = {
  summary: 'You handled the civics questions well.',
  strengths: ['Good recall of the three branches'],
  suggestions: ['Review the Bill of Rights'],
  recommendedMode: 'practice',
  recommendationReason: 'Practice will reinforce the weaker areas.',
};

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  isLoading: false,
  feedback,
  report: '# Exam report',
  error: null,
  onStartPractice: vi.fn(),
  onChooseMode: vi.fn(),
  onSetGoal: vi.fn(),
  onStartNewExam: vi.fn(),
  onRetry: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FeedbackModal', () => {
  it('renders nothing when closed', () => {
    render(<FeedbackModal {...baseProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the loading state', () => {
    render(<FeedbackModal {...baseProps} isLoading feedback={null} />);
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('shows an error and retries', () => {
    const onRetry = vi.fn();
    render(<FeedbackModal {...baseProps} error="Network unavailable" feedback={null} onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the review and starts the recommended mode', () => {
    const onStartPractice = vi.fn();
    render(<FeedbackModal {...baseProps} onStartPractice={onStartPractice} />);

    expect(screen.getByRole('heading', { name: 'Your Standard Interview review' })).toBeDefined();
    expect(screen.getByText(feedback.summary)).toBeDefined();
    expect(screen.getByText('Good recall of the three branches')).toBeDefined();
    expect(screen.getByText('Review the Bill of Rights')).toBeDefined();
    expect(screen.getByText('# Exam report')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /start practice mode/i }));
    expect(onStartPractice).toHaveBeenCalledWith('practice');
  });

  it('supports choosing another mode and setting a goal', () => {
    const onChooseMode = vi.fn();
    const onSetGoal = vi.fn();
    render(<FeedbackModal {...baseProps} onChooseMode={onChooseMode} onSetGoal={onSetGoal} />);

    fireEvent.click(screen.getByRole('button', { name: /choose another mode/i }));
    fireEvent.click(screen.getByRole('button', { name: /study mode/i }));
    expect(onChooseMode).toHaveBeenCalledWith('study');

    fireEvent.click(screen.getByRole('button', { name: /set a different goal/i }));
    fireEvent.change(screen.getByLabelText(/what would you like to focus on/i), {
      target: { value: 'Remember the Bill of Rights' },
    });
    fireEvent.click(screen.getByRole('button', { name: /use this goal/i }));
    expect(onSetGoal).toHaveBeenCalledWith('Remember the Bill of Rights', 'practice');
  });

  it('closes on the close button and on Escape', () => {
    const onClose = vi.fn();
    render(<FeedbackModal {...baseProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /close exam review/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
