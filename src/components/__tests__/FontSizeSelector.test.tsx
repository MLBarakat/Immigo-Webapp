import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FontSizeSelector } from '../FontSizeSelector';

afterEach(() => {
  cleanup();
});

describe('FontSizeSelector Component', () => {
  it('renders decrease and increase controls without text badge between them', () => {
    render(<FontSizeSelector currentFontSize="default" onFontSizeChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /decrease font size/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /increase font size/i })).toBeDefined();
    expect(screen.queryByText('M')).toBeNull();
    expect(screen.queryByText('default')).toBeNull();
  });

  it('calls onFontSizeChange with larger size when A+ is clicked', () => {
    const handleChange = vi.fn();
    render(<FontSizeSelector currentFontSize="default" onFontSizeChange={handleChange} />);

    const increaseBtn = screen.getByRole('button', { name: /increase font size/i });
    fireEvent.click(increaseBtn);

    expect(handleChange).toHaveBeenCalledWith('large');
  });

  it('calls onFontSizeChange with smaller size when A- is clicked', () => {
    const handleChange = vi.fn();
    render(<FontSizeSelector currentFontSize="default" onFontSizeChange={handleChange} />);

    const decreaseBtn = screen.getByRole('button', { name: /decrease font size/i });
    fireEvent.click(decreaseBtn);

    expect(handleChange).toHaveBeenCalledWith('small');
  });

  it('disables decrease button when at the smallest size (level 1: extra-small)', () => {
    render(<FontSizeSelector currentFontSize="extra-small" onFontSizeChange={vi.fn()} />);

    const decreaseBtn = screen.getByRole('button', { name: /decrease font size/i }) as HTMLButtonElement;
    const increaseBtn = screen.getByRole('button', { name: /increase font size/i }) as HTMLButtonElement;

    expect(decreaseBtn.disabled).toBe(true);
    expect(increaseBtn.disabled).toBe(false);
  });

  it('disables increase button when at the largest size (level 5: extra-large)', () => {
    render(<FontSizeSelector currentFontSize="extra-large" onFontSizeChange={vi.fn()} />);

    const decreaseBtn = screen.getByRole('button', { name: /decrease font size/i }) as HTMLButtonElement;
    const increaseBtn = screen.getByRole('button', { name: /increase font size/i }) as HTMLButtonElement;

    expect(decreaseBtn.disabled).toBe(false);
    expect(increaseBtn.disabled).toBe(true);
  });

  it('steps through all 5 levels correctly', () => {
    // Level 1: extra-small -> Level 2: small
    const change1 = vi.fn();
    const { rerender } = render(<FontSizeSelector currentFontSize="extra-small" onFontSizeChange={change1} />);
    fireEvent.click(screen.getByRole('button', { name: /increase font size/i }));
    expect(change1).toHaveBeenCalledWith('small');

    // Level 2: small -> Level 3: default
    const change2 = vi.fn();
    rerender(<FontSizeSelector currentFontSize="small" onFontSizeChange={change2} />);
    fireEvent.click(screen.getByRole('button', { name: /increase font size/i }));
    expect(change2).toHaveBeenCalledWith('default');

    // Level 3: default -> Level 4: large
    const change3 = vi.fn();
    rerender(<FontSizeSelector currentFontSize="default" onFontSizeChange={change3} />);
    fireEvent.click(screen.getByRole('button', { name: /increase font size/i }));
    expect(change3).toHaveBeenCalledWith('large');

    // Level 4: large -> Level 5: extra-large
    const change4 = vi.fn();
    rerender(<FontSizeSelector currentFontSize="large" onFontSizeChange={change4} />);
    fireEvent.click(screen.getByRole('button', { name: /increase font size/i }));
    expect(change4).toHaveBeenCalledWith('extra-large');
  });
});
