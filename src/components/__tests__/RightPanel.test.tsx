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

describe('RightPanel learning goals', () => {
  it('sends Question Bank selections to their persistence handlers', () => {
    const onTestVersionChange = vi.fn();
    const onIncludeEnglishSimulationChange = vi.fn();
    renderPanel({ onTestVersionChange, onIncludeEnglishSimulationChange });

    fireEvent.click(screen.getByRole('radio', { name: /2008/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include reading and writing practice' }));

    expect(onTestVersionChange).toHaveBeenCalledWith('2008');
    expect(onIncludeEnglishSimulationChange).toHaveBeenCalledWith(true);
  });

  it('shows a Question Bank persistence error inline', () => {
    renderPanel({ questionBankPreferenceError: 'Question Bank settings could not be saved.' });

    expect(screen.getByRole('alert').textContent).toBe('Question Bank settings could not be saved.');
  });

  it('shows Learning Goals as its own section under the question bank', () => {
    renderPanel();

    const questionBank = screen.getByText('Question bank');
    const goalsHeading = screen.getByRole('heading', { name: 'Learning Goals' });
    expect(
      questionBank.compareDocumentPosition(goalsHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('renames the mode section to Learning Modes', () => {
    renderPanel();

    expect(screen.getByText('Learning Modes')).toBeTruthy();
    expect(screen.queryByText('Simulation Modes')).toBeNull();
  });

  it('defaults the focus selector to All focus areas', () => {
    renderPanel();

    expect(screen.getByText('All focus areas')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Symbols' })).toBeNull();
  });

  it('auto-saves a selected focus category without a Save button', async () => {
    const { onUpdateLearningGoals } = renderPanel();

    chooseFocus('Symbols');

    await waitFor(
      () => expect(onUpdateLearningGoals).toHaveBeenCalledWith({ learning_goal: 'Symbols' }),
      { timeout: 2000 },
    );
  });

  it('stores the exact All focus areas sentinel when All is chosen again', async () => {
    const { onUpdateLearningGoals } = renderPanel({ learningGoal: 'Symbols' });

    chooseFocus('All focus areas');

    await waitFor(
      () => expect(onUpdateLearningGoals).toHaveBeenCalledWith({ learning_goal: 'All focus areas' }),
      { timeout: 2000 },
    );
  });

  it('auto-saves the weekly target without a Save button', async () => {
    const { onUpdateLearningGoals } = renderPanel();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Weekly graded-answer target' }), {
      target: { value: '20' },
    });

    await waitFor(
      () => expect(onUpdateLearningGoals).toHaveBeenCalledWith({
        learning_goal: 'All focus areas',
        weekly_graded_answer_target: 20,
      }),
      { timeout: 2000 },
    );
  });

  it('hides the whole Learning Goals section for the Standard Interview', () => {
    renderPanel({ simulationMode: 'standard' });

    expect(screen.queryByRole('heading', { name: 'Learning Goals' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Other focus' })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'Weekly graded-answer target' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('switches away from Standard Interview immediately without showing a pause dialog', () => {
    const onSimulationModeChange = vi.fn();
    renderPanel({
      simulationMode: 'standard',
      hasUnfinishedStandardInterview: true,
      onSimulationModeChange,
    });

    fireEvent.click(screen.getByRole('radio', { name: /Practice Mode/i }));

    expect(screen.queryByText(/Pause this Standard Interview/i)).toBeNull();
    expect(onSimulationModeChange).toHaveBeenCalledWith('practice');
  });
});
