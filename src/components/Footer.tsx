import React, { useState } from 'react';
import { TermsModal } from './TermsModal';
import { PrivacyModal } from './PrivacyModal';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  return (
    <footer className="w-full bg-star-white dark:bg-gray-800 text-immigo-gray-600 dark:text-immigo-gray-400 text-center py-2.5 px-4 text-xs sm:text-sm border-t border-immigo-gray-200 dark:border-gray-700 mt-auto flex-shrink-0">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <p className="text-immigo-gray-500 text-[11px] sm:text-xs text-center sm:text-left">
          ImmiGO is an independent educational tool not affiliated with USCIS or the U.S. Government. Not legal advice.
        </p>
        <div className="flex items-center gap-4 text-immigo-gray-600 dark:text-immigo-gray-300 flex-shrink-0">
          <span>&copy; {currentYear} ImmiGO</span>
          <button
            type="button"
            onClick={() => setShowTerms(true)}
            className="hover:text-deep-navy dark:hover:text-white underline underline-offset-2 transition-colors"
          >
            Terms
          </button>
          <button
            type="button"
            onClick={() => setShowPrivacy(true)}
            className="hover:text-deep-navy dark:hover:text-white underline underline-offset-2 transition-colors"
          >
            Privacy
          </button>
        </div>
      </div>

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </footer>
  );
};