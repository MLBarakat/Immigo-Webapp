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
    <footer className="w-full shrink-0 bg-star-white dark:bg-gray-800 text-immigo-gray-600 dark:text-immigo-gray-400 py-2 px-3 sm:px-4 text-[10px] sm:text-sm border-t border-immigo-gray-200 dark:border-gray-700">
      <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-row items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-left text-[9px] leading-tight text-immigo-gray-500 sm:text-xs" title={t('footer.disclaimer')}>
          {t('footer.disclaimer')}
        </p>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4 whitespace-nowrap text-[10px] sm:text-sm text-immigo-gray-600 dark:text-immigo-gray-300">
          <span>&copy; {currentYear} ImmiGO</span>
          <button
            type="button"
            onClick={() => setShowTerms(true)}
            className="hover:text-deep-navy dark:hover:text-white underline underline-offset-2 transition-colors"
          >
            {t('footer.terms')}
          </button>
          <button
            type="button"
            onClick={() => setShowPrivacy(true)}
            className="hover:text-deep-navy dark:hover:text-white underline underline-offset-2 transition-colors"
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
