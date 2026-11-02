import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { LeftPanel } from '../LeftPanel';
import { RightPanel } from '../RightPanel';
import { fetchWeeklyProgressStats } from '../../services/liveProgressService';

vi.mock('../../services/liveProgressService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/liveProgressService')>();
  return {
    ...actual,
    fetchProgressReports: vi.fn().mockResolvedValue([]),
    fetchWeeklyProgressStats: vi.fn().mockResolvedValue({
      answered: 7,
      correct: 4,
      incorrect: 2,
      partial: 1,
      accuracyPct: 57,
      missedItemIds: ['q2', 'q3', 'q4'],
    }),
  };
});

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en-US');
});

const leftPanelProps = {
  isCollapsed: false,
  onToggleCollapse: vi.fn(),
  liveStats: null,
  conversationLength: 0,
};

describe('workspace panel headers', () => {
  it('labels English clarity and response completeness as not measured yet', () => {
    render(
      <LeftPanel
        {...leftPanelProps}
        conversationLength={1}
        liveStats={{
          answered: 1,
          correct: 1,
          incorrect: 0,
          partial: 0,
          accuracyPct: 100,
          missedItemIds: [],
        }}
      />
    );

    expect(screen.getAllByText('Not measured yet')).toHaveLength(2);
  });

  it('asks before leaving an unfinished Standard Interview', async () => {
    const onSimulationModeChange = vi.fn().mockResolvedValue(true);
    const props = {
      isCollapsed: false,
      onToggleCollapse: vi.fn(),
      simulationMode: 'standard' as const,
      onSimulationModeChange,
      testVersion: '2020' as const,
      onTestVersionChange: vi.fn(),
      includeEnglishSimulation: false,
      onIncludeEnglishSimulationChange: vi.fn(),
      onClearSession: vi.fn(),
      onDownloadTranscript: vi.fn(),
      conversationLength: 0,
      appStatus: 'idle' as const,
      hasUnfinishedStandardInterview: true,
      onResumeStandardInterview: vi.fn(),
      onStartNewStandardInterview: vi.fn(),
    };

    render(<RightPanel {...props} />);
    fireEvent.click(screen.getByRole('radio', { name: /study mode/i }));

    expect(screen.getByRole('dialog', { name: /pause this standard interview/i })).toBeDefined();
    expect(onSimulationModeChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /switch to study mode/i }));
    expect(onSimulationModeChange).toHaveBeenCalledWith('study');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the mode decision open and explains when switching fails', async () => {
    const props = {
      isCollapsed: false,
      onToggleCollapse: vi.fn(),
      simulationMode: 'standard' as const,
      onSimulationModeChange: vi.fn().mockResolvedValue(false),
      testVersion: '2020' as const,
      onTestVersionChange: vi.fn(),
      includeEnglishSimulation: false,
      onIncludeEnglishSimulationChange: vi.fn(),
      onClearSession: vi.fn(),
      onDownloadTranscript: vi.fn(),
      conversationLength: 0,
      appStatus: 'idle' as const,
      hasUnfinishedStandardInterview: true,
    };

    render(<RightPanel {...props} />);
    fireEvent.click(screen.getByRole('radio', { name: /study mode/i }));
    fireEvent.click(screen.getByRole('button', { name: /switch to study mode/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      "We couldn't update the interview. Your current mode and progress are unchanged. Please try again."
    );
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('does not silently change modes when a direct transition fails', async () => {
    const props = {
      isCollapsed: false,
      onToggleCollapse: vi.fn(),
      simulationMode: 'practice' as const,
      onSimulationModeChange: vi.fn().mockResolvedValue(false),
      testVersion: '2020' as const,
      onTestVersionChange: vi.fn(),
      includeEnglishSimulation: false,
      onIncludeEnglishSimulationChange: vi.fn(),
      onClearSession: vi.fn(),
      onDownloadTranscript: vi.fn(),
      conversationLength: 0,
      appStatus: 'idle' as const,
    };

    render(<RightPanel {...props} />);
    fireEvent.click(screen.getByRole('radio', { name: /study mode/i }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect((screen.getByRole('radio', { name: /practice mode/i }) as HTMLInputElement).checked).toBe(true);
  });

  it('offers resume or new when returning to Standard with an unfinished interview', () => {
    const onResumeStandardInterview = vi.fn();
    const onStartNewStandardInterview = vi.fn();
    const props = {
      isCollapsed: false,
      onToggleCollapse: vi.fn(),
      simulationMode: 'practice' as const,
      onSimulationModeChange: vi.fn(),
      testVersion: '2020' as const,
      onTestVersionChange: vi.fn(),
      includeEnglishSimulation: false,
      onIncludeEnglishSimulationChange: vi.fn(),
      onClearSession: vi.fn(),
      onDownloadTranscript: vi.fn(),
      conversationLength: 0,
      appStatus: 'idle' as const,
      hasUnfinishedStandardInterview: true,
      onResumeStandardInterview,
      onStartNewStandardInterview,
    };

    render(<RightPanel {...props} />);
    fireEvent.click(screen.getByRole('radio', { name: /standard interview/i }));

    expect(screen.getByRole('dialog', { name: /unfinished standard interview/i })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /resume interview/i }));
    expect(onResumeStandardInterview).toHaveBeenCalledOnce();
    expect(onStartNewStandardInterview).not.toHaveBeenCalled();
  });

  it('hides the Library title in the mobile header while keeping the desktop title', () => {
    const { rerender } = render(<LeftPanel {...leftPanelProps} isMobile />);

    expect(screen.queryByText('Learning & Resources')).toBeNull();
    expect(screen.getByText('USCIS Knowledge Bank')).toBeDefined();

    rerender(<LeftPanel {...leftPanelProps} />);

    expect(screen.getByText('Learning & Resources')).toBeDefined();
  });

  it('shows weekly progress and confirms before applying a saved focus in Study Mode', async () => {
    const onApplySavedFocus = vi.fn().mockResolvedValue(true);
    render(
      <LeftPanel
        {...leftPanelProps}
        userId="user-1"
        accountTimezone="America/Chicago"
        learningGoal="Review the branches of government"
        weeklyGradedAnswerTarget={20}
        simulationMode="study"
        canApplySavedFocus
        onApplySavedFocus={onApplySavedFocus}
        onOpenSettings={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByText('7 of 20 graded answers')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Apply saved focus' }));
    expect(screen.getByRole('dialog', { name: 'Use your saved focus?' })).toBeDefined();
    expect(onApplySavedFocus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Use this focus' }));
    await waitFor(() => expect(onApplySavedFocus).toHaveBeenCalledWith('Review the branches of government'));
  });

  it('does not offer to apply a saved focus during a Standard Interview', () => {
    render(
      <LeftPanel
        {...leftPanelProps}
        userId="user-1"
        learningGoal="Review the branches of government"
        simulationMode="standard"
        onApplySavedFocus={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Apply saved focus' })).toBeNull();
  });

  it('shows a weekly-progress error and retries the account-local query', async () => {
    vi.mocked(fetchWeeklyProgressStats)
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({
        answered: 3,
        correct: 2,
        incorrect: 1,
        partial: 0,
        accuracyPct: 67,
        missedItemIds: ['q3'],
      });
    render(
      <LeftPanel
        {...leftPanelProps}
        userId="user-1"
        accountTimezone="America/Chicago"
        onOpenSettings={vi.fn()}
      />
    );

    expect(await screen.findByText('Weekly progress could not be loaded.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('3 graded answers this week')).toBeDefined());
  });

  it('keeps focus confirmation open and reports when the saved focus cannot be applied', async () => {
    render(
      <LeftPanel
        {...leftPanelProps}
        userId="user-1"
        learningGoal="Review the branches of government"
        simulationMode="practice"
        canApplySavedFocus
        onApplySavedFocus={vi.fn().mockResolvedValue(false)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply saved focus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use this focus' }));

    expect(await screen.findByText('The saved focus could not be sent. Check the conversation and try again.')).toBeDefined();
    expect(screen.getByRole('dialog', { name: 'Use your saved focus?' })).toBeDefined();
  });

  it('hides the Controls title in the mobile header while keeping the desktop title', () => {
    const rightPanelProps = {
      isCollapsed: false,
      onToggleCollapse: vi.fn(),
      simulationMode: 'standard' as const,
      onSimulationModeChange: vi.fn(),
      testVersion: '2020' as const,
      onTestVersionChange: vi.fn(),
      includeEnglishSimulation: false,
      onIncludeEnglishSimulationChange: vi.fn(),
      onClearSession: vi.fn(),
      onDownloadTranscript: vi.fn(),
      conversationLength: 0,
      appStatus: 'idle' as const,
    };
    const { rerender } = render(<RightPanel {...rightPanelProps} isMobile />);

    expect(screen.queryByText('Configuration & Control')).toBeNull();
    expect(screen.getByText('Simulation Modes')).toBeDefined();

    rerender(<RightPanel {...rightPanelProps} />);

    expect(screen.getByText('Configuration & Control')).toBeDefined();
  });

  it('mirrors the desktop library header in Arabic without moving the physical panel border', async () => {
    await i18n.changeLanguage('ar-SA');
    const { container } = render(<LeftPanel {...leftPanelProps} />);

    const aside = container.querySelector('aside');
    const title = screen.getByText(String(i18n.t('workspace.left.title', { ns: 'conversation' })));
    const titleGroup = title.parentElement as HTMLElement;
    const header = titleGroup.parentElement as HTMLElement;

    expect(aside?.className).toContain('border-r');
    expect(aside?.className).not.toContain('border-l');
    expect(header.className).toContain('flex-row-reverse');
    expect(header.firstElementChild).toBe(titleGroup);
  });

  it('keeps the controls panel border on the physical left in Arabic', async () => {
    await i18n.changeLanguage('ar-SA');
    const { container } = render(
      <RightPanel
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        simulationMode="standard"
        onSimulationModeChange={vi.fn()}
        testVersion="2020"
        onTestVersionChange={vi.fn()}
        includeEnglishSimulation={false}
        onIncludeEnglishSimulationChange={vi.fn()}
        onClearSession={vi.fn()}
        onDownloadTranscript={vi.fn()}
        conversationLength={0}
        appStatus="idle"
      />
    );

    const aside = container.querySelector('aside');
    expect(aside?.className).toContain('border-l');
    expect(aside?.className).not.toContain('border-r');
  });
});
