import React from 'react';
import { useTranslation } from 'react-i18next';
import { FontSize } from '../types/settings';
import {
  FONT_SIZES,
  normalizeFontSize,
} from '../utils/fontSize';

interface FontSizeSelectorProps {
  currentFontSize: FontSize;
  onFontSizeChange: (fontSize: FontSize) => void;
}

export const FontSizeSelector: React.FC<FontSizeSelectorProps> = ({ currentFontSize, onFontSizeChange }) => {
  const { t } = useTranslation();
  const normalized = normalizeFontSize(currentFontSize);
  const currentIndex = FONT_SIZES.indexOf(normalized);
  const activeIndex = currentIndex === -1 ? FONT_SIZES.indexOf('default') : currentIndex;

  const increaseFontSize = () => {
    if (activeIndex < FONT_SIZES.length - 1) {
      onFontSizeChange(FONT_SIZES[activeIndex + 1]);
    }
  };

  const decreaseFontSize = () => {
    if (activeIndex > 0) {
      onFontSizeChange(FONT_SIZES[activeIndex - 1]);
    }
  };

  return (
    <div className="flex items-center gap-1 bg-immigo-gray-100 dark:bg-gray-700 rounded-lg p-1">
      <button
        type="button"
        onClick={decreaseFontSize}
        disabled={activeIndex === 0}
        className="p-1.5 rounded-md hover:bg-immigo-gray-200 dark:hover:bg-gray-600 text-immigo-gray-600 dark:text-immigo-gray-300 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
        aria-label={t('fontSize.decrease')}
        title={t('fontSize.decrease')}
      >
        A-
      </button>
      <button
        type="button"
        onClick={increaseFontSize}
        disabled={activeIndex === FONT_SIZES.length - 1}
        className="p-1.5 rounded-md hover:bg-immigo-gray-200 dark:hover:bg-gray-600 text-immigo-gray-600 dark:text-immigo-gray-300 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
        aria-label={t('fontSize.increase')}
        title={t('fontSize.increase')}
      >
        A+
      </button>
    </div>
  );
};
