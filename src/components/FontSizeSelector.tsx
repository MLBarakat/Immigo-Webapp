import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface FontSizeSelectorProps {
  min?: number;
  max?: number;
  step?: number;
  initialSize?: number;
  onChange?: (size: number) => void;
}

export const FontSizeSelector: React.FC<FontSizeSelectorProps> = ({
  min = 12,
  max = 24,
  step = 2,
  initialSize = 16,
  onChange,
}) => {
  const [fontSize, setFontSize] = useState(initialSize);

  const handleDecrease = () => {
    setFontSize(prev => {
      const newSize = Math.max(min, prev - step);
      onChange?.(newSize);
      return newSize;
    });
  };

  const handleIncrease = () => {
    setFontSize(prev => {
      const newSize = Math.min(max, prev + step);
      onChange?.(newSize);
      return newSize;
    });
  };

  return (
    <div className="flex items-center space-x-1 p-1 rounded-lg bg-immigo-gray-100 border border-immigo-gray-200">
      <button
        onClick={handleDecrease}
        disabled={fontSize <= min}
        className="p-1 text-immigo-gray-600 hover:bg-immigo-gray-200 disabled:opacity-40 rounded"
        aria-label="Decrease font size"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span
        className="px-2 text-sm font-bold text-deep-navy"
        aria-live="polite"
        aria-label={`Current font size ${fontSize}`}
        style={{ fontSize }}
      >
        A
      </span>
      <button
        onClick={handleIncrease}
        disabled={fontSize >= max}
        className="p-1 text-immigo-gray-600 hover:bg-immigo-gray-200 disabled:opacity-40 rounded"
        aria-label="Increase font size"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};
