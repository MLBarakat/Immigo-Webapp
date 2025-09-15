import React, { useState, useRef, useEffect } from 'react';

function countryCodeToFlagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .split('')
    .map(char => String.fromCodePoint(char.charCodeAt(0) + 0x1F1E6 - 65))
    .join('');
}

const availableLanguages = [
  { code: 'en', name: 'English', flag: countryCodeToFlagEmoji('US') },
  { code: 'es', name: 'Español', flag: countryCodeToFlagEmoji('ES') },
  { code: 'fr', name: 'Français', flag: countryCodeToFlagEmoji('FR') },
  { code: 'ar', name: 'العربية', flag: countryCodeToFlagEmoji('AR') }
];

interface LanguageSelectorProps {
  currentLanguageCode: string;
  onLanguageChange: (newCode: string) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ currentLanguageCode, onLanguageChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const currentLanguage = availableLanguages.find(lang => lang.code === currentLanguageCode) || availableLanguages[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={selectorRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-immigo-gray-100"
      >
        <span>{currentLanguage.flag}</span>
        <span className="font-semibold text-sm">{currentLanguage.code.toUpperCase()}</span>
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-star-white rounded-lg shadow-lg py-1 z-20">
          {availableLanguages.map(lang => (
            <button
              key={lang.code}
              onClick={() => { onLanguageChange(lang.code); setIsOpen(false); }}
              className="flex w-full items-center px-4 py-2 text-sm text-deep-navy hover:bg-immigo-gray-100 text-left"
            >
              <span className="mr-3">{lang.flag}</span>
              {lang.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
