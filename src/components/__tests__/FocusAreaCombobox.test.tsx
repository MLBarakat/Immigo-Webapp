import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusAreaCombobox } from '../FocusAreaCombobox';
import { getFocusCategories } from '../../constants/focusCategories';

const CATEGORIES = getFocusCategories('2020');

function renderCombobox(overrides: Partial<Parameters<typeof FocusAreaCombobox>[0]> = {}) {
  const onChange = vi.fn();
  const props: Parameters<typeof FocusAreaCombobox>[0] = {
    categories: CATEGORIES,
    selectedIds: [],
    allFocusAreas: true,
    onChange,
    label: 'Focus areas',
    allLabel: 'All focus areas',
    searchPlaceholder: 'Search focus areas',
    noResultsLabel: 'No focus areas found',
    limitLabel: (limit: number) => `${limit} of 3 selected`,
    ...overrides,
  };
  render(<FocusAreaCombobox {...props} />);
  return { onChange };
}

function option(name: string): HTMLElement {
  return screen.getByRole('option', { name });
}

function optionButton(name: string): HTMLButtonElement {
  const button = option(name).querySelector('button');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Option "${name}" has no button`);
  }
  return button;
}

afterEach(cleanup);

describe('FocusAreaCombobox', () => {
  it('starts on All focus areas and lists the official categories', () => {
    renderCombobox();
    fireEvent.focus(screen.getByRole('combobox'));

    expect(option('All focus areas').getAttribute('aria-selected')).toBe('true');
    expect(option('Symbols').getAttribute('aria-selected')).toBe('false');
    expect(screen.getAllByRole('option')).toHaveLength(CATEGORIES.length + 1);
  });

  it('turns All off when an individual focus area is chosen', () => {
    const { onChange } = renderCombobox();
    fireEvent.focus(screen.getByRole('combobox'));

    fireEvent.click(optionButton('Symbols'));

    expect(onChange).toHaveBeenCalledWith({ selectedIds: ['symbols'], allFocusAreas: false });
  });

  it('keeps removable selected chips inside the multi-select input container', () => {
    renderCombobox({ selectedIds: ['symbols'], allFocusAreas: false });

    const container = screen.getByTestId('focus-area-input');
    const chip = screen.getByRole('button', { name: 'Remove Symbols' });
    expect(container.contains(chip)).toBe(true);
  });

  it('returns to All when the last chosen focus area is cleared', () => {
    const { onChange } = renderCombobox({ selectedIds: ['symbols'], allFocusAreas: false });
    fireEvent.focus(screen.getByRole('combobox'));

    fireEvent.click(optionButton('Symbols'));

    expect(onChange).toHaveBeenCalledWith({ selectedIds: [], allFocusAreas: true });
  });

  it('prevents a fourth category and says the limit is three', () => {
    renderCombobox({
      selectedIds: ['symbols', 'geography', 'holidays'],
      allFocusAreas: false,
    });
    fireEvent.focus(screen.getByRole('combobox'));

    expect(screen.getByText('3 of 3 selected')).toBeTruthy();
    expect(option('Symbols').getAttribute('aria-selected')).toBe('true');
    expect(optionButton('System of Government').disabled).toBe(true);
  });

  it('filters the list as the learner searches', () => {
    renderCombobox();
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'geo' } });

    expect(option('Geography')).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Symbols' })).toBeNull();
    expect(option('All focus areas')).toBeTruthy();
  });

  it('maps the keyboard to the listbox options', () => {
    const { onChange } = renderCombobox();
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(option('All focus areas').id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith({
      selectedIds: [CATEGORIES[0].id],
      allFocusAreas: false,
    });
  });
});
