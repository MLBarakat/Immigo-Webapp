import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { TermsModal } from './TermsModal';
import { PrivacyModal } from './PrivacyModal';

export const Footer: React.FC = () => {
  const { t } = useTranslation();
  const disclaimerText = t('footer.disclaimer');
  const currentYear = new Date().getFullYear();
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [isDisclaimerFocused, setIsDisclaimerFocused] = useState(false);
  const [disclaimerOverflows, setDisclaimerOverflows] = useState(false);
  // Distance (as % of the full text width) needed to scroll the entire
  // disclaimer through the visible container.
  const [marqueeDistance, setMarqueeDistance] = useState(0);
  const disclaimerRef = useRef<HTMLParagraphElement>(null);
  const disclaimerTextRef = useRef<HTMLSpanElement>(null);

  // Re-check overflow whenever the rendered disclaimer text changes
  // (e.g. language switch) or the component re-mounts.
  useEffect(() => {
    const container = disclaimerRef.current;
    const text = disclaimerTextRef.current;
    if (container && text) {
      const overflow = text.scrollWidth - container.clientWidth;
      setDisclaimerOverflows(overflow > 0);
      setMarqueeDistance(
        overflow > 0 ? Math.round((overflow / text.scrollWidth) * 100) : 0
      );
    }
  }, [disclaimerText]);

  const dir = i18n.dir();
  // RTL languages read right-to-left, so the marquee travels in the
  // opposite direction (positive translateX).
  const sign = dir === 'rtl' ? '' : '-';

  const isMarqueeActive = isDisclaimerFocused && disclaimerOverflows && marqueeDistance > 0;

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
            'min-w-0 flex-1 overflow-hidden text-left leading-tight text-immigo-gray-300 sm:text-xs',
            !isMarqueeActive ? 'truncate' : '',
          ].join(' ')}
          title={disclaimerText}
        >
          {/* Inner span keeps the full text width so the marquee scrolls the
              entire sentence, not just the visible portion. */}
          <span
            ref={disclaimerTextRef}
            className="inline-block whitespace-nowrap will-change-transform"
            style={{
              transform: isMarqueeActive
                ? `translateX(${sign}${marqueeDistance}%)`
                : 'translateX(0%)',
              transition: isMarqueeActive
                ? 'transform 20s linear'
                : 'transform 0.4s ease-out',
            }}
          >
            {disclaimerText}
          </span>
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
