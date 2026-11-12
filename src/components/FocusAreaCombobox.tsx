import { useId, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { MAX_FOCUS_CATEGORIES, type FocusCategory } from '../constants/focusCategories';

export interface FocusAreaSelection {
  selectedIds: string[];
  allFocusAreas: boolean;
}

interface FocusAreaComboboxProps {
  categories: FocusCategory[];
  selectedIds: string[];
  allFocusAreas: boolean;
  onChange: (selection: FocusAreaSelection) => void;
  label: string;
  allLabel: string;
  searchPlaceholder: string;
  noResultsLabel: string;
  limitLabel: (limit: number) => string;
  disabled?: boolean;
  idPrefix?: string;
}

/**
 * Chip-based, searchable multi-select for USCIS study categories. Selected
 * categories render as removable chips above an inline search box. The "All
 * focus areas" option is exclusive; choosing a single category turns it off,
 * and removing the last category turns it back on. The dropdown expands on
 * typing or focus, as before.
 */
export function FocusAreaCombobox({
  categories,
  selectedIds,
  allFocusAreas,
  onChange,
  label,
  allLabel,
  searchPlaceholder,
  noResultsLabel,
  limitLabel,
  disabled = false,
  idPrefix,
}: FocusAreaComboboxProps) {
  const generatedId = useId();
  const baseId = idPrefix ?? generatedId;
  const labelId = `${baseId}-label`;
  const listboxId = `${baseId}-listbox`;
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return categories;
    return categories.filter(category => category.label.toLowerCase().includes(needle));
  }, [categories, query]);

  const atLimit = !allFocusAreas && selectedIds.length >= MAX_FOCUS_CATEGORIES;
  const options = useMemo(
    () => [
      { id: '__all__', label: allLabel, selected: allFocusAreas, disabled: false },
      ...filtered.map(category => ({
        id: category.id,
        label: category.label,
        selected: !allFocusAreas && selectedIds.includes(category.id),
        disabled: atLimit && !selectedIds.includes(category.id),
      })),
    ],
    [allFocusAreas, allLabel, atLimit, filtered, selectedIds],
  );

  // Individually selected categories render as removable chips. When "All" is
  // active there are no individual chips; the summary line below names it.
  const chips = useMemo(() => {
    if (allFocusAreas) return [];
    return selectedIds.map(id => {
      const category = categories.find(c => c.id === id);
      return { id, label: category?.label ?? id };
    });
  }, [allFocusAreas, categories, selectedIds]);

  const select = (id: string) => {
    if (id === '__all__') {
      onChange({ selectedIds: [], allFocusAreas: true });
      return;
    }
    const nextIds = allFocusAreas || !selectedIds.includes(id)
      ? [...(allFocusAreas ? [] : selectedIds), id].slice(0, MAX_FOCUS_CATEGORIES)
      : selectedIds.filter(selected => selected !== id);
    onChange({ selectedIds: nextIds, allFocusAreas: nextIds.length === 0 });
  };

  const removeChip = (id: string) => {
    if (id === '__all__') {
      onChange({ selectedIds: [], allFocusAreas: true });
      return;
    }
    select(id);
  };

  return (
    <div className="space-y-2">
      <label id={labelId} htmlFor={`${baseId}-input`} className="block text-sm font-medium text-deep-navy dark:text-white">
        {label}
      </label>
      <div
        data-testid="focus-area-input"
        className="rounded-xl border border-immigo-gray-300 bg-white p-2 focus-within:border-art-blue-600 focus-within:ring-2 focus-within:ring-art-blue-200 dark:border-gray-600 dark:bg-gray-900 dark:focus-within:ring-blue-900"
      >
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-label={`Remove ${chip.label}`}
              onClick={() => removeChip(chip.id)}
              disabled={disabled}
              className="flex min-h-8 items-center gap-1.5 rounded-full border border-immigo-gray-300 bg-immigo-gray-50 px-2.5 py-1 text-xs text-deep-navy hover:bg-immigo-gray-100 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
            >
              <span className="text-deep-navy dark:text-gray-300">{chip.label}</span>
              <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="relative min-w-[8rem]">
          <Search className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-immigo-gray-400" aria-hidden="true" />
          <input
            id={`${baseId}-input`}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `${baseId}-option-${options[activeIndex]?.id}` : undefined}
            autoComplete="off"
            value={query}
            disabled={disabled}
            placeholder={searchPlaceholder}
            onChange={event => {
              setQuery(event.target.value);
              setActiveIndex(-1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={event => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setOpen(true);
                setActiveIndex(current => Math.min(current + 1, options.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex(current => Math.max(current - 1, 0));
              } else if (event.key === 'Enter' && activeIndex >= 0) {
                event.preventDefault();
                const option = options[activeIndex];
                if (option && !option.disabled) select(option.id);
              } else if (event.key === 'Escape') {
                setQuery('');
                setActiveIndex(-1);
                setOpen(false);
              }
            }}
            className="min-h-8 w-full rounded-md border-0 bg-transparent py-1 pe-1 ps-8 text-sm text-deep-navy placeholder:text-immigo-gray-400 focus:outline-none focus:ring-0 disabled:opacity-60 dark:text-white"
          />
        </div>
      </div>

      {allFocusAreas ? (
        <p className="text-xs text-immigo-gray-500 dark:text-gray-400">{allLabel}</p>
      ) : (
        <p className="text-xs text-immigo-gray-500 dark:text-gray-400">
          {limitLabel(selectedIds.length)}
        </p>
      )}

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-labelledby={labelId}
          aria-multiselectable="true"
          className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-immigo-gray-200 bg-white p-1.5 shadow-sm dark:border-gray-700 dark:bg-gray-900"
        >
          {options.map((option) => (
            <li
              key={option.id}
              id={`${baseId}-option-${option.id}`}
              role="option"
              aria-selected={option.selected}
              aria-disabled={option.disabled || disabled}
            >
              <button
                type="button"
                tabIndex={-1}
                disabled={option.disabled || disabled}
                onMouseDown={event => event.preventDefault()}
                onClick={() => select(option.id)}
                className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-art-blue-600 ${
                  option.selected
                    ? 'bg-art-blue-50 font-semibold text-art-blue-800 dark:bg-blue-950/50 dark:text-blue-200'
                    : 'text-deep-navy hover:bg-immigo-gray-50 dark:text-gray-100 dark:hover:bg-gray-800'
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    option.selected
                      ? 'border-art-blue-700 bg-art-blue-700 text-white'
                      : 'border-immigo-gray-300 dark:border-gray-500'
                  }`}
                  aria-hidden="true"
                >
                  {option.selected && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">{option.label}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-2.5 py-2 text-sm text-immigo-gray-500 dark:text-gray-400">{noResultsLabel}</li>
          )}
        </ul>
      )}
    </div>
  );
}
