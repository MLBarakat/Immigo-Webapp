import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ChevronDown } from "lucide-react";

interface Language {
  readonly code: string;
  readonly name: string;
  readonly flag: string;
  readonly label: string;
}

const SUPPORTED_LANGUAGES: readonly Language[] = [
  { code: "en-US", name: "English (US)", label: "EN", flag: "🇺🇸" },
  { code: "es-ES", name: "Español", label: "ES", flag: "🇪🇸" },
  { code: "fr-FR", name: "Francés", label: "FR", flag: "🇫🇷" },
  { code: "ar-SA", name: "العربية", label: "ع", flag: "🇸🇦" },
];

interface LanguageSelectorProps {
  currentLanguageCode: string;
  onLanguageChange: (newLanguageCode: string) => void;
}

export function LanguageSelector({
  currentLanguageCode,
  onLanguageChange,
}: LanguageSelectorProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLanguage = useMemo(
    () =>
      SUPPORTED_LANGUAGES.find((l) => l.code === currentLanguageCode) ??
      SUPPORTED_LANGUAGES[0],
    [currentLanguageCode]
  );

  const handleSelect = useCallback(
    (languageCode: string) => {
      onLanguageChange(languageCode);
      setIsOpen(false);
    },
    [onLanguageChange]
  );

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(prev => !prev)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-deep-navy bg-immigo-gray-100 hover:bg-immigo-gray-200"
      >
        <span className="font-bold">{selectedLanguage.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-2 w-48 bg-star-white rounded-lg shadow-lg border border-immigo-gray-200 z-10"
        >
          <ul className="py-1">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const isSelected = lang.code === currentLanguageCode;
              return (
                <li key={lang.code} role="none">
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => handleSelect(lang.code)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left ${
                      isSelected ? 'font-bold text-art-blue-600' : 'text-deep-navy'
                    } hover:bg-immigo-gray-100 focus:outline-none focus:bg-immigo-gray-100`}
                  >
                    <span className="w-6 text-center font-bold">{lang.label}</span>
                    <span>{lang.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}