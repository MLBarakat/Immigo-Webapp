import React, { useState, useRef, useEffect } from 'react';

interface Language {
  code: string; // e.g., 'en', 'es', 'fr'
  name: string; // e.g., 'English', 'Spanish', 'French'
  flag: string; // URL or emoji for the flag
}

interface LanguageSelectorProps {
  currentLanguageCode: string;
  onLanguageChange: (newCode: string) => void;
  availableLanguages: Language[];
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  currentLanguageCode,
  onLanguageChange,
  availableLanguages,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  const currentLanguage = availableLanguages.find(
    (lang) => lang.code === currentLanguageCode
  ) || availableLanguages[0]; // Fallback to first language

  const handleToggle = () => setIsOpen(!isOpen);

  const handleSelectLanguage = (code: string) => {
    onLanguageChange(code);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative inline-block text-left" ref={selectorRef}>
      <div>
        <button
          type="button"
          className="inline-flex justify-center items-center w-full rounded-md border border-immigo-gray-300 shadow-sm px-4 py-2 bg-star-white text-sm font-medium text-deep-navy hover:bg-immigo-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-art-blue-500"
          id="menu-button"
          aria-expanded="true"
          aria-haspopup="true"
          onClick={handleToggle}
        >
          <span className="mr-2 text-xl">{currentLanguage.flag}</span>
          {currentLanguage.code.toUpperCase()}
          <svg
            className="-mr-1 ml-2 h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div
          className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-star-white ring-1 ring-black ring-opacity-5 focus:outline-none z-20"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="menu-button"
        >
          <div className="py-1" role="none">
            {availableLanguages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelectLanguage(lang.code)}
                className="text-deep-navy block px-4 py-2 text-sm hover:bg-immigo-gray-100 w-full text-left"
                role="menuitem"
              >
                <span className="mr-2 text-xl">{lang.flag}</span>
                {lang.name} ({lang.code.toUpperCase()})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};