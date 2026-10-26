import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeftPanel } from '../LeftPanel';
import { RightPanel } from '../RightPanel';

afterEach(() => {
  cleanup();
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
});
