import React from 'react';
import { FontSize } from '../types/settings'; // Import FontSize type

interface FontSizeSelectorProps {
  currentFontSize: FontSize;
  onFontSizeChange: (fontSize: FontSize) => void;
}

export const FontSizeSelector: React.FC<FontSizeSelectorProps> = ({ currentFontSize, onFontSizeChange }) => {
  const sizes: FontSize[] = ['small', 'default', 'large'];
  const currentIndex = sizes.indexOf(currentFontSize);

  const increaseFontSize = () => {
    if (currentIndex < sizes.length - 1) {
      onFontSizeChange(sizes[currentIndex + 1]);
    }
  };

  const decreaseFontSize = () => {
    if (currentIndex > 0) {
      onFontSizeChange(sizes[currentIndex - 1]);
    }
  };

  return (
    <div className="flex items-center gap-1 bg-immigo-gray-100 dark:bg-gray-700 rounded-lg p-1">
      <button
        onClick={decreaseFontSize}
        disabled={currentIndex === 0}
        className="p-1.5 rounded-md hover:bg-immigo-gray-200 dark:hover:bg-gray-600 text-immigo-gray-600 dark:text-immigo-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
        aria-label="Decrease font size"
      >
        A-
      </button>
      <span className="px-1 text-sm font-medium text-deep-navy dark:text-star-white">
        {/* Display current font size state if needed, or keep hidden as per wireframe */}
      </span>
      <button
        onClick={increaseFontSize}
        disabled={currentIndex === sizes.length - 1}
        className="p-1.5 rounded-md hover:bg-immigo-gray-200 dark:hover:bg-gray-600 text-immigo-gray-600 dark:text-immigo-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
        aria-label="Increase font size"
      >
        A+
      </button>
    </div>
  );
};