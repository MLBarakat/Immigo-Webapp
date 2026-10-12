import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TermsModal } from './TermsModal';
import { PrivacyModal } from './PrivacyModal';

export const Footer: React.FC = () => {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  return (
    <footer className="w-full shrink-0 bg-deep-navy text-star-white py-2 px-3 sm:px-4 text-[10px] sm:text-sm border-t border-white/20">
      <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-row items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-left text-[9px] leading-tight text-immigo-gray-300 sm:text-xs" title={t('footer.disclaimer')}>
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
