import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RightPanel } from '../RightPanel';

function renderPanel(overrides: Partial<Parameters<typeof RightPanel>[0]> = {}) {
  const onUpdateLearningGoals = vi.fn(async () => undefined);
  const props: Parameters<typeof RightPanel>[0] = {
    isCollapsed: false,
    onToggleCollapse: vi.fn(),
    simulationMode: 'practice',
    onSimulationModeChange: vi.fn(),
    testVersion: '2020',
    onTestVersionChange: vi.fn(),
    includeEnglishSimulation: false,
    onIncludeEnglishSimulationChange: vi.fn(),
    onClearSession: vi.fn(),
    onDownloadTranscript: vi.fn(),
    conversationLength: 0,
    appStatus: 'idle',
    learningGoal: null,
    weeklyGradedAnswerTarget: null,
    onUpdateLearningGoals,
    ...overrides,
  };
  render(<RightPanel {...props} />);
  return { onUpdateLearningGoals };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RightPanel learning goals', () => {
  it('shows Learning Goals as its own section under the question bank', () => {
    renderPanel();

    const questionBank = screen.getByText('Question bank');
    const goalsHeading = screen.getByRole('heading', { name: 'Learning Goals' });
    expect(
      questionBank.compareDocumentPosition(goalsHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('auto-saves a selected focus category without a Save button', async () => {
    const { onUpdateLearningGoals } = renderPanel();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Symbols' }));

    await waitFor(
      () => expect(onUpdateLearningGoals).toHaveBeenCalledWith({ learning_goal: 'Symbols' }),
      { timeout: 2000 },
    );
  });

  it('auto-saves a free-text Other goal and the weekly target', async () => {
    const { onUpdateLearningGoals } = renderPanel();

    fireEvent.change(screen.getByRole('textbox', { name: 'Other focus' }), {
      target: { value: 'Practice with my neighbor' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Weekly graded-answer target' }), {
      target: { value: '20' },
    });

    await waitFor(
      () => expect(onUpdateLearningGoals).toHaveBeenCalledWith({
        learning_goal: 'Practice with my neighbor',
        weekly_graded_answer_target: 20,
      }),
      { timeout: 2000 },
    );
  });
});
