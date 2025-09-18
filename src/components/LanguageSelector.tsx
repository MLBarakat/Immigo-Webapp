import React, {useCallback,useEffect,useId,useMemo,useRef,useState,} from "react";
import { ChevronDown } from "lucide-react";

interface Language {
  readonly code: string;
  readonly name: string;
  readonly flag: string;
}

const SUPPORTED_LANGUAGES: readonly Language[] = [
  { code: "en-US", name: "English (US)", label: "EN",flag: "🇺🇸" },
  { code: "es-ES", name: "Spanish", label: "ES", flag: "🇪🇸" },
  { code: "fr-FR", name: "French", label: "FR", flag: "🇫🇷" },
  { code: "ar-AR", name: "العربية", label: "ع", flag: "🇸🇦" },
];

interface LanguageSelectorProps {
  currentLanguageCode: string;
  onLanguageChange: (newLanguageCode: string) => void;
}

/**
 * Accessible language selector with visible emoji flags using your Tailwind theme.
 */
export function LanguageSelector({
  currentLanguageCode,
  onLanguageChange,
}: LanguageSelectorProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const idBase = useId();
  const menuId = `${idBase}-lang-menu`;

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedLanguage = useMemo(
    () =>
      SUPPORTED_LANGUAGES.find((l) => l.code === currentLanguageCode) ??
      SUPPORTED_LANGUAGES[0],
    [currentLanguageCode]
  );

  // Toggle open state and set initial activeIndex when opening
  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        const idx = SUPPORTED_LANGUAGES.findIndex(
          (l) => l.code === currentLanguageCode
        );
        setActiveIndex(idx >= 0 ? idx : 0);
      } else {
        setActiveIndex(null);
      }
      return next;
    });
  }, [currentLanguageCode]);

  // Close menu and return focus to button
  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(null);
    buttonRef.current?.focus();
  }, []);

  // Select a language
  const handleSelect = useCallback(
    (languageCode: string) => {
      onLanguageChange(languageCode);
      close();
    },
    [onLanguageChange, close]
  );

  // Click outside (pointerdown works for touch/mouse/stylus)
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveIndex(null);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  // When menu opens, focus the active item
  useEffect(() => {
    if (isOpen && activeIndex !== null) {
      const el = itemsRef.current[activeIndex];
      el?.focus();
    }
  }, [isOpen, activeIndex]);

  // Keyboard handling for the toggle button
  const onButtonKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          const idx = SUPPORTED_LANGUAGES.findIndex(
            (l) => l.code === currentLanguageCode
          );
          setActiveIndex(idx >= 0 ? idx : 0);
        } else {
          setActiveIndex((prev) =>
            prev === null ? 0 : Math.min(SUPPORTED_LANGUAGES.length - 1, prev + 1)
          );
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          const idx = SUPPORTED_LANGUAGES.findIndex(
            (l) => l.code === currentLanguageCode
          );
          setActiveIndex(idx >= 0 ? idx : 0);
        } else {
          setActiveIndex((prev) =>
            prev === null ? SUPPORTED_LANGUAGES.length - 1 : Math.max(0, prev - 1)
          );
        }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleOpen();
      } else if (e.key === "Escape") {
        if (isOpen) {
          e.preventDefault();
          close();
        }
      }
    },
    [isOpen, currentLanguageCode, toggleOpen, close]
  );

  // Keyboard handling for the menu list
  const onMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLUListElement>) => {
      const len = SUPPORTED_LANGUAGES.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev === null ? 0 : Math.min(len - 1, prev + 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev === null ? len - 1 : Math.max(0, prev - 1)));
      } else if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(len - 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (activeIndex !== null) {
          const lang = SUPPORTED_LANGUAGES[activeIndex];
          if (lang) handleSelect(lang.code);
        }
      }
    },
    [activeIndex, handleSelect, close]
  );

  // Helper to set individual item refs
  const setItemRef = (index: number) => (el: HTMLButtonElement | null) => {
    itemsRef.current[index] = el;
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        id={`${idBase}-lang-button`}
        type="button"
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-expanded={isOpen}
        onClick={toggleOpen}
        onKeyDown={onButtonKeyDown}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-deep-navy bg-immigo-gray-100 hover:bg-immigo-gray-200"
      >
        {/* Emoji flag visible and using your emoji font for consistent rendering */}
        <span role="img" aria-label={`${selectedLanguage.name} flag`} className="text-lg font-emoji">
          {selectedLanguage.flag}
        </span>

        {/* Language name hidden on very small screens */}
        <span className="hidden sm:inline">{selectedLanguage.label}</span>

        <ChevronDown
          aria-hidden="true"
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={`${idBase}-lang-button`}
          className="absolute top-full right-0 mt-2 w-48 bg-star-white rounded-lg shadow-lg border border-immigo-gray-200 z-10"
        >
          <ul className="py-1" onKeyDown={onMenuKeyDown}>
            {SUPPORTED_LANGUAGES.map((lang, index) => {
              const checked = lang.code === currentLanguageCode;
              return (
                <li key={lang.code} role="none">
                  <button
                    ref={setItemRef(index)}
                    role="menuitemradio"
                    aria-checked={checked}
                    tabIndex={checked ? 0 : -1}
                    type="button"
                    onClick={() => handleSelect(lang.code)}
                    onFocus={() => setActiveIndex(index)}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-deep-navy hover:bg-immigo-gray-100 focus:outline-none"
                  >
                    {/* emoji visible + announced by screen readers and using emoji font */}
                    <span role="img" aria-label={`${lang.name} flag`} className="text-lg font-emoji">
                      {lang.flag}
                    </span>

                    <span>{lang.name}</span>

                    <span className="sr-only">{checked ? "Selected" : ""}</span>
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
