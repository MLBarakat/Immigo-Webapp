import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { TermsModal } from './TermsModal';
import { PrivacyModal } from './PrivacyModal';

export const Footer: React.FC = () => {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [isDisclaimerFocused, setIsDisclaimerFocused] = useState(false);
  const [disclaimerOverflows, setDisclaimerOverflows] = useState(false);
  const disclaimerRef = useRef<HTMLParagraphElement>(null);

  // Re-check overflow whenever the rendered disclaimer text changes (e.g. language switch)
  // or the component re-mounts, so the marquee only plays when the text is actually cut off.
  useEffect(() => {
    const el = disclaimerRef.current;
    setDisclaimerOverflows(Boolean(el && el.scrollWidth > el.clientWidth));
  }, [t('footer.disclaimer'), i18n.language]);

  const handleDisclaimerFocus = () => setIsDisclaimerFocused(true);
  const handleDisclaimerBlur = () => setIsDisclaimerFocused(false);

  return (
    <footer className="w-full shrink-0 bg-deep-navy text-star-white py-2 px-3 sm:px-4 text-[10px] sm:text-sm border-t border-white/20">
      <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-row items-center justify-between gap-2">
        <p
          ref={disclaimerRef}
          tabIndex={0}
          onFocus={handleDisclaimerFocus}
          onBlur={handleDisclaimerBlur}
          onMouseEnter={handleDisclaimerFocus}
          onMouseLeave={handleDisclaimerBlur}
          className={[
            'min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left leading-tight text-immigo-gray-300 sm:text-xs',
            isDisclaimerFocused && disclaimerOverflows ? 'animate-marquee' : 'truncate',
          ].join(' ')}
          title={t('footer.disclaimer')}
        >
          {t('footer.disclaimer')}
        </p>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4 whitespace-nowrap text-[10px] sm:text-sm text-star-white">
          <span>&copy; {currentYear} ImmiGO</span>
          <button
            type="button"
            onClick={() => setShowTerms(true)}
            className="hover:text-immigo-gray-300 underline underline-offset-2 transition-colors"
          >
            {t('footer.terms')}
          </button>
          <button
            type="button"
            onClick={() => setShowPrivacy(true)}
            className="hover:text-immigo-gray-300 underline underline-offset-2 transition-colors"
          >
            {t('footer.privacy')}
          </button>
        </div>
      </div>

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </footer>
  );
};
