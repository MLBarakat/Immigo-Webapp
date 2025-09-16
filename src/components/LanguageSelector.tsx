import React from 'react';

interface LanguageSelectorProps {
  currentLanguage: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ currentLanguage }) => {
   return (
    <div className="relative">
      <button
        className="flex items-center px-3 py-2 rounded-lg text-sm font-semibold text-deep-navy dark:text-star-white bg-immigo-gray-100 dark:bg-gray-700 hover:bg-immigo-gray-200 dark:hover:bg-gray-600"
        aria-label="Select Language"
        onClick={() => console.log('Open language selector')}
      >
        {currentLanguage}
      </button>
    </div>
  );
};