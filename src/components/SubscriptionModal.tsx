import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CreditCard } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose }) => {
  const { t, i18n } = useTranslation('settings');
  const isArabic = i18n.language === 'ar-SA';
  const modalRef = useFocusTrap(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" role="presentation" onClick={onClose}>
      <div
        ref={modalRef}
        tabIndex={-1}
        dir={isArabic ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-title"
        className="bg-star-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 outline-none"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-art-blue-100">
              <CreditCard className="w-5 h-5 text-art-blue-700" />
            </div>
            <h2 id="subscription-title" className="text-xl font-bold text-deep-navy dark:text-gray-100 font-display">
              {t('subscription.title')}
            </h2>
          </div>
          <button onClick={onClose} aria-label={t('subscription.close')} className="p-2 rounded-full hover:bg-immigo-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-immigo-gray-600 dark:text-gray-300" />
          </button>
        </header>

        <p className="mt-4 text-sm text-immigo-gray-600 dark:text-gray-300">{t('subscription.description')}</p>
        <p className="mt-4 inline-flex rounded-full bg-immigo-gray-100 dark:bg-gray-700 px-3 py-1 text-sm font-semibold text-immigo-gray-600 dark:text-gray-300">
          {t('subscription.unavailable')}
        </p>
      </div>
    </div>
  );
};
