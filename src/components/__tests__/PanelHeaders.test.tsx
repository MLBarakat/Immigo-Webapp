import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { LeftPanel } from '../LeftPanel';
import { RightPanel } from '../RightPanel';

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
  it('hides the Library title in the mobile header while keeping the desktop title', () => {
    const { rerender } = render(<LeftPanel {...leftPanelProps} isMobile />);

    expect(screen.queryByText('Learning & Resources')).toBeNull();
    expect(screen.getByText('USCIS Knowledge Bank')).toBeDefined();

    rerender(<LeftPanel {...leftPanelProps} />);

    expect(screen.getByText('Learning & Resources')).toBeDefined();
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
