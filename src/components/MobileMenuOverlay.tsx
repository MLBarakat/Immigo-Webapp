import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Settings, LogOut, CreditCard, LifeBuoy, Share2 } from 'lucide-react';
import { DisplayUser } from '../types/user';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface MobileMenuOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAppSettings: () => void;
  onOpenAccountSettings: () => void;
  onManageSubscription: () => void;
  onOpenHelpSupport: () => void;
  onOpenInviteFriends: () => void;
  onSignOut: () => void;
  user: DisplayUser;
}

export const MobileMenuOverlay: React.FC<MobileMenuOverlayProps> = ({
  isOpen,
  onClose,
  onOpenAppSettings,
  onOpenAccountSettings,
  onManageSubscription,
  onOpenHelpSupport,
  onOpenInviteFriends,
  onSignOut,
  user,
}) => {
  if (!isOpen) return null;

  return <MobileMenuContent {...{ onClose, onOpenAppSettings, onOpenAccountSettings, onManageSubscription, onOpenHelpSupport, onOpenInviteFriends, onSignOut, user }} />;
};

type MobileMenuContentProps = Omit<MobileMenuOverlayProps, 'isOpen'>;

function MobileMenuContent({ onClose, onOpenAppSettings, onOpenAccountSettings, onManageSubscription, onOpenHelpSupport, onOpenInviteFriends, onSignOut, user }: MobileMenuContentProps): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const isArabic = i18n.language === 'ar-SA';
  const modalRef = useFocusTrap(true);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 lg:hidden" role="presentation" onClick={onClose}>
      <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="mobile-menu-title" dir={isArabic ? 'rtl' : 'ltr'} className={`absolute inset-y-0 ${isArabic ? 'right-0' : 'left-0'} w-4/5 max-w-sm bg-immigo-gray-50 shadow-2xl flex flex-col outline-none`} onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between p-4 border-b border-immigo-gray-200">
          <h2 id="mobile-menu-title" className="text-xl font-bold text-deep-navy font-display">{t('menu.title')}</h2>
          <button onClick={onClose} aria-label={t('menu.close')} className="p-2 text-immigo-gray-600 rounded-full hover:bg-immigo-gray-200">
            <X className="w-6 h-6" />
          </button>
        </header>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <button onClick={() => handleAction(onOpenAccountSettings)} className={`w-full flex items-center p-3 ${isArabic ? 'space-x-reverse space-x-3' : 'space-x-3'} ${isArabic ? 'text-right' : 'text-left'} rounded-lg hover:bg-immigo-gray-200`}>
            <div className="flex flex-shrink-0 items-center justify-center w-10 h-10 rounded-full bg-art-blue-100 text-art-blue-700 font-bold">
              {user.initials}
            </div>
            <div className="min-w-0">
              <span className="block font-semibold text-deep-navy">{t('menu.accountSettings')}</span>
              <span className="block text-sm text-immigo-gray-600 truncate">{user.name}</span>
            </div>
          </button>

          <button onClick={() => handleAction(onOpenAppSettings)} className={`w-full flex items-center p-3 ${isArabic ? 'space-x-reverse space-x-3' : 'space-x-3'} ${isArabic ? 'text-right' : 'text-left'} rounded-lg hover:bg-immigo-gray-200`}>
            <Settings className="w-6 h-6 flex-shrink-0 text-immigo-gray-700" />
            <span className="font-semibold text-deep-navy">{t('menu.applicationSettings')}</span>
          </button>

          <button onClick={() => handleAction(onManageSubscription)} className={`w-full flex items-center p-3 ${isArabic ? 'space-x-reverse space-x-3' : 'space-x-3'} ${isArabic ? 'text-right' : 'text-left'} rounded-lg hover:bg-immigo-gray-200`}>
            <CreditCard className="w-6 h-6 flex-shrink-0 text-immigo-gray-700" />
            <span className={`flex-1 font-semibold text-deep-navy ${isArabic ? 'text-right' : 'text-left'}`}>{t('menu.manageSubscription')}</span>
            <span className={`flex-shrink-0 rounded-full bg-art-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-art-blue-700 ring-1 ring-inset ring-art-blue-200 dark:bg-art-blue-900/40 dark:text-art-blue-200 dark:ring-art-blue-800 ${isArabic ? 'mr-auto' : 'ml-auto'}`}>
              {t('menu.freePlan')}
            </span>
          </button>

          <button onClick={() => handleAction(onOpenHelpSupport)} className={`w-full flex items-center p-3 ${isArabic ? 'space-x-reverse space-x-3' : 'space-x-3'} ${isArabic ? 'text-right' : 'text-left'} rounded-lg hover:bg-immigo-gray-200`}>
            <LifeBuoy className="w-6 h-6 flex-shrink-0 text-immigo-gray-700" />
            <span className="font-semibold text-deep-navy">{t('menu.helpSupport')}</span>
          </button>

          <button onClick={() => handleAction(onOpenInviteFriends)} className={`w-full flex items-center p-3 ${isArabic ? 'space-x-reverse space-x-3' : 'space-x-3'} ${isArabic ? 'text-right' : 'text-left'} rounded-lg hover:bg-immigo-gray-200`}>
            <Share2 className="w-6 h-6 flex-shrink-0 text-immigo-gray-700" />
            <span className="font-semibold text-deep-navy">{t('menu.inviteFriends')}</span>
          </button>

          <div role="separator" className="mx-3 mt-3 border-t border-immigo-gray-200 dark:border-gray-700" />
        </nav>

        <footer className="p-4">
          <button onClick={() => handleAction(onSignOut)} className={`w-full flex items-center p-3 ${isArabic ? 'space-x-reverse space-x-3' : 'space-x-3'} ${isArabic ? 'text-right' : 'text-left'} rounded-lg hover:bg-immigo-gray-200`}>
            <LogOut className="w-6 h-6 text-art-red-600" />
            <span className="font-semibold text-art-red-600">{t('menu.logout')}</span>
          </button>
        </footer>
      </div>
    </div>
  );
};
